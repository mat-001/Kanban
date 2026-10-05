const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp, loadBoard, task, FIXED_NOW } = require("./test-helpers");

async function importText(app, text) {
    const input = app.element("impfile");
    input.files = [{ size: text.length, text: async () => text }];
    await input.onchange({ target: input });
}

test("exportiert Aufgaben, Protokoll und Einstellungen in einer Sicherung", async () => {
    const app = createApp();
    app.load("backup.js");
    app.Kanban.state.tasks.push(task(20));
    app.Kanban.state.buffer = 3;
    app.Kanban.state.step = 9;
    app.Kanban.state.log.push({ ts: FIXED_NOW, k: "add", t: "Aufgabe 20" });
    app.Kanban.initBackup(() => { });
    await app.element("exp").onclick();

    assert.equal(app.downloads.length, 1);
    assert.equal(app.downloads[0].filename, "kanban-sicherung-2026-10-04.json");
    assert.equal(app.downloads[0].blob.type, "application/json");
    const backup = JSON.parse(await app.downloads[0].blob.text());
    assert.equal(backup.format, "kanban-sicherung");
    assert.equal(backup.version, 1);
    assert.equal(backup.tasks[0].id, 20);
    assert.equal(backup.log[0].t, "Aufgabe 20");
    assert.deepEqual(JSON.parse(JSON.stringify(backup.settings)), { buffer: 3, step: 9 });
    const message = app.element("dmsg");
    assert.match(message.textContent, /Sicherung mit 1 Aufgaben wird heruntergeladen/);
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

test("weisst fehlerhafte Importdateien ohne Änderung der Daten zurück", async () => {
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

test("begrenzt den Aufwand importierter Aufgaben", async () => {
    const app = createApp();
    app.load("backup.js");
    app.Kanban.initBackup(() => { });
    const input = app.element("impfile");
    input.files = [{ size: 100, text: async () => JSON.stringify({ tasks: [task(95, { e: 1e300 })] }) }];

    await input.onchange({ target: input });

    assert.equal(app.Kanban.state.tasks[0].e, app.Kanban.MAX_EFFORT);
});

test("weist kollidierenden Import-IDs neue freie IDs zu", async () => {
    const app = createApp();
    app.load("backup.js");
    app.Kanban.state.tasks = [task(70, { t: "Schon da" }), task(71, { t: "ID belegt" })];
    app.Kanban.initBackup(() => { });
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
    app.Kanban.initBackup(() => { });
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
    source.Kanban.initBackup(() => { });
    await source.element("exp").onclick();
    const exported = [await source.downloads[0].blob.text()];

    const target = createApp();
    target.load("backup.js");
    target.Kanban.initBackup(() => { });
    const input = target.element("impfile");
    input.files = [{ size: exported[0].length, text: async () => exported[0] }];
    await input.onchange({ target: input });

    assert.equal(target.Kanban.state.tasks.length, 1);
    assert.equal(target.Kanban.state.tasks[0].t, "Roundtrip");
    assert.equal(target.Kanban.state.log.some(event => event.t === "Roundtrip"), true);
    assert.equal(target.Kanban.state.buffer, 5);
    assert.equal(target.Kanban.state.step, 3);
});

test("exportiert bei Daten einer neueren Version die Originaldaten mit deren Versionsnummer", async () => {
    const stored = [{ ...task(1), zukunft: "feld" }];
    const app = loadBoard(createApp({
        storage: { kanban: JSON.stringify(stored), kanban_version: "7", kanban_log: JSON.stringify([{ ts: FIXED_NOW, k: "neu", t: "unbekannte Art" }]) }
    }));

    await app.element("exp").onclick();

    const backup = JSON.parse(await app.downloads[0].blob.text());
    assert.equal(backup.version, 7);
    assert.equal(backup.tasks[0].zukunft, "feld");
    assert.equal(backup.log[0].k, "neu");
});

test("verweigert den Import bei Daten einer neueren Version", async () => {
    const app = loadBoard(createApp({ storage: { kanban: JSON.stringify([task(1)]), kanban_version: "2" } }));
    await importText(app, JSON.stringify({ version: 1, tasks: [task(5)] }));

    assert.match(app.element("dmsg").textContent, /schreibgeschützt/);
    assert.equal(app.Kanban.state.tasks.length, 1);
});

test("exportiert mit der aktuellen Datenversion", async () => {
    const app = createApp();
    app.load("backup.js");
    app.Kanban.initBackup(() => { });
    await app.element("exp").onclick();
    assert.equal(JSON.parse(await app.downloads[0].blob.text()).version, app.Kanban.DATA_VERSION);
});

test("prüft beim Import die Versionsnummer der Sicherung", async () => {
    const app = createApp();
    app.load("backup.js");
    app.Kanban.initBackup(() => { });
    const before = app.Kanban.state.tasks.length;

    await importText(app, JSON.stringify({ version: 2, tasks: [task(10)] }));
    assert.match(app.element("dmsg").textContent, /neueren Version.*Datenversion 2.*unterstützt: 1/);
    assert.equal(app.Kanban.state.tasks.length, before);

    for (const invalid of ["x", 0, -1, 1.5, null]) {
        await importText(app, JSON.stringify({ version: invalid, tasks: [task(11)] }));
        assert.match(app.element("dmsg").textContent, /ungültige Versionsnummer/, `Version ${JSON.stringify(invalid)}`);
    }
    assert.equal(app.Kanban.state.tasks.length, before);

    await importText(app, JSON.stringify({ version: 1, tasks: [task(12)] }));
    assert.match(app.element("dmsg").textContent, /1 Aufgabe hinzugefügt/);
    await importText(app, JSON.stringify({ tasks: [task(13)] }));
    assert.match(app.element("dmsg").textContent, /1 Aufgabe hinzugefügt/);
    await importText(app, JSON.stringify({ version: 99 }));
    assert.match(app.element("dmsg").textContent, /neueren Version/);
    await importText(app, JSON.stringify({ version: 1 }));
    assert.match(app.element("dmsg").textContent, /keine Aufgaben gefunden/);
});

test("startet den Download über einen kurzlebigen Blob-Link und gibt ihn danach wieder frei", async () => {
    const app = createApp();
    app.load("backup.js");
    app.Kanban.initBackup(() => { });
    app.element("exp").onclick();

    assert.equal(app.downloads.length, 1);
    assert.match(app.downloads[0].href, /^blob:/);
    assert.equal(app.revokedUrls.length, 0);

    const timer = [...app.timers.values()].find(entry => entry.delay === 2000);
    assert.ok(timer);
    timer.callback();
    assert.deepEqual(app.revokedUrls, [app.downloads[0].href]);
});

test("meldet verständlich, wenn der Download nicht gestartet werden kann", () => {
    const app = createApp();
    app.load("backup.js");
    app.Kanban.initBackup(() => { });
    app.sandbox.URL.createObjectURL = () => { throw new Error("nicht verfügbar"); };

    app.element("exp").onclick();

    assert.equal(app.downloads.length, 0);
    assert.match(app.element("dmsg").textContent, /Download konnte nicht gestartet werden/);
    assert.doesNotMatch(app.element("dmsg").className, /ok/);
});