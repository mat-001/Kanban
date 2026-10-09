import {
  DATA_VERSION, LOG_DAYS, LOG_KINDS, LOG_MAX, RANK, RECOVERY_DAYS, TOK
} from "./constants.js";
import { clampEffort, clampSetting, cleanLink, isRealDate } from "./dates.js";

// Umwandlungen für alte Datenformate: MIGRATIONS[alteVersion] wandelt die Aufgabenliste in die nächste Version um.
// Daten einer NEUEREN Version werden nur gelesen, nie überschrieben.
export const MIGRATIONS = {};

export function migrate(tasks, from, target = DATA_VERSION, steps = MIGRATIONS) {
  for (let version = from; version < target; version++) {
    if (typeof steps[version] !== "function") {
      throw new Error(`Für die Umstellung von Datenversion ${version} fehlt eine Migration.`);
    }
    tasks = steps[version](tasks);
  }
  return tasks;
}

const isNumber = value => typeof value === "number" && Number.isFinite(value);

export function cleanTask(value) {
  if (!value || typeof value.t !== "string" || !value.t.trim()) return null;

  const created = isNumber(value.created) ? value.created
    : isNumber(value.id) ? value.id
      : Date.now();
  const task = {
    id: isNumber(value.id) ? value.id : created,
    t: value.t.trim().slice(0, 300),
    c: TOK.includes(value.c) ? value.c : "todo",
    p: typeof value.p === "string" && Object.hasOwn(RANK, value.p) ? value.p : "mittel",
    created,
    due: isRealDate(value.due) ? value.due : "",
    e: clampEffort(isNumber(value.e) ? value.e : 0)
  };
  const link = cleanLink(value.l);
  if (link) task.l = link;

  if (task.c === "done" && isNumber(value.doneAt)) task.doneAt = value.doneAt;
  if (isNumber(value.since)) task.since = value.since;
  return task;
}

// Standard-Speicher. Der Zugriff auf window.localStorage passiert erst beim Aufruf, damit ein blockierter
// Speicher (z. B. im privaten Fenster) wie bisher von den try/catch-Blöcken abgefangen wird.
export const browserStorage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: key => window.localStorage.removeItem(key)
};

// Erzeugt den Datenspeicher. Jeder Aufruf liefert eine eigene, unabhängige Instanz.
// `storage` kann ersetzt werden (z. B. durch ein Objekt mit getItem/setItem/removeItem in Tests).
export function createStore({ storage = browserStorage } = {}) {
  const state = {
    tasks: [],
    log: null,
    buffer: 1,
    step: 7,
    loadProblem: "",
    recoveryCopyAttempted: false,
    recoveryCopySaved: false,
    storedVersion: 1, // Datenversion der gelesenen Daten (ohne Angabe gilt 1)
    readOnly: false, // true, wenn die Daten von einer neueren Version stammen: lesen ja, schreiben nie
    rawTasks: null, // nur bei readOnly: unveränderte Originaldaten für den Export
    rawLog: null
  };

  // Kleine Ereignisliste statt document.dispatchEvent: "saved" und "failed" melden das Ergebnis von save().
  const listeners = { saved: new Set(), failed: new Set() };
  const emit = name => listeners[name].forEach(listener => listener());
  function on(name, listener) {
    listeners[name].add(listener);
    return () => listeners[name].delete(listener);
  }

  let raw = null;
  let storageReadFailed = false;
  try {
    raw = storage.getItem("kanban");
  } catch (error) {
    storageReadFailed = true;
    state.loadProblem = "Gespeicherte Aufgaben konnten nicht gelesen werden.";
  }

  try {
    const versionText = storage.getItem("kanban_version");
    const version = Number(versionText);
    if (versionText !== null && Number.isInteger(version) && version >= 1) state.storedVersion = version;
  } catch (error) {
    // Ohne lesbare Versionsangabe gilt Version 1.
  }
  state.readOnly = state.storedVersion > DATA_VERSION;

  if (raw !== null) {
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      // Invalid data is reported below and kept as a recovery copy when possible.
    }

    if (state.readOnly && Array.isArray(data)) state.rawTasks = data;
    if (Array.isArray(data) && !state.readOnly) {
      try {
        data = migrate(data, state.storedVersion);
      } catch (error) {
        data = null;
        state.loadProblem = "Die gespeicherten Daten konnten nicht auf das aktuelle Format umgestellt werden.";
      }
    }

    if (Array.isArray(data)) {
      const usedIds = new Set();
      let invalidCount = 0;

      data.forEach(value => {
        const task = cleanTask(value);
        if (!task) {
          invalidCount++;
          return;
        }
        while (usedIds.has(task.id)) task.id++;
        usedIds.add(task.id);
        state.tasks.push(task);
      });

      if (invalidCount) {
        state.loadProblem = `${invalidCount} gespeicherte Einträge waren unlesbar und wurden übersprungen.`;
      }
    } else if (!state.loadProblem) {
      state.loadProblem = "Die gespeicherten Aufgaben waren beschädigt und konnten nicht gelesen werden.";
    }

    if (state.loadProblem && !state.readOnly) {
      state.recoveryCopyAttempted = true;
      try {
        storage.setItem("kanban_defekt", raw);
        state.recoveryCopySaved = true;
        try {
          storage.setItem("kanban_defekt_ts", String(Date.now()));
        } catch (error) {
          // Ohne Zeitstempel bekommt die Kopie beim nächsten Start einen.
        }
      } catch (error) {
        state.recoveryCopySaved = false;
      }
    }
  }

  if (raw === null && !storageReadFailed) {
    const now = Date.now();
    state.tasks = [{
      id: now,
      t: "Beispielaufgabe: Ziehe mich in eine andere Spalte",
      c: "todo",
      p: "mittel",
      created: now,
      due: "",
      e: 1
    }];
    save();
  }

  // Räumt eine alte Sicherheitskopie auf. Solange ein Problem besteht oder die Daten schreibgeschützt sind,
  // bleibt sie unberührt. Kopien ohne Zeitstempel (aus älteren Versionen) bekommen jetzt einen.
  function cleanupRecoveryCopy() {
    if (state.readOnly || state.loadProblem) return;
    try {
      if (storage.getItem("kanban_defekt") === null) return;
      const savedAt = Number(storage.getItem("kanban_defekt_ts"));
      if (!Number.isFinite(savedAt) || savedAt <= 0) {
        storage.setItem("kanban_defekt_ts", String(Date.now()));
      } else if (Date.now() - savedAt > RECOVERY_DAYS * 864e5) {
        storage.removeItem("kanban_defekt");
        storage.removeItem("kanban_defekt_ts");
      }
    } catch (error) {
      // Aufräumen ist nicht kritisch.
    }
  }
  cleanupRecoveryCopy();

  function readSetting(key, fallback) {
    try {
      const value = storage.getItem(key);
      return value === null ? fallback : clampSetting(parseInt(value, 10) || 0);
    } catch (error) {
      return fallback;
    }
  }

  state.buffer = readSetting("kanban_buf", state.buffer);
  state.step = readSetting("kanban_age", state.step);

  function save() {
    if (state.readOnly) return false; // Daten einer neueren Version nie überschreiben
    try {
      storage.setItem("kanban_version", String(DATA_VERSION));
      storage.setItem("kanban", JSON.stringify(state.tasks));
      emit("saved");
      return true;
    } catch (error) {
      emit("failed");
      return false;
    }
  }

  function saveSetting(key, value) {
    if (state.readOnly) return false;
    const storageKey = key === "buffer" ? "kanban_buf" : "kanban_age";
    try {
      storage.setItem(storageKey, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  try {
    state.log = JSON.parse(storage.getItem("kanban_log"));
  } catch (error) {
    state.log = null;
  }
  if (state.readOnly && Array.isArray(state.log)) state.rawLog = state.log;

  function pruneLog() {
    const oldest = Date.now() - LOG_DAYS * 864e5;
    state.log = state.log
      .filter(entry =>
        entry &&
        isNumber(entry.ts) &&
        entry.ts >= oldest &&
        LOG_KINDS.includes(entry.k) &&
        typeof entry.t === "string")
      .sort((a, b) => a.ts - b.ts)
      .slice(-LOG_MAX);
  }

  // Schreibt das Protokoll in den Browser-Speicher. state.log bleibt dabei immer vollständig:
  // Ist der Speicher voll, wird nur eine gekürzte Kopie mit den neuesten Einträgen abgelegt
  // (bis hinunter auf ein Sechzehntel). Rückgabe: true, wenn irgendeine Fassung geschrieben wurde.
  function saveLog() {
    if (state.readOnly) return false;
    let entries = state.log;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        storage.setItem("kanban_log", JSON.stringify(entries));
        return true;
      } catch (error) {
        entries = entries.slice(Math.ceil(entries.length / 2));
      }
    }
    return false;
  }

  // Beim Start nur schreiben, wenn sich am Protokoll etwas geändert hat (neu aufgebaut oder bereinigt).
  let logChanged = false;
  if (!Array.isArray(state.log)) {
    state.log = [];
    state.tasks.forEach(task => {
      state.log.push({ ts: task.created, k: "add", t: task.t });
      if (task.doneAt) state.log.push({ ts: task.doneAt, k: "done", t: task.t });
    });
    logChanged = true;
  }
  const entriesBeforePruning = state.log.length;
  pruneLog();
  if (logChanged || state.log.length !== entriesBeforePruning) saveLog();

  function addLog(kind, title) {
    const entry = { ts: Date.now(), k: kind, t: String(title).slice(0, 60) };
    state.log.push(entry);
    pruneLog();
    saveLog();
    return entry;
  }

  return { state, on, save, saveSetting, saveLog, pruneLog, addLog };
}
