const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp, task, withVersion, DAY_MS, FIXED_NOW } = require("./test-helpers");

function logEntries(count, { now = FIXED_NOW } = {}) {
    return Array.from({ length: count }, (_, index) => ({
        ts: now - (count - index) * 1000,
        k: "add",
        t: `Eintrag ${index}`
    }));
}

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
    assert.deepEqual(events, ["failed"]);
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

test("behält das Protokoll im Speicher vollständig, wenn der Speicher nicht beschreibbar ist", () => {
    const app = createApp({
        storage: { kanban_log: JSON.stringify(logEntries(200)) },
        failWrites: ["kanban", "kanban_log"]
    });
    const { Kanban } = app;
    assert.equal(Kanban.state.log.length, 200);

    Kanban.addTask({ id: 1, t: "Neu", c: "todo", p: "mittel", created: FIXED_NOW, due: "", e: 1 });
    assert.equal(Kanban.state.log.length, 201);
    assert.equal(Kanban.state.log.at(-1).t, "Neu");
    assert.equal(Kanban.saveLog(), false);
    assert.equal(Kanban.state.log.length, 201);
});

test("legt bei fast vollem Speicher nur eine gekürzte Kopie ab und behält im Speicher alles", () => {
    const app = createApp({
        storage: { kanban_log: JSON.stringify(logEntries(200)) },
        maxValueLength: { kanban_log: 3500 }
    });
    const { Kanban, storedValues } = app;
    assert.equal(Kanban.state.log.length, 200);

    Kanban.addLog("add", "Letzter Eintrag");

    const persisted = JSON.parse(storedValues.get("kanban_log"));
    assert.equal(Kanban.state.log.length, 201);
    assert.ok(persisted.length > 0 && persisted.length < 201);
    assert.equal(JSON.stringify(persisted), JSON.stringify(Kanban.state.log.slice(-persisted.length)));
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
    assert.equal(unchanged.writes.includes("kanban_log"), false);

    const withJunk = createApp({ storage: { kanban_log: JSON.stringify([...logEntries(3), null, { ts: "x" }, { ts: FIXED_NOW, k: "bogus", t: "y" }]) } });
    assert.equal(withJunk.writes.includes("kanban_log"), true);
    assert.equal(JSON.parse(withJunk.storedValues.get("kanban_log")).length, 3);

    const expired = createApp({ storage: { kanban_log: JSON.stringify([{ ts: FIXED_NOW - 40 * DAY_MS, k: "add", t: "alt" }, ...logEntries(2)]) } });
    assert.equal(JSON.parse(expired.storedValues.get("kanban_log")).length, 2);

    const firstStart = createApp({ storage: { kanban_log: "{kaputt" } });
    assert.equal(firstStart.writes.includes("kanban_log"), true);
});

test("legt beim Speichern die Datenversion ab und liest Daten ohne Versionsangabe als Version 1", () => {
    const legacy = createApp({ storage: { kanban: JSON.stringify([task(1)]) } });
    assert.equal(legacy.Kanban.state.readOnly, false);
    assert.equal(legacy.Kanban.state.storedVersion, 1);
    assert.equal(legacy.storedValues.has("kanban_version"), false);

    legacy.Kanban.save();
    assert.equal(legacy.storedValues.get("kanban_version"), String(legacy.Kanban.DATA_VERSION));
});

test("behandelt unlesbare Versionsangaben wie Version 1", () => {
    for (const text of ["abc", "0", "-3", "1.5", "", "NaN"]) {
        const app = createApp({ storage: { kanban: JSON.stringify([task(1)]), kanban_version: text } });
        assert.equal(app.Kanban.state.readOnly, false);
        assert.equal(app.Kanban.state.storedVersion, 1);
    }
});

test("liest Daten einer neueren Version, überschreibt aber nichts", () => {
    const raw = JSON.stringify([{ ...task(1), zukunft: "feld" }, null]);
    const app = createApp({
        storage: { kanban: raw, kanban_version: "2", kanban_log: JSON.stringify(logEntries(3)), kanban_buf: "4" }
    });
    const { Kanban, storedValues, writes, events } = app;

    assert.equal(Kanban.state.readOnly, true);
    assert.equal(Kanban.state.storedVersion, 2);
    assert.equal(Kanban.state.tasks[0].id, 1);
    assert.equal(writes.length, 0);

    Kanban.addTask(task(2));
    Kanban.updateTask(1, { t: "geändert" });
    Kanban.moveTask(Kanban.state.tasks[0], "done");
    assert.equal(Kanban.save(), false);
    assert.equal(Kanban.saveLog(), false);
    assert.equal(Kanban.saveSetting("buffer", 9), false);

    assert.equal(Kanban.state.tasks.length, 2);
    assert.equal(writes.length, 0);
    assert.equal(storedValues.get("kanban"), raw);
    assert.equal(storedValues.get("kanban_version"), "2");
    assert.equal(storedValues.get("kanban_buf"), "4");
    assert.equal(events.includes("failed"), false);
});

test("wendet Migrationen der Reihe nach an und meldet fehlende Schritte", () => {
    const { Kanban } = createApp();
    const steps = {
        1: list => list.map(item => ({ ...item, a: 1 })),
        2: list => list.map(({ a, ...rest }) => ({ ...rest, b: a }))
    };
    const plain = value => JSON.parse(JSON.stringify(value));

    assert.deepEqual(plain(Kanban.migrate([{ id: 1 }], 1, 3, steps)), [{ id: 1, b: 1 }]);
    assert.deepEqual(plain(Kanban.migrate([{ id: 1, a: 5 }], 2, 3, steps)), [{ id: 1, b: 5 }]);
    const same = [{ id: 1 }];
    assert.equal(Kanban.migrate(same, 3, 3, steps), same);
    assert.throws(() => Kanban.migrate([], 1, 3, { 1: list => list }), /fehlt eine Migration/);
});

test("stellt beim Laden ältere Daten über die Migrationen um und speichert danach die neue Version", () => {
    const app = createApp({
        storage: { kanban: JSON.stringify([{ id: 1, name: "Altes Feld" }]), kanban_version: "1" },
        patch: withVersion(2, "{ 1: list => list.map(item => ({ ...item, t: item.name })) }")
    });

    assert.equal(app.Kanban.DATA_VERSION, 2);
    assert.equal(app.Kanban.state.readOnly, false);
    assert.equal(app.Kanban.state.tasks[0].t, "Altes Feld");
    assert.equal(app.Kanban.state.loadProblem, "");

    app.Kanban.save();
    assert.equal(app.storedValues.get("kanban_version"), "2");
    assert.equal(JSON.parse(app.storedValues.get("kanban"))[0].t, "Altes Feld");
});

test("meldet eine fehlgeschlagene Migration wie beschädigte Daten und sichert das Original", () => {
    const raw = JSON.stringify([{ id: 1, t: "x" }]);
    const app = createApp({
        storage: { kanban: raw, kanban_version: "1" },
        patch: withVersion(2, '{ 1: () => { throw new Error("kaputt"); } }')
    });

    assert.match(app.Kanban.state.loadProblem, /umgestellt/);
    assert.equal(app.Kanban.state.tasks.length, 0);
    assert.equal(app.storedValues.get("kanban_defekt"), raw);
});

test("Daten mit Version 3 sind für eine Seite mit Datenversion 2 schreibgeschützt", () => {
    const app = createApp({ storage: { kanban: "[]", kanban_version: "3" }, patch: withVersion(2) });
    assert.equal(app.Kanban.state.readOnly, true);
    const current = createApp({ storage: { kanban: "[]", kanban_version: "2" }, patch: withVersion(2) });
    assert.equal(current.Kanban.state.readOnly, false);
});

test("legt die Beispielaufgabe beim ersten Start dauerhaft ab", () => {
    const first = createApp({ storage: { kanban: null } });
    assert.equal(first.Kanban.state.tasks.length, 1);
    assert.equal(first.storedValues.has("kanban"), true);

    // Neuladen einen Tag später: dieselbe Aufgabe, keine neue Kennung
    const reloaded = createApp({
        storage: { kanban: null, ...Object.fromEntries(first.storedValues) },
        now: FIXED_NOW + DAY_MS
    });
    assert.equal(reloaded.Kanban.state.tasks.length, 1);
    assert.equal(reloaded.Kanban.state.tasks[0].id, first.Kanban.state.tasks[0].id);
});

test("räumt die Sicherheitskopie beschädigter Daten nach 30 Tagen auf", () => {
    const old = createApp({ storage: { kanban_defekt: "{x", kanban_defekt_ts: String(FIXED_NOW - 31 * DAY_MS) } });
    assert.equal(old.storedValues.has("kanban_defekt"), false);
    assert.equal(old.storedValues.has("kanban_defekt_ts"), false);

    const recent = createApp({ storage: { kanban_defekt: "{x", kanban_defekt_ts: String(FIXED_NOW - 5 * DAY_MS) } });
    assert.equal(recent.storedValues.get("kanban_defekt"), "{x");

    const legacy = createApp({ storage: { kanban_defekt: "{x" } });
    assert.equal(legacy.storedValues.get("kanban_defekt"), "{x");
    assert.equal(legacy.storedValues.get("kanban_defekt_ts"), String(FIXED_NOW));
});

test("behält die Sicherheitskopie, solange das Problem besteht, und erneuert den Zeitpunkt", () => {
    const app = createApp({
        storage: { kanban: "{invalid", kanban_defekt: "alt", kanban_defekt_ts: String(FIXED_NOW - 40 * DAY_MS) }
    });
    assert.equal(app.storedValues.get("kanban_defekt"), "{invalid");
    assert.equal(app.storedValues.get("kanban_defekt_ts"), String(FIXED_NOW));
});

test("rührt die Sicherheitskopie bei Daten einer neueren Version nicht an", () => {
    const app = createApp({
        storage: { kanban: "[]", kanban_version: "2", kanban_defekt: "{x", kanban_defekt_ts: String(FIXED_NOW - 40 * DAY_MS) }
    });
    assert.equal(app.storedValues.has("kanban_defekt"), true);
    assert.equal(app.writes.length, 0);
});