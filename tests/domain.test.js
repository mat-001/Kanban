const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp, task, DAY_MS, FIXED_NOW } = require("./test-helpers");

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

test("Alterung erhöht die effektive Priorität stufenweise und lässt sie nicht über hoch steigen", () => {
    const { Kanban } = createApp();
    const oldTask = task(1, { p: "niedrig", created: FIXED_NOW - 21 * DAY_MS });

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