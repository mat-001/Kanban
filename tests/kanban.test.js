const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const DAY_MS = 864e5;
const FIXED_NOW = new Date(2026, 9, 4, 12).getTime();

function createApp({ storage = {}, now = FIXED_NOW, failWrites = [] } = {}) {
  const storedValues = new Map(Object.entries({ kanban: "[]", ...storage }));
  const failedKeys = new Set(failWrites);
  const events = [];
  const elements = new Map();
  const NativeDate = Date;

  class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  }

  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        hidden: false,
        textContent: "",
        className: "",
        value: "",
        files: [],
        children: [],
        open: false,
        appendChild(child) {
          this.children.push(child);
        },
        replaceChildren(...children) {
          this.children = children;
        },
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
        click() {
          this.clicked = true;
        }
      });
    }
    return elements.get(id);
  }

  const document = {
    body: { appendChild() {} },
    createElement() {
      return {
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
        click() {},
        remove() {}
      };
    },
    dispatchEvent(event) {
      events.push(event.type);
    },
    getElementById: element
  };

  const sandbox = {
    Date: FixedDate,
    CustomEvent: class CustomEvent {
      constructor(type) {
        this.type = type;
      }
    },
    document,
    localStorage: {
      getItem(key) {
        return storedValues.has(key) ? storedValues.get(key) : null;
      },
      setItem(key, value) {
        if (failedKeys.has(key)) throw new Error("Storage unavailable");
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
    storedValues
  };
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
  const futureMediumOlder = task(3, { p: "mittel", created: 100 });
  const futureMediumNewer = task(4, { p: "mittel", created: 200 });

  assert.deepEqual(
    [futureMediumNewer, futureHigh, missedLow, futureMediumOlder].sort(sort).map(item => item.id),
    [1, 2, 3, 4]
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
