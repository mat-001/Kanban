const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const DAY_MS = 864e5;
const FIXED_NOW = new Date(2026, 9, 4, 12).getTime();

function createApp({ storage = {}, now = FIXED_NOW, failWrites = [], maxValueLength = {} } = {}) {
  const storedValues = new Map(Object.entries({ kanban: "[]", ...storage }));
  const failedKeys = new Set(failWrites);
  const valueLimits = new Map(Object.entries(maxValueLength)); // simuliert einen fast vollen Speicher
  const writes = []; // jeder Schreibversuch, auch fehlgeschlagene
  const events = [];
  const elements = new Map();
  const listeners = new Map();
  const timers = new Map();
  let nextTimerId = 1;
  const NativeDate = Date;

  class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  }

  function makeElement(tagName = "div", id = "") {
    const classes = new Set();
    const node = {
        tagName,
        id,
        hidden: false,
        textContent: "",
        className: "",
        value: "",
        type: "",
        title: "",
        draggable: false,
        validity: { badInput: false },
        files: [],
        children: [],
        open: false,
        attributes: {},
        classList: {
          add(name) {
            classes.add(name);
          },
          remove(name) {
            classes.delete(name);
          },
          contains(name) {
            return classes.has(name);
          }
        },
        appendChild(child) {
          this.children.push(child);
        },
        append(...children) {
          this.children.push(...children);
        },
        replaceChildren(...children) {
          this.children = children;
        },
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        focus() {
          this.focused = true;
        },
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
        click() {
          this.clicked = true;
          if (this.onclick) this.onclick();
        },
        replaceWith(replacement) {
          if (this.id) elements.set(this.id, replacement);
        }
      };
    Object.defineProperties(node, {
      outerHTML: {
        get() {
          return `<${this.tagName} id="${this.id}">`;
        }
      },
      firstElementChild: {
        get() {
          return this.children[0] || null;
        }
      },
      innerHTML: {
        get() {
          return this._innerHTML || "";
        },
        set(value) {
          this._innerHTML = value;
          const match = value.match(/<input\b[^>]*\bid="([^"]+)"/);
          if (match) this.children = [makeElement("input", match[1])];
        }
      }
    });
    return node;
  }

  function element(id) {
    if (!elements.has(id)) {
      const inputIds = new Set(["age", "buf", "d", "days", "ed", "ee", "e", "ep", "et", "impfile", "p", "t"]);
      const tagName = inputIds.has(id) ? "input" : "div";
      const input = makeElement(tagName, id);
      if (id === "p" || id === "ep") input.value = "mittel";
      if (id === "e") input.value = "1";
      elements.set(id, input);
    }
    return elements.get(id);
  }

  const document = {
    body: { appendChild() {} },
    createElement(tagName) {
      return makeElement(tagName);
    },
    dispatchEvent(event) {
      events.push(event.type);
      (listeners.get(event.type) || []).forEach(listener => listener(event));
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    getElementById: element
  };
  const timersApi = {
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    }
  };

  const sandbox = {
    Date: FixedDate,
    CustomEvent: class CustomEvent {
      constructor(type) {
        this.type = type;
      }
    },
    document,
    setTimeout: timersApi.setTimeout,
    clearTimeout: timersApi.clearTimeout,
    localStorage: {
      getItem(key) {
        return storedValues.has(key) ? storedValues.get(key) : null;
      },
      setItem(key, value) {
        writes.push(key);
        if (failedKeys.has(key)) throw new Error("Storage unavailable");
        if (valueLimits.has(key) && String(value).length > valueLimits.get(key)) throw new Error("Quota exceeded");
        storedValues.set(key, String(value));
      }
    }
  };
  sandbox.window = sandbox;

  const load = filename => {
    const source = fs.readFileSync(path.join(projectRoot, "src", filename), "utf8");
    vm.runInNewContext(source, sandbox, { filename });
  };

  ["dates.js", "sort.js", "storage.js", "task.js"].forEach(load);

  return {
    Kanban: sandbox.Kanban,
    document,
    element,
    events,
    load,
    sandbox,
    timers,
    storedValues,
    writes
  };
}

function loadBoard(app) {
  app.load("backup.js");
  app.load("summary.js");
  app.load("board.js");
  return app;
}

function submitEvent() {
  return { preventDefault() {} };
}

function cardFor(app, title) {
  for (const column of app.element("b").children) {
    const card = column.children.find(child =>
      child.className.startsWith("card ") &&
      child.children[0].children[0].textContent === title);
    if (card) return card;
  }
  return null;
}

function actionButton(card, label) {
  return card.children[1].children.find(button => button.textContent === label);
}

function task(id, overrides = {}) {
  return {
    id,
    t: `Aufgabe ${id}`,
    c: "todo",
    p: "mittel",
    created: FIXED_NOW - id,
    due: "",
    e: 8,
    ...overrides
  };
}

test("berechnet den spätesten Start mit Arbeitstagen, Aufwand und Puffer", () => {
  const { Kanban } = createApp();

  assert.equal(Kanban.lastStart({ due: "2026-10-12", e: 8 }, 0), "2026-10-12");
  assert.equal(Kanban.lastStart({ due: "2026-10-12", e: 1 }, 0), "2026-10-12");
  assert.equal(Kanban.lastStart({ due: "2026-10-12", e: 8.1 }, 0), "2026-10-09");
  assert.equal(Kanban.lastStart({ due: "2026-10-12", e: 16 }, 0), "2026-10-09");
  assert.equal(Kanban.lastStart({ due: "2026-10-12", e: 8 }, 1), "2026-10-09");
  assert.equal(Kanban.lastStart({ due: "2026-10-11", e: 8 }, 0), "2026-10-09");
  assert.equal(Kanban.lastStart({ due: "", e: 8 }, 1), null);
});

test("Alterung erhöht die effektive Priorität stufenweise und lässt sie nicht über hoch steigen", () => {
  const { Kanban } = createApp();
  const oldTask = task(1, {
    p: "niedrig",
    created: FIXED_NOW - 21 * DAY_MS
  });

  assert.equal(Kanban.effRank(oldTask, 7), 0);
  assert.equal(Kanban.effRank(oldTask, 0), 2);
  assert.equal(Kanban.effRank(task(2, { p: "hoch" }), 7), 0);
});

test("sortiert offene Aufgaben erst nach verpasstem Start, dann nach Priorität und Ablage", () => {
  const { Kanban } = createApp();
  const sort = Kanban.sorter("todo", 0, 0);
  const missedLow = task(1, { p: "niedrig", due: "2026-10-01" });
  const futureHigh = task(2, { p: "hoch", due: "2026-10-12" });
  const futureMediumOlder = task(3, { p: "mittel", created: 100, due: "2026-10-12" });
  const futureMediumNewer = task(4, { p: "mittel", created: 200, due: "2026-10-12" });
  const futureMediumNoDate = task(5, { p: "mittel", created: 50 });

  assert.deepEqual(
    [futureMediumNewer, futureMediumNoDate, futureHigh, missedLow, futureMediumOlder].sort(sort).map(item => item.id),
    [1, 2, 3, 4, 5]
  );
});

test("sortiert erledigte Aufgaben mit dem neuesten Abschluss zuerst", () => {
  const { Kanban } = createApp();
  const tasks = [
    task(1, { c: "done", doneAt: 100 }),
    task(2, { c: "done", doneAt: 300 }),
    task(3, { c: "done", doneAt: 200 })
  ];

  assert.deepEqual(tasks.sort(Kanban.sorter("done", 0, 0)).map(item => item.id), [2, 3, 1]);
});

test("bereinigt Aufgabenfelder und verwirft leere Aufgaben", () => {
  const { Kanban } = createApp();
  const cleaned = Kanban.cleanTask({
    id: 5,
    t: "  Aufgabe  ",
    c: "unbekannt",
    p: "unbekannt",
    created: FIXED_NOW,
    due: "kein-datum",
    e: -3,
    doneAt: FIXED_NOW
  });

  assert.equal(cleaned.t, "Aufgabe");
  assert.equal(cleaned.c, "todo");
  assert.equal(cleaned.p, "mittel");
  assert.equal(cleaned.due, "");
  assert.equal(cleaned.e, 0);
  assert.equal("doneAt" in cleaned, false);
  assert.equal(Kanban.cleanTask({ t: "   " }), null);
  assert.equal(Kanban.cleanTask(null), null);
});

test("überspringt beschädigte gespeicherte Aufgaben und legt eine Originalkopie ab", () => {
  const original = JSON.stringify([{ id: 1, t: "gültig" }, { id: 2, t: "  " }]);
  const { Kanban, storedValues } = createApp({ storage: { kanban: original } });

  assert.equal(Kanban.state.tasks.length, 1);
  assert.match(Kanban.state.loadProblem, /1 gespeicherte Einträge/);
  assert.equal(storedValues.get("kanban_defekt"), original);
  assert.equal(Kanban.state.recoveryCopySaved, true);
});

test("meldet beschädigtes JSON und bewahrt die unveränderten Rohdaten", () => {
  const original = "{invalid";
  const { Kanban, storedValues } = createApp({ storage: { kanban: original } });

  assert.equal(Kanban.state.tasks.length, 0);
  assert.match(Kanban.state.loadProblem, /beschädigt/);
  assert.equal(storedValues.get("kanban_defekt"), original);
});

test("speichert Aufgaben und signalisiert fehlgeschlagene Speicherung", () => {
  const { Kanban, events } = createApp({ failWrites: ["kanban"] });
  Kanban.state.tasks.push(task(1));

  assert.equal(Kanban.save(), false);
  assert.deepEqual(events, ["kanban-storage-failed"]);
});

test("beschränkt das Protokoll auf 30 Tage und höchstens 1000 gültige Einträge", () => {
  const { Kanban } = createApp();
  Kanban.state.log = [
    { ts: FIXED_NOW - 31 * DAY_MS, k: "add", t: "alt" },
    { ts: FIXED_NOW, k: "invalid", t: "ungültig" },
    ...Array.from({ length: 1001 }, (_, index) => ({
      ts: FIXED_NOW - 1000 + index,
      k: "add",
      t: `Aufgabe ${index}`
    }))
  ];

  Kanban.pruneLog();

  assert.equal(Kanban.state.log.length, 1000);
  assert.equal(Kanban.state.log[0].t, "Aufgabe 1");
  assert.equal(Kanban.state.log.at(-1).t, "Aufgabe 1000");
});

test("protokolliert Anlegen, Aktualisieren und Statuswechsel", () => {
  const { Kanban, storedValues } = createApp();
  const item = task(10);
  Kanban.addTask(item);

  assert.equal(Kanban.state.log.at(-1).k, "add");
  assert.equal(JSON.parse(storedValues.get("kanban")).length, 1);
  assert.equal(Kanban.updateTask(10, { t: "Geändert" }), true);
  assert.equal(Kanban.state.tasks[0].t, "Geändert");
  assert.equal(Kanban.updateTask(999, { t: "Fehlt" }), false);

  Kanban.moveTask(item, "doing");
  assert.equal(item.c, "doing");
  assert.equal(Kanban.state.log.at(-1).k, "start");
  Kanban.moveTask(item, "done");
  assert.equal(typeof item.doneAt, "number");
  assert.equal(Kanban.state.log.at(-1).k, "done");
});

test("setzt die Wartezeit zurück, wenn eine Aufgabe aus In Arbeit zurückkommt", () => {
  const { Kanban } = createApp();
  const item = task(11, { c: "doing", since: FIXED_NOW - DAY_MS });

  Kanban.moveTask(item, "todo");

  assert.equal(item.since, FIXED_NOW);
  assert.equal(item.c, "todo");
  assert.equal(Kanban.state.log.at(-1).k, "back");
});

test("stellt eine gelöschte Aufgabe wieder her und entfernt den Löschverlauf", () => {
  const { Kanban } = createApp();
  const item = task(12);
  Kanban.addTask(item);
  Kanban.deleteTask(item);

  assert.equal(Kanban.state.tasks.length, 0);
  assert.equal(Kanban.state.log.at(-1).k, "del");
  assert.equal(Kanban.undoDelete(), true);
  assert.equal(Kanban.state.tasks.length, 1);
  assert.equal(Kanban.state.tasks[0].id, 12);
  assert.equal(Kanban.state.log.some(event => event.k === "del"), false);
  assert.equal(Kanban.undoDelete(), false);
});

test("exportiert Aufgaben, Protokoll und Einstellungen in einer Sicherung", async () => {
  const app = createApp();
  app.load("backup.js");
  const downloads = [];
  app.Kanban.state.tasks.push(task(20));
  app.Kanban.state.buffer = 3;
  app.Kanban.state.step = 9;
  app.Kanban.state.log.push({ ts: FIXED_NOW, k: "add", t: "Aufgabe 20" });
  app.sandbox.claude = {
    use: async () => ({
      save: async payload => downloads.push(payload)
    })
  };
  app.Kanban.initBackup(() => {});
  await app.element("exp").onclick();

  assert.equal(downloads.length, 1);
  const backup = JSON.parse(downloads[0].data);
  assert.equal(backup.format, "kanban-sicherung");
  assert.equal(backup.version, 1);
  assert.equal(backup.tasks[0].id, 20);
  assert.equal(backup.log[0].t, "Aufgabe 20");
  assert.deepEqual(JSON.parse(JSON.stringify(backup.settings)), { buffer: 3, step: 9 });
  const message = app.element("dmsg");
  assert.match(message.textContent, /gespeichert/);
});

test("importiert neue Aufgaben, dedupliziert, bereinigt Verlauf und übernimmt Einstellungen", async () => {
  const app = createApp();
  app.load("backup.js");
  const existing = task(30);
  app.Kanban.state.tasks.push(existing);
  let renders = 0;
  app.Kanban.initBackup(() => renders++);

  const input = app.element("impfile");
  input.files = [{
    size: 100,
    text: async () => JSON.stringify({
      tasks: [
        { ...existing },
        { ...existing, t: "Andere Aufgabe" },
        { id: 31, t: "   " }
      ],
      log: [
        { ts: FIXED_NOW, k: "add", t: "Ereignis" },
        { ts: FIXED_NOW, k: "add", t: "Ereignis" },
        { ts: FIXED_NOW, k: "unknown", t: "Ungültig" }
      ],
      settings: { buffer: 4, step: 0 }
    })
  }];

  await app.element("imp").onclick();
  await input.onchange({ target: input });

  assert.equal(input.value, "");
  assert.equal(app.Kanban.state.tasks.length, 2);
  assert.equal(app.Kanban.state.tasks[1].id, 31);
  assert.equal(app.Kanban.state.tasks[1].t, "Andere Aufgabe");
  assert.equal(app.Kanban.state.log.filter(event => event.t === "Ereignis").length, 1);
  assert.equal(app.Kanban.state.buffer, 4);
  assert.equal(app.Kanban.state.step, 0);
  assert.equal(app.element("buf").value, 4);
  assert.equal(app.element("age").value, 0);
  assert.equal(renders, 1);
  assert.match(app.element("dmsg").textContent, /1 Aufgabe hinzugefügt, 1 schon vorhanden, 1 ungültig übersprungen/);
});

test("weist fehlerhafte Importdateien ohne Änderung der Daten zurück", async () => {
  const app = createApp();
  app.load("backup.js");
  const item = task(40);
  app.Kanban.state.tasks.push(item);
  app.Kanban.initBackup(() => assert.fail("Ungültiger Import darf nicht rendern"));

  const input = app.element("impfile");
  input.files = [{ size: 10, text: async () => "kein JSON" }];
  await input.onchange({ target: input });

  assert.equal(app.Kanban.state.tasks.length, 1);
  assert.equal(app.Kanban.state.tasks[0].id, 40);
  assert.match(app.element("dmsg").textContent, /keine gültige Sicherung/);
  assert.equal(app.element("dmsg").className, "msg");

  input.files = [{ size: 2e6 + 1, text: async () => "{}" }];
  await input.onchange({ target: input });
  assert.match(app.element("dmsg").textContent, /groß/);

  input.files = [{ size: 20, text: async () => JSON.stringify({ tasks: "keine Aufgabenliste" }) }];
  await input.onchange({ target: input });
  assert.equal(app.Kanban.state.tasks.length, 1);
  assert.match(app.element("dmsg").textContent, /keine Aufgaben gefunden/);
});

test("zeigt in der Zusammenfassung nur Ereignisse des gewählten Zeitraums", () => {
  const app = createApp();
  app.load("summary.js");
  app.Kanban.state.log = [
    { ts: FIXED_NOW - 2 * DAY_MS, k: "add", t: "Altes Ereignis" },
    { ts: FIXED_NOW - 1000, k: "done", t: "Aktuelles Ereignis" }
  ];
  app.Kanban.state.tasks = [
    task(50, { c: "todo", due: "2026-10-01" }),
    task(51, { c: "doing", due: "" }),
    task(52, { c: "done", doneAt: FIXED_NOW })
  ];
  app.Kanban.initSummary();

  app.element("sumbtn").onclick();

  const summary = app.element("sum");
  assert.equal(app.element("stitle").textContent, "Die letzten 24 Stunden");
  assert.equal(app.element("sdlg").open, true);
  assert.equal(summary.children[1].textContent, "Angelegt: 0 · In Arbeit gestartet: 0 · Erledigt: 1 · Gelöscht: 0");
  assert.equal(summary.children[3].textContent, "Zu erledigen: 1 · In Arbeit: 1 · Mit verpasstem Start: 1");
  assert.equal(summary.children[5].children.some(item => item.textContent.includes("Aktuelles Ereignis")), true);
  assert.equal(summary.children[5].children.some(item => item.textContent.includes("Altes Ereignis")), false);

  app.element("days").value = "30";
  app.element("days").onchange();
  assert.equal(app.element("stitle").textContent, "Die letzten 30 Tage");
  assert.equal(summary.children[5].children.some(item => item.textContent.includes("Altes Ereignis")), true);
});

test("legt Aufgaben über das Formular an und weist leere Titel zurück", () => {
  const app = loadBoard(createApp());
  const form = app.element("f");
  const title = app.element("t");
  const due = app.element("d");
  const effort = app.element("e");

  title.value = "   ";
  form.onsubmit(submitEvent());
  assert.equal(app.Kanban.state.tasks.length, 0);
  assert.match(app.element("msg").textContent, /Bitte eine Aufgabe eingeben/);

  title.value = "  Automatisierte Aufgabe  ";
  app.element("p").value = "hoch";
  due.value = "2026-10-12";
  effort.value = "16";
  form.onsubmit(submitEvent());

  const created = app.Kanban.state.tasks[0];
  assert.equal(created.t, "Automatisierte Aufgabe");
  assert.equal(created.c, "todo");
  assert.equal(created.p, "hoch");
  assert.equal(created.due, "2026-10-12");
  assert.equal(created.e, 16);
  assert.equal(title.value, "");
  assert.equal(effort.value, "1");
  assert.equal(app.element("b").children.length, 3);
  assert.equal(cardFor(app, "Automatisierte Aufgabe") !== null, true);
});

test("verhindert unvollständige Termine und kann das Datumsfeld zurücksetzen", () => {
  const app = loadBoard(createApp());
  app.element("t").value = "Mit Termin";
  app.element("d").validity.badInput = true;

  app.element("f").onsubmit(submitEvent());
  assert.equal(app.Kanban.state.tasks.length, 0);
  assert.match(app.element("msg").textContent, /nur teilweise ausgefüllt/);

  app.element("msg").children[0].onclick();
  assert.equal(app.element("msg").hidden, true);
  assert.equal(app.element("d").validity.badInput, false);
  app.element("f").onsubmit(submitEvent());
  assert.equal(app.Kanban.state.tasks.length, 1);
  assert.equal(app.Kanban.state.tasks[0].due, "");
});

test("bearbeitet Aufgaben und verwirft Änderungen beim Abbrechen", () => {
  const item = task(60, { t: "Unverändert" });
  const app = loadBoard(createApp({ storage: { kanban: JSON.stringify([item]) } }));

  actionButton(cardFor(app, "Unverändert"), "✎").onclick();
  assert.equal(app.element("edlg").open, true);
  app.element("et").value = "Nicht gespeichert";
  app.element("ecancel").onclick();
  assert.equal(item.t, "Unverändert");

  actionButton(cardFor(app, "Unverändert"), "✎").onclick();
  app.element("et").value = "Gespeichert";
  app.element("ep").value = "niedrig";
  app.element("ed").value = "2026-10-20";
  app.element("ee").value = "4";
  app.element("ef").onsubmit(submitEvent());

  const updated = app.Kanban.state.tasks[0];
  assert.equal(updated.t, "Gespeichert");
  assert.equal(updated.p, "niedrig");
  assert.equal(updated.due, "2026-10-20");
  assert.equal(updated.e, 4);
  assert.equal(app.element("edlg").open, false);
});

test("verschiebt Aufgaben über Pfeile und Drag-and-drop und löscht mit Undo", () => {
  const item = task(61, { t: "Bewegen" });
  const app = loadBoard(createApp({ storage: { kanban: JSON.stringify([item]) } }));
  const storedItem = app.Kanban.state.tasks[0];

  actionButton(cardFor(app, "Bewegen"), "→").onclick();
  assert.equal(storedItem.c, "doing");
  assert.equal(app.Kanban.state.log.at(-1).k, "start");

  const card = cardFor(app, "Bewegen");
  card.ondragstart();
  app.element("b").children[2].ondrop({ preventDefault() {} });
  assert.equal(storedItem.c, "done");
  assert.equal(app.Kanban.state.log.at(-1).k, "done");

  actionButton(cardFor(app, "Bewegen"), "✕").onclick();
  assert.equal(app.Kanban.state.tasks.length, 0);
  assert.equal(app.element("toast").hidden, false);
  assert.equal(app.timers.size, 1);
  app.element("tundo").onclick();
  assert.equal(app.Kanban.state.tasks.length, 1);
  assert.equal(storedItem.c, "done");
  assert.equal(app.element("toast").hidden, true);
  assert.equal(app.timers.size, 0);
});

test("lässt gelöschte Aufgabe nach Ablauf des Undo-Zeitfensters gelöscht", () => {
  const item = task(62, { t: "Undo läuft ab" });
  const app = loadBoard(createApp({ storage: { kanban: JSON.stringify([item]) } }));

  actionButton(cardFor(app, item.t), "✕").onclick();
  const timer = [...app.timers.values()][0];
  assert.equal(timer.delay, 10000);
  timer.callback();

  assert.equal(app.Kanban.state.tasks.length, 0);
  assert.equal(app.element("toast").hidden, true);
  assert.equal(app.Kanban.undoDelete(), false);
});

test("speichert geänderte Einstellungen dauerhaft", () => {
  const app = loadBoard(createApp());

  app.element("buf").value = "3";
  app.element("buf").onchange();
  app.element("age").value = "0";
  app.element("age").onchange();

  assert.equal(app.Kanban.state.buffer, 3);
  assert.equal(app.Kanban.state.step, 0);
  assert.equal(app.storedValues.get("kanban_buf"), "3");
  assert.equal(app.storedValues.get("kanban_age"), "0");
  assert.equal(app.element("buf").value, 3);
});

test("stellt gespeicherte Aufgaben nach einer simulierten Browser-Neuladung wieder her", () => {
  const first = loadBoard(createApp());
  first.element("t").value = "Bleibt erhalten";
  first.element("e").value = "2.5";
  first.element("f").onsubmit(submitEvent());

  const reloaded = createApp({ storage: Object.fromEntries(first.storedValues) });

  assert.equal(reloaded.Kanban.state.tasks.length, 1);
  assert.equal(reloaded.Kanban.state.tasks[0].t, "Bleibt erhalten");
  assert.equal(reloaded.Kanban.state.tasks[0].e, 2.5);
});

test("weist kollidierenden Import-IDs neue freie IDs zu", async () => {
  const app = createApp();
  app.load("backup.js");
  app.Kanban.state.tasks = [task(70, { t: "Schon da" }), task(71, { t: "ID belegt" })];
  app.Kanban.initBackup(() => {});
  const file = {
    size: 100,
    text: async () => JSON.stringify({ tasks: [{ ...task(70), t: "Importiert" }] })
  };
  const input = app.element("impfile");
  input.files = [file];

  await input.onchange({ target: input });
  await input.onchange({ target: input });

  assert.equal(app.Kanban.state.tasks.length, 3);
  assert.equal(app.Kanban.state.tasks[2].id, 72);
  assert.equal(app.Kanban.state.tasks[2].t, "Importiert");
  assert.match(app.element("dmsg").textContent, /0 Aufgaben hinzugefügt, 1 schon vorhanden/);
});

test("überspringt denselben Import bei wiederholtem Import ohne ID-Kollision", async () => {
  const app = createApp();
  app.load("backup.js");
  app.Kanban.initBackup(() => {});
  const input = app.element("impfile");
  input.files = [{
    size: 100,
    text: async () => JSON.stringify({ tasks: [task(73, { t: "Importiert" })] })
  }];

  await input.onchange({ target: input });
  await input.onchange({ target: input });

  assert.equal(app.Kanban.state.tasks.length, 1);
  assert.match(app.element("dmsg").textContent, /0 Aufgaben hinzugefügt, 1 schon vorhanden/);
});

test("importiert eine Sicherung in ein frisches Profil und erhält Aufgaben, Verlauf und Einstellungen", async () => {
  const source = createApp();
  source.load("backup.js");
  source.Kanban.state.tasks = [task(80, { t: "Roundtrip", due: "2026-10-15" })];
  source.Kanban.state.log = [{ ts: FIXED_NOW, k: "add", t: "Roundtrip" }];
  source.Kanban.state.buffer = 5;
  source.Kanban.state.step = 3;
  const exported = [];
  source.sandbox.claude = {
    use: async () => ({ save: async payload => exported.push(payload.data) })
  };
  source.Kanban.initBackup(() => {});
  await source.element("exp").onclick();

  const target = createApp();
  target.load("backup.js");
  target.Kanban.initBackup(() => {});
  const input = target.element("impfile");
  input.files = [{ size: exported[0].length, text: async () => exported[0] }];
  await input.onchange({ target: input });

  assert.equal(target.Kanban.state.tasks.length, 1);
  assert.equal(target.Kanban.state.tasks[0].t, "Roundtrip");
  assert.equal(target.Kanban.state.log.some(event => event.t === "Roundtrip"), true);
  assert.equal(target.Kanban.state.buffer, 5);
  assert.equal(target.Kanban.state.step, 3);
});

test("zeigt Zusammenfassung bei ungültigem Zeitraum begrenzt und mit leerem Verlauf korrekt an", () => {
  const app = createApp();
  app.load("summary.js");
  app.Kanban.state.log = [];
  app.Kanban.state.tasks = [];
  app.Kanban.initSummary();

  app.element("days").value = "invalid";
  app.element("sumbtn").onclick();

  assert.equal(app.element("days").value, 1);
  assert.equal(app.element("stitle").textContent, "Die letzten 24 Stunden");
  assert.equal(app.element("sum").children.at(-1).textContent, "In den letzten 24 Stunden ist nichts passiert.");

  app.element("days").value = "365";
  app.element("days").onchange();
  assert.equal(app.element("days").value, 30);
  assert.equal(app.element("stitle").textContent, "Die letzten 30 Tage");
});

test("ignoriert ungültige Import-Einstellungen und rendert HTML-ähnliche Texte als Text", async () => {
  const app = loadBoard(createApp());
  app.load("backup.js");
  app.Kanban.initBackup(() => {});
  const unsafeText = '<img src=x onerror="alert(1)">';
  const input = app.element("impfile");
  input.files = [{
    size: 200,
    text: async () => JSON.stringify({
      tasks: [task(90, { t: unsafeText })],
      log: [{ ts: FIXED_NOW, k: "add", t: unsafeText }],
      settings: { buffer: -1, step: 366 }
    })
  }];
  await input.onchange({ target: input });

  assert.equal(app.Kanban.state.buffer, 1);
  assert.equal(app.Kanban.state.step, 7);
  app.load("board.js");
  assert.equal(cardFor(app, unsafeText).children[0].children[0].textContent, unsafeText);

  app.element("sumbtn").onclick();
  const history = app.element("sum").children.at(-1);
  assert.equal(history.children[0].textContent.includes(unsafeText), true);
  assert.equal(history.children[0].innerHTML || "", "");
});

// ---------------------------------------------------------------------------
// Obergrenzen und Rechenzeit (verhindert, dass riesige Werte die Seite einfrieren)
// ---------------------------------------------------------------------------

// Alte, langsame Fassung von lastStart: zählt Tag für Tag. Dient als Referenz für die schnelle Rechnung.
function referenceLastStart(task, buffer) {
  const workdays = Math.max(1, Math.ceil((task.e || 0) / 8)) + buffer;
  const date = new Date(`${task.due}T00:00`);
  let counted = 0;
  while (counted < workdays) {
    if (date.getDay() !== 0 && date.getDay() !== 6) counted++;
    if (counted < workdays) date.setDate(date.getDate() - 1);
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("lastStart liefert dieselben Tage wie die zählende Referenz (alle Wochentage, Sommerzeitwechsel)", () => {
  const { Kanban } = createApp();
  const efforts = [0, 0.5, 1, 8, 8.1, 16, 17, 40, 100, 400];
  const first = new Date(2026, 0, 1).getTime();
  let checked = 0;

  for (let day = 0; day < 400; day++) {
    const due = new Date(first + day * DAY_MS);
    const dueText = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
    for (const e of efforts) {
      for (let buffer = 0; buffer <= 20; buffer++) {
        assert.equal(Kanban.lastStart({ due: dueText, e }, buffer), referenceLastStart({ due: dueText, e }, buffer),
          `Termin ${dueText}, Aufwand ${e}, Puffer ${buffer}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 80000);
});

test("lastStart rechnet auch mit absurd großen Werten sofort und verwendet die Obergrenzen", () => {
  const { Kanban } = createApp();
  const started = process.hrtime.bigint();
  const huge = Kanban.lastStart({ due: "2026-10-12", e: 1e300 }, 1e9);
  const infinite = Kanban.lastStart({ due: "2026-10-12", e: Infinity }, Infinity);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.ok(elapsedMs < 50, `dauerte ${elapsedMs} ms`);
  assert.equal(huge, Kanban.lastStart({ due: "2026-10-12", e: Kanban.MAX_EFFORT }, Kanban.MAX_SETTING));
  assert.equal(huge, referenceLastStart({ due: "2026-10-12", e: Kanban.MAX_EFFORT }, Kanban.MAX_SETTING));
  assert.equal(infinite, Kanban.lastStart({ due: "2026-10-12", e: 0 }, 0));
});

test("begrenzt Aufwand und Einstellungen beim Laden aus dem Speicher", () => {
  const { Kanban } = createApp({
    storage: {
      kanban: JSON.stringify([{ id: 1, t: "Riesig", e: 1e300 }]),
      kanban_buf: "1000000",
      kanban_age: "99999"
    }
  });

  assert.equal(Kanban.state.tasks[0].e, Kanban.MAX_EFFORT);
  assert.equal(Kanban.state.buffer, Kanban.MAX_SETTING);
  assert.equal(Kanban.state.step, Kanban.MAX_SETTING);
  assert.equal(Kanban.clampEffort(NaN), 0);
  assert.equal(Kanban.clampSetting(-5), 0);
  assert.equal(Kanban.clampSetting(2.9), 2);
});

test("begrenzt den Aufwand importierter Aufgaben", async () => {
  const app = createApp();
  app.load("backup.js");
  app.Kanban.initBackup(() => {});
  const input = app.element("impfile");
  input.files = [{ size: 100, text: async () => JSON.stringify({ tasks: [task(95, { e: 1e300 })] }) }];

  await input.onchange({ target: input });

  assert.equal(app.Kanban.state.tasks[0].e, app.Kanban.MAX_EFFORT);
});

test("lehnt zu großen Aufwand im Formular und im Bearbeiten-Fenster ab", () => {
  const item = task(96, { t: "Bearbeiten" });
  const app = loadBoard(createApp({ storage: { kanban: JSON.stringify([item]) } }));
  assert.equal(app.element("e").max, app.Kanban.MAX_EFFORT);
  assert.equal(app.element("ee").max, app.Kanban.MAX_EFFORT);

  app.element("t").value = "Zu groß";
  app.element("e").value = "1001";
  app.element("f").onsubmit(submitEvent());
  assert.equal(app.Kanban.state.tasks.length, 1);
  assert.match(app.element("msg").textContent, /höchstens 1000 Stunden/);
  assert.equal(app.element("e").focused, true);

  app.element("e").value = "1000";
  app.element("f").onsubmit(submitEvent());
  assert.equal(app.Kanban.state.tasks.length, 2);
  assert.equal(app.Kanban.state.tasks[1].e, 1000);

  actionButton(cardFor(app, "Bearbeiten"), "✎").onclick();
  app.element("ee").value = "1e300";
  app.element("ef").onsubmit(submitEvent());
  assert.match(app.element("emsg").textContent, /höchstens 1000 Stunden/);
  assert.equal(app.element("edlg").open, true);
  assert.equal(app.Kanban.state.tasks[0].e, 8, "der alte Wert bleibt erhalten");
});

test("begrenzt Sicherheitspuffer und Alterung in den Einstellungen auf 365 Tage", () => {
  const app = loadBoard(createApp());
  assert.equal(app.element("buf").max, app.Kanban.MAX_SETTING);

  app.element("buf").value = "1000000000";
  app.element("buf").onchange();
  app.element("age").value = "366";
  app.element("age").onchange();

  assert.equal(app.Kanban.state.buffer, 365);
  assert.equal(app.Kanban.state.step, 365);
  assert.equal(app.element("buf").value, 365);
  assert.equal(app.storedValues.get("kanban_buf"), "365");
  assert.equal(app.storedValues.get("kanban_age"), "365");
});

// ---------------------------------------------------------------------------
// Protokoll bei Schreibproblemen (das Protokoll im Speicher darf nie schrumpfen)
// ---------------------------------------------------------------------------

function logEntries(count, { now = FIXED_NOW } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    ts: now - (count - index) * 1000,
    k: "add",
    t: `Eintrag ${index}`
  }));
}

test("behält das Protokoll im Speicher vollständig, wenn der Speicher nicht beschreibbar ist", () => {
  const app = createApp({
    storage: { kanban_log: JSON.stringify(logEntries(200)) },
    failWrites: ["kanban", "kanban_log"]
  });
  const { Kanban } = app;
  assert.equal(Kanban.state.log.length, 200, "nach dem Laden");

  Kanban.addTask({ id: 1, t: "Neu", c: "todo", p: "mittel", created: FIXED_NOW, due: "", e: 1 });
  assert.equal(Kanban.state.log.length, 201, "nach einer neuen Aufgabe");
  assert.equal(Kanban.state.log.at(-1).t, "Neu");
  assert.equal(Kanban.saveLog(), false, "meldet, dass nichts geschrieben werden konnte");
  assert.equal(Kanban.state.log.length, 201);
});

test("legt bei fast vollem Speicher nur eine gekürzte Kopie ab und behält im Speicher alles", () => {
  const app = createApp({
    storage: { kanban_log: JSON.stringify(logEntries(200)) },
    maxValueLength: { kanban_log: 3500 } // reicht für etwa 70 Einträge
  });
  const { Kanban, storedValues } = app;
  assert.equal(Kanban.state.log.length, 200);

  Kanban.addLog("add", "Letzter Eintrag");

  const persisted = JSON.parse(storedValues.get("kanban_log"));
  assert.equal(Kanban.state.log.length, 201, "im Speicher des Programms nichts verloren");
  assert.ok(persisted.length > 0 && persisted.length < 201, `abgelegt: ${persisted.length}`);
  // Per JSON vergleichen: die Objekte stammen aus zwei getrennten Laufumgebungen (vm) und wären sonst nie "gleich"
  assert.equal(JSON.stringify(persisted), JSON.stringify(Kanban.state.log.slice(-persisted.length)), "abgelegt sind die neuesten Einträge");
  assert.equal(persisted.at(-1).t, "Letzter Eintrag");
  assert.equal(Kanban.saveLog(), true);
});

test("schreibt das Protokoll in voller Länge, solange Platz ist", () => {
  const { Kanban, storedValues } = createApp({ storage: { kanban_log: JSON.stringify(logEntries(50)) } });
  Kanban.addLog("done", "Fertig");
  assert.equal(JSON.parse(storedValues.get("kanban_log")).length, 51);
});

test("schreibt das Protokoll beim Start nur, wenn es neu aufgebaut oder bereinigt werden musste", () => {
  const unchanged = createApp({ storage: { kanban_log: JSON.stringify(logEntries(20)) } });
  assert.equal(unchanged.writes.includes("kanban_log"), false, "unverändertes Protokoll wird nicht neu geschrieben");

  const withJunk = createApp({ storage: { kanban_log: JSON.stringify([...logEntries(3), null, { ts: "x" }, { ts: FIXED_NOW, k: "bogus", t: "y" }]) } });
  assert.equal(withJunk.writes.includes("kanban_log"), true, "bereinigtes Protokoll wird gespeichert");
  assert.equal(JSON.parse(withJunk.storedValues.get("kanban_log")).length, 3);

  const expired = createApp({ storage: { kanban_log: JSON.stringify([{ ts: FIXED_NOW - 40 * DAY_MS, k: "add", t: "alt" }, ...logEntries(2)]) } });
  assert.equal(JSON.parse(expired.storedValues.get("kanban_log")).length, 2, "abgelaufene Einträge werden entfernt und gespeichert");

  const firstStart = createApp({ storage: { kanban_log: "{kaputt" } });
  assert.equal(firstStart.writes.includes("kanban_log"), true, "ohne Protokoll wird es aus den Aufgaben aufgebaut");
});
