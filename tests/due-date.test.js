const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp, loadBoard, find, task } = require("./test-helpers");

async function importText(app, text) {
    const input = app.element("impfile");
    input.files = [{ size: text.length, text: async () => text }];
    await input.onchange({ target: input });
}

test("isRealDate erkennt nur Daten, die es im Kalender gibt", () => {
    const { Kanban } = createApp();

    for (const good of ["2026-01-01", "2026-10-12", "2026-12-31", "2028-02-29", "2000-02-29"]) {
        assert.equal(Kanban.isRealDate(good), true, `sollte gültig sein: ${good}`);
    }
    for (const bad of [
        "2026-02-29",      // 2026 ist kein Schaltjahr
        "2100-02-29",      // 2100 ist kein Schaltjahr (durch 100, nicht durch 400 teilbar)
        "2026-02-30",
        "2026-02-31",
        "2026-04-31",      // April hat 30 Tage
        "2026-06-31",
        "2026-13-01",
        "2026-00-10",
        "2026-01-00",
        "2026-01-32",
        "2026-1-5",
        "26-01-01",
        "2026-01-01T00:00",
        " 2026-01-01",
        "kein-datum",
        "",
        null,
        undefined,
        20260101
    ]) {
        assert.equal(Kanban.isRealDate(bad), false, `sollte abgelehnt werden: ${JSON.stringify(bad)}`);
    }
});

test("cleanTask behält echte Zieltermine und verwirft unmögliche", () => {
    const { Kanban } = createApp();
    const dueOf = due => Kanban.cleanTask({ id: 1, t: "A", due }).due;

    assert.equal(dueOf("2026-10-12"), "2026-10-12");
    assert.equal(dueOf("2028-02-29"), "2028-02-29");
    assert.equal(dueOf("2026-02-31"), "");
    assert.equal(dueOf("2026-13-45"), "");
    assert.equal(dueOf("2026-02-29"), "");
    assert.equal(dueOf(null), "");
    assert.equal(dueOf(20261012), "");
});

test("bereinigt unmögliche Zieltermine beim Laden aus dem Speicher", () => {
    const stored = [
        task(1, { t: "Kein 31. Februar", due: "2026-02-31" }),
        task(2, { t: "Kein 13. Monat", due: "2026-13-01" }),
        task(3, { t: "Schaltjahr", due: "2028-02-29" })
    ];
    const { Kanban } = createApp({ storage: { kanban: JSON.stringify(stored) } });

    assert.equal(Kanban.state.tasks[0].due, "");
    assert.equal(Kanban.state.tasks[1].due, "");
    assert.equal(Kanban.state.tasks[2].due, "2028-02-29");
    assert.equal(Kanban.lastStart(Kanban.state.tasks[0], 1), null);
});

test("bereinigt unmögliche Zieltermine beim Import", async () => {
    const app = createApp();
    app.Kanban.initBackup(() => { });

    await importText(app, JSON.stringify({
        tasks: [
            task(10, { t: "Falsch", due: "2026-02-31" }),
            task(11, { t: "Richtig", due: "2026-10-12" })
        ]
    }));

    const byTitle = title => app.Kanban.state.tasks.find(item => item.t === title);
    assert.equal(byTitle("Falsch").due, "");
    assert.equal(byTitle("Richtig").due, "2026-10-12");
});

test("zählt eine Aufgabe mit unmöglichem Termin nicht als verpassten Start", () => {
    const app = loadBoard(createApp({
        storage: { kanban: JSON.stringify([task(20, { t: "Falscher Termin", due: "2026-02-31" })]) }
    }));

    app.element("sumbtn").onclick();

    assert.match(find(app.element("sum"), "s-stand").textContent, /Mit verpasstem Start: 0/);
});