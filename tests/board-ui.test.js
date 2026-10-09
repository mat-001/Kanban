
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");
const {
    createApp,
    loadBoard,
    submitEvent,
    cardFor,
    actionButton,
    find,
    findAll,
    columnFor,
    task,
    getAllFiles,
    projectRoot,
    FIXED_NOW,
    DAY_MS
} = require("./test-helpers");

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
    assert.equal(find(summary, "s-bilanz").textContent, "Angelegt: 0 · In Arbeit gestartet: 0 · Erledigt: 1 · Gelöscht: 0");
    assert.equal(find(summary, "s-stand").textContent, "Zu erledigen: 1 · In Arbeit: 1 · Mit verpasstem Start: 1");
    assert.equal(find(summary, "s-verlauf").children.some(item => item.textContent.includes("Aktuelles Ereignis")), true);
    assert.equal(find(summary, "s-verlauf").children.some(item => item.textContent.includes("Altes Ereignis")), false);

    app.element("days").value = "30";
    app.element("days").onchange();
    assert.equal(app.element("stitle").textContent, "Die letzten 30 Tage");
    assert.equal(find(summary, "s-verlauf").children.some(item => item.textContent.includes("Altes Ereignis")), true);
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
    assert.equal(findAll(app.element("b"), "col").length, 3);
    assert.equal(cardFor(app, "Automatisierte Aufgabe") !== null, true);
});

test("verhindert unvollständige Termine und kann das Datumsfeld zurücksetzen", () => {
    const app = loadBoard(createApp());
    app.element("t").value = "Mit Termin";
    app.element("d").validity.badInput = true;

    app.element("f").onsubmit(submitEvent());
    assert.equal(app.Kanban.state.tasks.length, 0);
    assert.match(app.element("msg").textContent, /nur teilweise ausgefüllt/);

    find(app.element("msg"), "msg-action").onclick();
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
    columnFor(app, "done").ondrop({ preventDefault() { } });
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

test("shows summary when period is invalid and handles empty history", () => {
    const app = createApp();
    app.load("summary.js");
    app.Kanban.state.log = [];
    app.Kanban.state.tasks = [];
    app.Kanban.initSummary();

    app.element("days").value = "invalid";
    app.element("sumbtn").onclick();

    assert.equal(app.element("days").value, 1);
    assert.equal(app.element("stitle").textContent, "Die letzten 24 Stunden");
    assert.equal(find(app.element("sum"), "s-verlauf").textContent, "In den letzten 24 Stunden ist nichts passiert.");

    app.element("days").value = "365";
    app.element("days").onchange();
    assert.equal(app.element("days").value, 30);
    assert.equal(app.element("stitle").textContent, "Die letzten 30 Tage");
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
    assert.equal(app.Kanban.state.tasks[0].e, 8);
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

test("zeigt für Daten einer neueren Version einen Hinweis, der nicht verschwindet", () => {
    const app = loadBoard(createApp({ storage: { kanban: JSON.stringify([task(1)]), kanban_version: "2" } }));
    const notice = () => app.element("notice");
    assert.equal(notice().hidden, false);
    assert.match(notice().className, /warn/);
    assert.match(app.element("ntext").textContent, /Datenversion 2.*unterstützt: 1/);

    app.element("buf").value = "5";
    app.element("buf").onchange();
    assert.match(app.element("ntext").textContent, /neueren Version/);
    actionButton(cardFor(app, "Aufgabe 1"), "→").onclick();
    assert.match(app.element("ntext").textContent, /neueren Version/);
});

test("ignoriert ungültige Import-Einstellungen und rendert HTML-ähnliche Texte als Text", async () => {
    const app = loadBoard(createApp());
    app.load("backup.js");
    app.Kanban.initBackup(() => { });
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
    app.load("ui-notifications.js");
    app.load("ui-dialogs.js");
    app.load("ui-board.js");
    app.load("app.js");
    assert.equal(find(cardFor(app, unsafeText), "ttitle").textContent, unsafeText);

    app.element("sumbtn").onclick();
    const history = find(app.element("sum"), "s-verlauf");
    assert.equal(history.children[0].textContent.includes(unsafeText), true);
    assert.equal(history.children[0].innerHTML || "", "");
});

test("enthält keine Reste der Veröffentlichungsplattform mehr", () => {
    const files = getAllFiles(path.join(projectRoot, "src"));
    for (const filePath of files) {
        const source = fs.readFileSync(filePath, "utf8");
        const relPath = path.relative(projectRoot, filePath);
        assert.doesNotMatch(source, /claude/i, `${relPath} verweist noch auf die Plattform`);
    }
});