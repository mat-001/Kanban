// AUTOMATISCH ERZEUGT von build.cjs aus src/*.js. Nicht von Hand ändern, sondern src/ ändern und neu bauen.
(function () {
  "use strict";
  const __modules = {};
  const __cache = {};
  function __require(name) {
    if (!(name in __cache)) __cache[name] = __modules[name]();
    return __cache[name];
  }

  __modules["constants.js"] = function () {
    // Reine Konstanten ohne Abhängigkeiten. Jedes andere Modul darf dieses importieren.

    const RANK = Object.freeze({ hoch: 0, mittel: 1, niedrig: 2 });
    const TOK = Object.freeze(["todo", "doing", "done"]);

    const COLS = [
      ["todo", "Zu erledigen", "Sortiert nach: verpasster Start, Priorität (inkl. Alterung), spätester Start, Ablage"],
      ["doing", "In Arbeit", "Sortiert nach: verpasster Start, Priorität (inkl. Alterung), spätester Start, Ablage"],
      ["done", "Erledigt", "Sortiert nach: Zeitpunkt des Erledigens, neueste oben"]
    ];

    const LOG_MAX = 1000;
    const LOG_DAYS = 30;
    const RECOVERY_DAYS = 30;
    const LOG_KINDS = Object.freeze(["add", "start", "done", "back", "del"]);

    // Version des Datenformats im Browser-Speicher (Schlüssel "kanban_version"). Ändert sich das Format,
    // DATA_VERSION um 1 erhöhen und in storage.js unter MIGRATIONS[alteVersion] eine Umwandlung ergänzen.
    const DATA_VERSION = 1;

    const LBL = Object.freeze({
      add: "Angelegt",
      start: "In Arbeit gestartet",
      done: "Erledigt",
      back: "Zurückgeschoben",
      del: "Gelöscht"
    });
    return { RANK, TOK, COLS, LOG_MAX, LOG_DAYS, RECOVERY_DAYS, LOG_KINDS, DATA_VERSION, LBL };
  };

  __modules["dates.js"] = function () {
    // Reine Datums- und Zahlenfunktionen. Keine Abhängigkeiten, kein Zugriff auf Browser-Speicher oder DOM.

    const DAY_MS = 864e5;
    const MAX_EFFORT = 1000; // Stunden pro Aufgabe
    const MAX_SETTING = 365; // Tage für Sicherheitspuffer und Alterung
    const MAX_LINK = 500;

    const fmt = timestamp => new Date(timestamp).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const fmtD = date => new Date(date + "T00:00").toLocaleDateString("de-DE");
    const ymd = date =>
      date.getFullYear() + "-" +
      String(date.getMonth() + 1).padStart(2, "0") + "-" +
      String(date.getDate()).padStart(2, "0");
    const today = () => ymd(new Date());
    const ageDays = task => Math.floor((Date.now() - (task.since || task.created)) / DAY_MS);
    const isWorkday = date => date.getDay() !== 0 && date.getDay() !== 6;
    const clampEffort = value => Math.min(MAX_EFFORT, Math.max(0, Number.isFinite(value) ? value : 0));
    const clampSetting = value => Math.min(MAX_SETTING, Math.max(0, Number.isFinite(value) ? Math.trunc(value) : 0));

    const cleanLink = text => {
      if (typeof text !== "string") return "";
      let link = text.trim();
      // Leerzeichen in Dateipfaden (z. B. "Meine Dokumente") werden als %20 geschrieben
      if (/^file:\/\//i.test(link)) link = link.replace(/ /g, "%20");
      return link.length <= MAX_LINK && /^(https?|file):\/\/\S+$/i.test(link) ? link : "";
    };

    const isRealDate = text => {
      if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
      const [year, month, day] = text.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    };

    function lastStart(task, buffer) {
      if (!task.due) return null;

      // Die Werte werden hier noch einmal begrenzt, damit die Rechenzeit nie von ihnen abhängt.
      const workdays = Math.max(1, Math.ceil(clampEffort(task.e) / 8)) + clampSetting(buffer);
      const date = new Date(task.due + "T00:00");

      // Der Termin zählt als erster Arbeitstag; fällt er auf ein Wochenende, beginnt die Zählung am Freitag davor.
      while (!isWorkday(date)) date.setDate(date.getDate() - 1);

      // Je 5 weitere Arbeitstage sind genau eine Kalenderwoche; nur der Rest wird einzeln zurückgezählt.
      const remaining = workdays - 1;
      date.setDate(date.getDate() - Math.floor(remaining / 5) * 7);
      for (let step = 0; step < remaining % 5; step++) {
        do date.setDate(date.getDate() - 1); while (!isWorkday(date));
      }
      return ymd(date);
    }
    return { MAX_EFFORT, MAX_SETTING, MAX_LINK, fmt, fmtD, ymd, today, ageDays, isWorkday, clampEffort, clampSetting, cleanLink, isRealDate, lastStart };
  };

  __modules["storage.js"] = function () {
    const {
      DATA_VERSION, LOG_DAYS, LOG_KINDS, LOG_MAX, RANK, RECOVERY_DAYS, TOK
    } = __require("constants.js");
    const { clampEffort, clampSetting, cleanLink, isRealDate } = __require("dates.js");

    // Umwandlungen für alte Datenformate: MIGRATIONS[alteVersion] wandelt die Aufgabenliste in die nächste Version um.
    // Daten einer NEUEREN Version werden nur gelesen, nie überschrieben.
    const MIGRATIONS = {};

    function migrate(tasks, from, target = DATA_VERSION, steps = MIGRATIONS) {
      for (let version = from; version < target; version++) {
        if (typeof steps[version] !== "function") {
          throw new Error(`Für die Umstellung von Datenversion ${version} fehlt eine Migration.`);
        }
        tasks = steps[version](tasks);
      }
      return tasks;
    }

    const isNumber = value => typeof value === "number" && Number.isFinite(value);

    function cleanTask(value) {
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
    const browserStorage = {
      getItem: key => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: key => window.localStorage.removeItem(key)
    };

    // Erzeugt den Datenspeicher. Jeder Aufruf liefert eine eigene, unabhängige Instanz.
    // `storage` kann ersetzt werden (z. B. durch ein Objekt mit getItem/setItem/removeItem in Tests).
    function createStore({ storage = browserStorage } = {}) {
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
    return { MIGRATIONS, migrate, cleanTask, browserStorage, createStore };
  };

  __modules["backup.js"] = function () {
    const { DATA_VERSION, LBL } = __require("constants.js");
    const { MAX_SETTING, ymd } = __require("dates.js");
    const { cleanTask, migrate } = __require("storage.js");

    const $ = id => document.getElementById(id);

    function showMessage(text, success = true) {
      const message = $("dmsg");
      message.textContent = text;
      message.className = "msg" + (success ? " ok" : "");
      message.hidden = false;
    }

    // Startet den Download über einen kurzlebigen Link. Ob der Browser die Datei danach wirklich speichert
    // (oder der Nutzer abbricht), lässt sich von der Seite aus nicht feststellen.
    function downloadFile(name, text) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }

    function createBackup(state) {
      return {
        format: "kanban-sicherung",
        // Bei schreibgeschützten Daten einer neueren Version werden die Originaldaten unverändert gesichert.
        version: state.readOnly ? state.storedVersion : DATA_VERSION,
        exportedAt: new Date().toISOString(),
        tasks: state.readOnly && state.rawTasks ? state.rawTasks : state.tasks,
        log: state.readOnly && state.rawLog ? state.rawLog : state.log,
        settings: { buffer: state.buffer, step: state.step }
      };
    }

    function importTasks(state, tasks) {
      const existing = new Map(state.tasks.map(task => [task.id, task]));
      const fingerprints = new Set(state.tasks.map(task =>
        JSON.stringify([task.t, task.c, task.p, task.created, task.due, task.e, task.doneAt, task.since])
      ));
      let added = 0;
      let skipped = 0;
      let invalid = 0;

      tasks.forEach(rawTask => {
        const task = cleanTask(rawTask);
        if (!task) {
          invalid++;
          return;
        }

        const current = existing.get(task.id);
        const fingerprint = JSON.stringify([
          task.t, task.c, task.p, task.created, task.due, task.e, task.doneAt, task.since
        ]);
        if ((current && current.t === task.t) || fingerprints.has(fingerprint)) {
          skipped++;
          return;
        }

        while (existing.has(task.id)) task.id++;
        state.tasks.push(task);
        existing.set(task.id, task);
        fingerprints.add(fingerprint);
        added++;
      });

      return { added, skipped, invalid };
    }

    function importLog(store, entries) {
      const { state, pruneLog } = store;
      const eventKey = event => `${event.ts}|${event.k}|${event.t}`;
      const existing = new Set(state.log.map(eventKey));

      (Array.isArray(entries) ? entries : []).forEach(event => {
        if (!event ||
          !Number.isFinite(event.ts) ||
          typeof event.t !== "string" ||
          !Object.hasOwn(LBL, event.k)) return;

        const cleanEvent = { ts: event.ts, k: event.k, t: event.t.slice(0, 60) };
        const key = eventKey(cleanEvent);
        if (existing.has(key)) return;
        state.log.push(cleanEvent);
        existing.add(key);
      });

      pruneLog();
    }

    function importSettings(store, settings) {
      const { state, saveSetting } = store;
      const validSetting = value => Number.isInteger(value) && value >= 0 && value <= MAX_SETTING;
      const values = [
        ["buffer", "buf"],
        ["step", "age"]
      ];
      const applied = [];
      const failed = [];

      values.forEach(([key, inputId]) => {
        const value = settings[key];
        if (!validSetting(value)) return;

        state[key] = value;
        applied.push(key);
        if (!saveSetting(key, value)) failed.push(key);
        $(inputId).value = value;
      });
      return { applied, failed };
    }

    async function importFile(store, file, onChange) {
      const { state, save, saveLog } = store;
      if (state.readOnly) {
        throw new Error(
          "Diese Daten stammen von einer neueren Version der Seite und sind schreibgeschützt. " +
          "Importieren ist deshalb nicht möglich."
        );
      }
      if (file.size > 2e6) throw new Error("Die Datei ist zu groß (über 2 MB).");

      let backup;
      try {
        backup = JSON.parse(await file.text());
      } catch (error) {
        throw new Error("Die Datei ist keine gültige Sicherung.");
      }
      if (!backup || typeof backup !== "object") {
        throw new Error("In der Datei wurden keine Aufgaben gefunden.");
      }

      const fileVersion = backup.version === undefined ? 1 : backup.version;
      if (!Number.isInteger(fileVersion) || fileVersion < 1) {
        throw new Error("Die Sicherung hat eine ungültige Versionsnummer.");
      }
      if (fileVersion > DATA_VERSION) {
        throw new Error(
          `Die Sicherung stammt von einer neueren Version der Seite (Datenversion ${fileVersion}, ` +
          `hier unterstützt: ${DATA_VERSION}) und kann hier nicht gelesen werden.`
        );
      }
      if (!Array.isArray(backup.tasks)) {
        throw new Error("In der Datei wurden keine Aufgaben gefunden.");
      }

      const result = importTasks(state, migrate(backup.tasks, fileVersion));
      importLog(store, backup.log);
      const settings = importSettings(store, backup.settings || {});
      const settingNames = { buffer: "Sicherheitspuffer", step: "Alterung" };
      const names = keys => keys.map(key => settingNames[key]).join(" und ");
      save();
      saveLog();
      onChange();

      showMessage(
        `${result.added} Aufgabe${result.added === 1 ? "" : "n"} hinzugefügt, ` +
        `${result.skipped} schon vorhanden` +
        (result.invalid ? `, ${result.invalid} ungültig übersprungen` : "") +
        "." +
        (settings.applied.length
          ? ` Einstellungen aus der Datei wurden übernommen (${names(settings.applied)}).`
          : "") +
        (settings.failed.length
          ? ` ${names(settings.failed)} ${settings.failed.length === 1 ? "konnte" : "konnten"} nicht dauerhaft gespeichert werden.`
          : ""),
        !settings.failed.length
      );
    }

    function initBackup({ store, onChange }) {
      $("exp").onclick = () => {
        const backup = createBackup(store.state);
        const filename = `kanban-sicherung-${ymd(new Date())}.json`;
        try {
          downloadFile(filename, JSON.stringify(backup, null, 1));
          showMessage(`Sicherung mit ${backup.tasks.length} Aufgaben wird heruntergeladen.`);
        } catch (error) {
          showMessage("Der Download konnte nicht gestartet werden.", false);
        }
      };

      $("imp").onclick = () => $("impfile").click();
      $("impfile").onchange = async event => {
        const file = event.target.files[0];
        event.target.value = "";
        if (!file) return;

        try {
          await importFile(store, file, onChange);
        } catch (error) {
          showMessage(error.message || "Der Import ist fehlgeschlagen.", false);
        }
      };
    }
    return { initBackup };
  };

  __modules["summary.js"] = function () {
    const { LBL, LOG_DAYS } = __require("constants.js");
    const { lastStart, today } = __require("dates.js");

    const $ = id => document.getElementById(id);

    function countEvents(events) {
      return events.reduce((counts, event) => {
        counts[event.k] = (counts[event.k] || 0) + 1;
        return counts;
      }, {});
    }

    function appendTextElement(parent, tag, text, className = "") {
      const element = document.createElement(tag);
      element.textContent = text;
      if (className) element.className = className;
      parent.appendChild(element);
      return element;
    }

    function showSummary(state) {
      const daysInput = $("days");
      let days = Math.round(Number(daysInput.value));
      if (!Number.isFinite(days) || days < 1) days = 1;
      days = Math.min(days, LOG_DAYS);
      daysInput.value = days;

      const hours = days * 24;
      const periodLabel = days === 1 ? "24 Stunden" : `${days} Tage`;
      $("stitle").textContent = `Die letzten ${periodLabel}`;

      const box = $("sum");
      box.replaceChildren();
      const cutoff = Date.now() - hours * 36e5;
      const events = state.log
        .filter(event => event.ts >= cutoff)
        .sort((a, b) => b.ts - a.ts);
      const counts = countEvents(events);
      let todoCount = 0;
      let doingCount = 0;
      let missedCount = 0;
      const currentDay = today();

      state.tasks.forEach(task => {
        if (task.c === "todo") todoCount++;
        if (task.c === "doing") doingCount++;
        if (task.c !== "done" && task.due && lastStart(task, state.buffer) < currentDay) {
          missedCount++;
        }
      });

      appendTextElement(box, "h3", "Bilanz");
      appendTextElement(
        box,
        "p",
        `Angelegt: ${counts.add || 0} · In Arbeit gestartet: ${counts.start || 0} · ` +
        `Erledigt: ${counts.done || 0} · Gelöscht: ${counts.del || 0}`,
        "s-bilanz"
      );
      appendTextElement(box, "h3", "Aktueller Stand");
      appendTextElement(
        box,
        "p",
        `Zu erledigen: ${todoCount} · In Arbeit: ${doingCount} · Mit verpasstem Start: ${missedCount}`,
        "s-stand"
      );
      appendTextElement(box, "h3", "Verlauf");

      if (!events.length) {
        appendTextElement(box, "p", `In den letzten ${periodLabel} ist nichts passiert.`, "s-verlauf");
      } else {
        const list = document.createElement("ul");
        list.className = "s-verlauf";
        events.forEach(event => {
          const timestamp = new Date(event.ts).toLocaleString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          });
          appendTextElement(list, "li", `${timestamp} – ${LBL[event.k]}: ${event.t}`);
        });
        box.appendChild(list);
      }

      const dialog = $("sdlg");
      if (!dialog.open) dialog.showModal();
    }

    function initSummary({ store }) {
      const { state } = store;
      const dialog = $("sdlg");
      $("sumbtn").onclick = () => {
        $("days").value = 1;
        showSummary(state);
      };
      $("days").onchange = () => showSummary(state);
      $("sclose").onclick = () => dialog.close();
      dialog.onclick = event => {
        if (event.target === dialog) dialog.close();
      };
    }
    return { initSummary };
  };

  __modules["task.js"] = function () {
    // Aufgaben-Aktionen. Der Datenspeicher wird übergeben, nicht global gesucht.
    function createTaskActions(store) {
      const { addLog, save, saveLog, state } = store;

      function addTask(task) {
        state.tasks.push(task);
        addLog("add", task.t);
        save();
      }

      function updateTask(id, updates) {
        const task = state.tasks.find(item => item.id === id);
        if (!task) return false;

        Object.assign(task, updates);
        save();
        return true;
      }

      function moveTask(task, column) {
        if ((task.c === "done" && column !== "done") || (task.c === "doing" && column === "todo")) {
          task.since = Date.now();
        }
        task.c = column;
        task.doneAt = column === "done" ? Date.now() : undefined;

        const kind = column === "done" ? "done" : column === "doing" ? "start" : "back";
        addLog(kind, task.t);
        save();
      }

      let undoItem = null;

      function dismissUndo() {
        undoItem = null;
      }

      function deleteTask(task) {
        const entry = addLog("del", task.t);
        state.tasks = state.tasks.filter(item => item.id !== task.id);
        save();
        undoItem = { task, entry };
      }

      function undoDelete() {
        if (!undoItem) return false;

        const { task, entry } = undoItem;
        while (state.tasks.some(item => item.id === task.id)) task.id++;
        state.tasks.push(task);
        state.log = state.log.filter(item => item !== entry);
        saveLog();
        save();
        undoItem = null;
        return true;
      }

      return { addTask, updateTask, moveTask, dismissUndo, deleteTask, undoDelete };
    }
    return { createTaskActions };
  };

  __modules["sort.js"] = function () {
    const { RANK } = __require("constants.js");
    const { ageDays, lastStart, today } = __require("dates.js");

    const effRank = (task, step) =>
      Math.max(0, RANK[task.p] - (step ? Math.floor(ageDays(task) / step) : 0));

    function sorter(column, step, buffer) {
      if (column === "done") {
        return (a, b) => (b.doneAt || 0) - (a.doneAt || 0);
      }

      const todayDate = today();
      const details = new Map();
      const sortDetails = task => {
        if (!details.has(task)) {
          const start = lastStart(task, buffer);
          details.set(task, {
            missed: start && start < todayDate ? 0 : 1,
            rank: effRank(task, step),
            start: start || "9999"
          });
        }
        return details.get(task);
      };

      return (a, b) => {
        const left = sortDetails(a);
        const right = sortDetails(b);
        return left.missed - right.missed ||
          left.rank - right.rank ||
          left.start.localeCompare(right.start) ||
          a.created - b.created;
      };
    }
    return { effRank, sorter };
  };

  __modules["ui-board.js"] = function () {
    const { COLS, RANK } = __require("constants.js");
    const { ageDays, fmt, fmtD, lastStart, today } = __require("dates.js");
    const { effRank, sorter } = __require("sort.js");

    const $ = id => document.getElementById(id);

    function createActionButton(container, task, label, title, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.setAttribute("aria-label", `${title}: ${task.t.slice(0, 60)}`);
      button.onclick = action;
      container.appendChild(button);
    }

    function createTaskMetadata(task, column, settings) {
      const metadata = document.createElement("div");
      metadata.className = "meta";

      const currentDate = today();
      const isOpen = column !== "done";
      const age = ageDays(task);
      const overdue = task.due && isOpen && task.due < currentDate;
      const priorityIncrease = isOpen ? RANK[task.p] - effRank(task, settings.step) : 0;
      const latestStart = task.due && isOpen ? lastStart(task, settings.buffer) : null;
      const waiting = isOpen && age >= 1
        ? `<br>Wartet seit ${age} Tag${age > 1 ? "en" : ""}`
        : "";
      const effort = task.e ? `<br>Aufwand: ${task.e} Std.` : "";
      const due = task.due
        ? `<br><span class="${overdue ? "late" : ""}">Termin: ${fmtD(task.due)}${overdue ? " (überfällig)" : ""}</span>`
        : "";
      const start = latestStart
        ? `<br><span class="${latestStart <= currentDate ? "late" : ""}">Spätester Start (mit Puffer): ` +
        `${fmtD(latestStart)}${latestStart < currentDate ? " (verpasst)" : latestStart === currentDate ? " (heute!)" : ""}</span>`
        : "";
      const completed = task.doneAt ? `<br>Erledigt: ${fmt(task.doneAt)}` : "";
      const rank = task.p[0].toUpperCase() + task.p.slice(1);
      const aging = priorityIncrease
        ? ` (durch Alterung ${priorityIncrease} Stufe${priorityIncrease > 1 ? "n" : ""} höher)`
        : "";

      metadata.innerHTML =
        `Priorität: ${rank}${aging}<br>Abgelegt: ${fmt(task.created)}` +
        waiting + effort + due + start + completed;
      return metadata;
    }

    // Das Board zeichnet die Spalten. Was bei Klicks passiert, kommt von außen:
    // onEdit(task) und onDelete(task) öffnen Dialog bzw. löschen, onRendered() läuft nach jedem Zeichnen.
    function createBoard({ store, actions, onEdit, onDelete, onRendered = () => { } }) {
      const { state } = store;
      const { moveTask } = actions;
      let dragId = null;

      function createTaskCard(task, columnIndex, column) {
        const card = document.createElement("div");
        card.className = `card ${task.p}`;
        card.draggable = true;
        card.ondragstart = () => {
          dragId = task.id;
          card.classList.add("drag");
        };
        card.ondragend = () => card.classList.remove("drag");

        const body = document.createElement("div");
        const title = document.createElement("div");
        title.className = "ttitle";
        title.textContent = task.t;
        body.append(title, createTaskMetadata(task, column, state));
        if (task.l) {
          const link = document.createElement("a");
          link.href = task.l;
          link.textContent = "🔗 Link öffnen";
          link.title = task.l;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.className = "tlink";
          link.draggable = false;
          body.appendChild(link);
        }

        const buttons = document.createElement("div");
        buttons.className = "mv";
        if (columnIndex > 0) {
          createActionButton(buttons, task, "←", "Eine Spalte zurück", () => {
            moveTask(task, COLS[columnIndex - 1][0]);
            render();
          });
        }
        if (columnIndex < COLS.length - 1) {
          createActionButton(buttons, task, "→", "Eine Spalte weiter", () => {
            moveTask(task, COLS[columnIndex + 1][0]);
            render();
          });
        }
        createActionButton(buttons, task, "✎", "Bearbeiten", () => onEdit(task));
        createActionButton(buttons, task, "✕", "Löschen", () => onDelete(task));
        card.append(body, buttons);
        return card;
      }

      function createColumn([key, name, subtitle], index) {
        const column = document.createElement("div");
        column.className = `col col-${key}`;

        const tasks = state.tasks
          .filter(task => task.c === key)
          .sort(sorter(key, state.step, state.buffer));
        column.innerHTML = `<h2>${name}<span>${tasks.length}</span></h2><div class="sub">${subtitle}</div>`;

        column.ondragover = event => {
          event.preventDefault();
          column.classList.add("over");
        };
        column.ondragleave = () => column.classList.remove("over");
        column.ondrop = event => {
          event.preventDefault();
          column.classList.remove("over");
          const task = state.tasks.find(item => item.id === dragId);
          if (task && task.c !== key) {
            moveTask(task, key);
            render();
          }
        };

        if (!tasks.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "Keine Aufgaben";
          column.appendChild(empty);
        } else {
          tasks.forEach(task => column.appendChild(createTaskCard(task, index, key)));
        }
        return column;
      }

      function render() {
        $("b").replaceChildren(...COLS.map(createColumn));
        onRendered();
      }

      return { render };
    }
    return { createBoard };
  };

  __modules["ui-dialogs.js"] = function () {
    const { MAX_EFFORT, MAX_SETTING, clampEffort, clampSetting, cleanLink } = __require("dates.js");

    const $ = id => document.getElementById(id);

    function resetDate(id = "d") {
      const input = $(id);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = input.outerHTML;
      input.replaceWith(wrapper.firstElementChild);
    }

    function showMessage(text, buttonText, messageId = "msg", dateId = "d") {
      const message = $(messageId);
      message.textContent = text + " ";
      if (buttonText) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "msg-action";
        button.textContent = buttonText;
        button.onclick = () => {
          resetDate(dateId);
          message.hidden = true;
        };
        message.appendChild(button);
      }
      message.hidden = false;
    }

    // Formulare und Dialoge (Anlegen, Bearbeiten, Einstellungen). `onChange` zeichnet das Board neu.
    // Rückgabe: openEdit(task), damit das Board den Bearbeiten-Dialog öffnen kann.
    function initDialogs({ store, actions, notifications, onChange }) {
      const { state, saveSetting } = store;
      const { addTask, updateTask } = actions;
      const { hideNotice, showNotice } = notifications;
      let editing = null;

      function openEdit(task) {
        editing = task.id;
        $("et").value = task.t;
        $("ep").value = task.p;
        $("ee").value = task.e || 0;
        resetDate("ed");
        $("ed").value = task.due || "";
        $("el").value = task.l || "";
        $("emsg").hidden = true;
        $("edlg").showModal();
        $("et").focus();
      }

      $("e").max = $("ee").max = MAX_EFFORT;
      $("buf").max = $("age").max = MAX_SETTING;

      // Enter speichert wie bisher, Umschalt+Enter fügt im Aufgabentext eine neue Zeile ein.
      [["t", "f"], ["et", "ef"]].forEach(([fieldId, formId]) => {
        $(fieldId).onkeydown = event => {
          if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
          event.preventDefault();
          $(formId).requestSubmit();
        };
      });

      // Dialog "Neue Aufgabe": wird bei jedem Öffnen geleert
      const newDialog = $("ndlg");
      function openNew() {
        $("t").value = "";
        $("p").value = "mittel";
        $("e").value = "1";
        resetDate();
        $("l").value = "";
        $("msg").hidden = true;
        newDialog.showModal();
        $("t").focus();
      }

      $("add").onclick = openNew;
      $("ncancel").onclick = () => newDialog.close();
      newDialog.onclick = event => {
        if (event.target === newDialog) newDialog.close();
      };

      // Erstellen-Formular
      $("f").onsubmit = event => {
        event.preventDefault();
        const titleInput = $("t");
        const title = titleInput.value.trim();
        const dueInput = $("d");
        $("msg").hidden = true;

        if (!title) {
          showMessage("Bitte eine Aufgabe eingeben.");
          titleInput.focus();
          return;
        }
        if (dueInput.validity.badInput) {
          showMessage("Der Zieltermin ist nur teilweise ausgefüllt. Bitte vollständig eingeben oder", "Termin leeren");
          return;
        }
        const effort = parseFloat($("e").value) || 0;
        if (effort > MAX_EFFORT) {
          showMessage(`Der Aufwand darf höchstens ${MAX_EFFORT} Stunden betragen.`);
          $("e").focus();
          return;
        }

        const linkText = $("l").value.trim();
        const link = cleanLink(linkText);
        if (linkText && !link) {
          showMessage("Der Link muss mit http://, https:// oder file:// beginnen und darf höchstens 500 Zeichen lang sein.");
          $("l").focus();
          return;
        }

        const now = Date.now();
        addTask({
          id: now,
          t: title,
          c: "todo",
          p: $("p").value,
          created: now,
          due: dueInput.value,
          e: clampEffort(effort),
          ...(link && { l: link })
        });
        onChange();
        newDialog.close();
      };

      // Bearbeiten-Formular
      const editDialog = $("edlg");
      $("ef").onsubmit = event => {
        event.preventDefault();
        const task = state.tasks.find(item => item.id === editing);
        if (!task) {
          editDialog.close();
          return;
        }

        const title = $("et").value.trim();
        $("emsg").hidden = true;
        if (!title) {
          showMessage("Bitte einen Aufgabentext eingeben.", "", "emsg", "ed");
          $("et").focus();
          return;
        }
        if ($("ed").validity.badInput) {
          showMessage("Der Zieltermin ist nur teilweise ausgefüllt. Bitte vollständig eingeben oder", "Termin leeren", "emsg", "ed");
          return;
        }

        const effort = parseFloat($("ee").value) || 0;
        if (effort > MAX_EFFORT) {
          showMessage(`Der Aufwand darf höchstens ${MAX_EFFORT} Stunden betragen.`, "", "emsg", "ed");
          $("ee").focus();
          return;
        }

        const linkText = $("el").value.trim();
        const link = cleanLink(linkText);
        if (linkText && !link) {
          showMessage("Der Link muss mit http://, https:// oder file:// beginnen und darf höchstens 500 Zeichen lang sein.", "", "emsg", "ed");
          $("el").focus();
          return;
        }

        updateTask(editing, {
          t: title,
          p: $("ep").value,
          due: $("ed").value,
          e: clampEffort(effort),
          l: link
        });
        onChange();
        editDialog.close();
      };

      $("ecancel").onclick = () => editDialog.close();
      editDialog.onclick = event => {
        if (event.target === editDialog) editDialog.close();
      };

      // Einstellungs-Dialog
      function bindSetting(key, inputId) {
        const input = $(inputId);
        input.value = state[key];
        input.onchange = () => {
          state[key] = clampSetting(parseInt(input.value, 10) || 0);
          input.value = state[key];
          if (saveSetting(key, state[key])) {
            hideNotice("setting-storage");
          } else if (!state.readOnly) {
            showNotice(
              "warn",
              "Die Einstellung gilt bis zum Schließen der Seite, konnte aber nicht gespeichert werden.",
              "setting-storage"
            );
          }
          onChange();
        };
      }

      bindSetting("buffer", "buf");
      bindSetting("step", "age");

      const settingsDialog = $("dlg");
      $("gear").onclick = () => {
        $("dmsg").hidden = true;
        settingsDialog.showModal();
      };
      $("close").onclick = () => settingsDialog.close();
      settingsDialog.onclick = event => {
        if (event.target === settingsDialog) settingsDialog.close();
      };

      return { openEdit };
    }
    return { initDialogs };
  };

  __modules["ui-footer.js"] = function () {
    const $ = id => document.getElementById(id);
    const QUOTA_BYTES = 5 * 1024 * 1024; // grobe Schätzung: viele Browser erlauben ca. 5 MB

    function storedBytes(storage, key) {
      try {
        const value = storage.getItem(key);
        return value === null ? 0 : new Blob([value]).size;
      } catch (error) {
        return null;
      }
    }

    function formatSize(bytes) {
      if (bytes < 1024) return `${bytes} Byte`;
      const kb = bytes / 1024;
      if (kb < 1024) return `${kb.toLocaleString("de-DE", { maximumFractionDigits: 1 })} KB`;
      return `${(kb / 1024).toLocaleString("de-DE", { maximumFractionDigits: 2 })} MB`;
    }

    function updateFooter(storage) {
      const tasks = storedBytes(storage, "kanban");
      const log = storedBytes(storage, "kanban_log");
      if (tasks === null || log === null) {
        $("fa").textContent = "Speicherverbrauch nicht lesbar";
        $("fl").textContent = "";
        $("ft").textContent = "";
        return;
      }
      const total = tasks + log;
      const percent = Math.min(100, Math.round(total / QUOTA_BYTES * 100));
      $("fa").textContent = `Aufgaben: ${formatSize(tasks)}`;
      $("fl").textContent = `Protokoll: ${formatSize(log)}`;
      $("ft").textContent = `Gesamt: ${formatSize(total)} (ca. ${percent} % von etwa 5 MB)`;
    }
    return { updateFooter };
  };

  __modules["ui-notifications.js"] = function () {
    const { DATA_VERSION, RECOVERY_DAYS } = __require("constants.js");

    const $ = id => document.getElementById(id);

    // Hinweisleiste und Rückgängig-Meldung. `onChange` wird aufgerufen, wenn sich die Aufgabenliste geändert hat
    // (Löschen oder Rückgängig) und das Board neu gezeichnet werden muss.
    function initNotifications({ store, actions, onChange }) {
      const { state } = store;
      let noticeKind = null;
      let undoTimer = null;

      function showNotice(kind, text, source = kind) {
        $("ntext").textContent = text;
        $("notice").className = `notice ${kind}`;
        $("notice").hidden = false;
        noticeKind = source;
      }

      function hideNotice(kind) {
        if (noticeKind !== kind) return;
        $("notice").hidden = true;
        noticeKind = null;
      }

      function hideToast() {
        $("toast").hidden = true;
        clearTimeout(undoTimer);
        actions.dismissUndo();
      }

      function removeTask(task) {
        actions.deleteTask(task);
        const title = task.t.length > 40 ? task.t.slice(0, 40) + "…" : task.t;
        $("ttext").textContent = `„${title}“ gelöscht.`;
        $("toast").hidden = false;
        clearTimeout(undoTimer);
        undoTimer = setTimeout(hideToast, 10000);
        onChange();
      }

      if (state.loadProblem) {
        let details = "";
        if (state.recoveryCopySaved) {
          details = ` Die Originaldaten wurden als Sicherheitskopie im Browser abgelegt und nach ${RECOVERY_DAYS} Tagen automatisch gelöscht.`;
        } else if (state.recoveryCopyAttempted) {
          details = " Die Sicherheitskopie konnte nicht im Browser abgelegt werden.";
        }
        showNotice("info", state.loadProblem + details);
      }

      if (state.readOnly) {
        showNotice(
          "warn",
          `⚠️ Diese Daten wurden mit einer neueren Version der Seite gespeichert (Datenversion ${state.storedVersion}, ` +
          `hier unterstützt: ${DATA_VERSION}). Damit nichts verloren geht, werden Änderungen weder gespeichert noch ` +
          "importiert. Exportieren ist möglich. Bitte die neuere Version der Seite verwenden.",
          "read-only"
        );
      }

      store.on("failed", () => {
        showNotice(
          "warn",
          "⚠️ Die Änderungen konnten nicht im Browser gespeichert werden (Speicher voll oder blockiert, z. B. im privaten Fenster). " +
          "Sie gehen beim Schließen oder Neuladen verloren. Sichere die Aufgaben jetzt mit ⚙️ → Exportieren.",
          "task-storage"
        );
      });

      store.on("saved", () => hideNotice("task-storage"));

      $("nclose").onclick = () => {
        $("notice").hidden = true;
        noticeKind = null;
      };

      $("tundo").onclick = () => {
        if (actions.undoDelete()) onChange();
        hideToast();
      };

      return { showNotice, hideNotice, removeTask };
    }
    return { initNotifications };
  };

  __modules["app.js"] = function () {
    const { initBackup } = __require("backup.js");
    const { browserStorage, createStore } = __require("storage.js");
    const { initSummary } = __require("summary.js");
    const { createTaskActions } = __require("task.js");
    const { createBoard } = __require("ui-board.js");
    const { initDialogs } = __require("ui-dialogs.js");
    const { updateFooter } = __require("ui-footer.js");
    const { initNotifications } = __require("ui-notifications.js");

    // Einzige Stelle, an der die Module zusammengesteckt werden. Alles andere bekommt seine
    // Abhängigkeiten über Parameter. Das Laden dieser Datei startet nichts: gestartet wird erst durch
    // den Aufruf von startApp() (siehe main.js). Speicher, Store und Aktionen lassen sich von außen ersetzen.
    function startApp({
      storage = browserStorage,
      store = createStore({ storage }),
      actions = createTaskActions(store)
    } = {}) {
      // Die Pfeilfunktionen unten greifen erst beim Klick auf notifications/dialogs zu,
      // wenn beide längst existieren. Deshalb ist die Reihenfolge der Definitionen unkritisch.
      const board = createBoard({
        store,
        actions,
        onEdit: task => dialogs.openEdit(task),
        onDelete: task => notifications.removeTask(task),
        onRendered: () => updateFooter(storage)
      });
      const notifications = initNotifications({ store, actions, onChange: board.render });
      const dialogs = initDialogs({ store, actions, notifications, onChange: board.render });

      initBackup({ store, onChange: board.render });
      initSummary({ store });

      board.render();
      return { store, actions, board, notifications, dialogs };
    }
    return { startApp };
  };

  __modules["main.js"] = function () {
    // Einstiegspunkt der Seite: startet die App. Nur hier gibt es einen Seiteneffekt beim Laden.
    const { startApp } = __require("app.js");

    startApp();
    return {  };
  };

  __require("main.js");
})();
