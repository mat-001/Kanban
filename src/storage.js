(function (Kanban) {
  const { RANK, TOK, clampEffort, clampSetting } = Kanban;

  const LOG_MAX = 1000;
  const LOG_DAYS = 30;
  const LOG_KINDS = ["add", "start", "done", "back", "del"];
  const LBL = {
    add: "Angelegt",
    start: "In Arbeit gestartet",
    done: "Erledigt",
    back: "Zurückgeschoben",
    del: "Gelöscht"
  };
  const state = {
    tasks: [],
    log: null,
    buffer: 1,
    step: 7,
    loadProblem: "",
    recoveryCopyAttempted: false,
    recoveryCopySaved: false
  };
  const isNumber = value => typeof value === "number" && Number.isFinite(value);

  function cleanTask(value) {
    if (!value || typeof value.t !== "string" || !value.t.trim()) return null;

    const created = isNumber(value.created) ? value.created
      : isNumber(value.id) ? value.id
        : Date.now();
    const task = {
      id: isNumber(value.id) ? value.id : created,
      t: value.t.trim().slice(0, 120),
      c: TOK.includes(value.c) ? value.c : "todo",
      p: typeof value.p === "string" && Object.hasOwn(RANK, value.p) ? value.p : "mittel",
      created,
      due: typeof value.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.due) ? value.due : "",
      e: clampEffort(isNumber(value.e) ? value.e : 0)
    };

    if (task.c === "done" && isNumber(value.doneAt)) task.doneAt = value.doneAt;
    if (isNumber(value.since)) task.since = value.since;
    return task;
  }

  let raw = null;
  let storageReadFailed = false;
  try {
    raw = localStorage.getItem("kanban");
  } catch (error) {
    storageReadFailed = true;
    state.loadProblem = "Gespeicherte Aufgaben konnten nicht gelesen werden.";
  }

  if (raw !== null) {
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      // Invalid data is reported below and kept as a recovery copy when possible.
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
    } else {
      state.loadProblem = "Die gespeicherten Aufgaben waren beschädigt und konnten nicht gelesen werden.";
    }

    if (state.loadProblem) {
      state.recoveryCopyAttempted = true;
      try {
        localStorage.setItem("kanban_defekt", raw);
        state.recoveryCopySaved = true;
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
  }

  function readSetting(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : clampSetting(parseInt(value, 10) || 0);
    } catch (error) {
      return fallback;
    }
  }

  state.buffer = readSetting("kanban_buf", state.buffer);
  state.step = readSetting("kanban_age", state.step);

  function save() {
    try {
      localStorage.setItem("kanban", JSON.stringify(state.tasks));
      document.dispatchEvent(new CustomEvent("kanban-storage-saved"));
      return true;
    } catch (error) {
      document.dispatchEvent(new CustomEvent("kanban-storage-failed"));
      return false;
    }
  }

  function saveSetting(key, value) {
    const storageKey = key === "buffer" ? "kanban_buf" : "kanban_age";
    try {
      localStorage.setItem(storageKey, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  try {
    state.log = JSON.parse(localStorage.getItem("kanban_log"));
  } catch (error) {
    state.log = null;
  }

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

  function saveLog() {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        localStorage.setItem("kanban_log", JSON.stringify(state.log));
        return;
      } catch (error) {
        state.log = state.log.slice(Math.ceil(state.log.length / 2));
      }
    }
  }

  if (!Array.isArray(state.log)) {
    state.log = [];
    state.tasks.forEach(task => {
      state.log.push({ ts: task.created, k: "add", t: task.t });
      if (task.doneAt) state.log.push({ ts: task.doneAt, k: "done", t: task.t });
    });
  }
  pruneLog();
  saveLog();

  function addLog(kind, title) {
    const entry = { ts: Date.now(), k: kind, t: String(title).slice(0, 60) };
    state.log.push(entry);
    pruneLog();
    saveLog();
    return entry;
  }

  Object.assign(Kanban, {
    LOG_MAX,
    LOG_DAYS,
    LOG_KINDS,
    LBL,
    state,
    cleanTask,
    save,
    saveSetting,
    pruneLog,
    saveLog,
    addLog
  });
})(window.Kanban ||= {});
