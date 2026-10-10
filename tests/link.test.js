const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createApp,
    loadBoard,
    submitEvent,
    cardFor,
    find,
    actionButton,
    task
} = require("./test-helpers");

async function importText(app, text) {
    const input = app.element("impfile");
    input.files = [{ size: text.length, text: async () => text }];
    await input.onchange({ target: input });
}

// Der Link wird über seinen Klassennamen gefunden, nicht über seine Stelle in der Karte.
const linkOf = card => find(card, "tlink");

test("cleanLink erlaubt nur http, https und file", () => {
    const { Kanban } = createApp();

    assert.equal(Kanban.cleanLink("https://example.com/a?b=1"), "https://example.com/a?b=1");
    assert.equal(Kanban.cleanLink("http://example.com"), "http://example.com");
    assert.equal(Kanban.cleanLink("HTTPS://EXAMPLE.COM"), "HTTPS://EXAMPLE.COM");
    assert.equal(Kanban.cleanLink("file:///Users/name/Bericht.pdf"), "file:///Users/name/Bericht.pdf");
    assert.equal(Kanban.cleanLink("file://server/freigabe/Bericht.pdf"), "file://server/freigabe/Bericht.pdf");
});

test("cleanLink weist gefährliche und unvollständige Links ab", () => {
    const { Kanban } = createApp();

    for (const bad of [
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        " javascript:alert(1)",
        "data:text/html,<b>x</b>",
        "vbscript:x",
        "ftp://example.com/datei",
        "example.com",
        "//example.com",
        "https://",
        "https://exa mple.com",
        "https:/example.com",
        "",
        "   ",
        null,
        undefined,
        42
    ]) {
        assert.equal(Kanban.cleanLink(bad), "", `sollte abgelehnt werden: ${JSON.stringify(bad)}`);
    }
});

test("cleanLink entfernt Leerzeichen am Rand, kodiert Leerzeichen in Dateipfaden und kürzt auf 500 Zeichen", () => {
    const { Kanban } = createApp();

    assert.equal(Kanban.cleanLink("  https://example.com  "), "https://example.com");
    assert.equal(
        Kanban.cleanLink("file:///C:/Meine Dokumente/Bericht 1.pdf"),
        "file:///C:/Meine%20Dokumente/Bericht%201.pdf"
    );
    assert.equal(Kanban.cleanLink("https://example.com/" + "a".repeat(480)).length, 500);
    assert.equal(Kanban.cleanLink("https://example.com/" + "a".repeat(481)), "");
});

test("cleanTask behält gültige Links und lässt ungültige weg", () => {
    const { Kanban } = createApp();

    assert.equal(Kanban.cleanTask({ id: 1, t: "A", l: "https://example.com" }).l, "https://example.com");
    assert.equal("l" in Kanban.cleanTask({ id: 2, t: "B", l: "javascript:alert(1)" }), false);
    assert.equal("l" in Kanban.cleanTask({ id: 3, t: "C", l: "" }), false);
    assert.equal("l" in Kanban.cleanTask({ id: 4, t: "D" }), false);
    assert.equal("l" in Kanban.cleanTask({ id: 5, t: "E", l: { toString: () => "https://x.de" } }), false);
});

test("bereinigt Links beim Laden aus dem Speicher", () => {
    const stored = [
        task(1, { t: "Gut", l: "https://example.com" }),
        task(2, { t: "Schlecht", l: "javascript:alert(1)" })
    ];
    const { Kanban } = createApp({ storage: { kanban: JSON.stringify(stored) } });

    assert.equal(Kanban.state.tasks[0].l, "https://example.com");
    assert.equal("l" in Kanban.state.tasks[1], false);
});

test("übernimmt beim Import nur gültige Links", async () => {
    const app = createApp();
    app.Kanban.initBackup(() => { });

    await importText(app, JSON.stringify({
        tasks: [
            task(10, { t: "Web", l: "https://example.com" }),
            task(11, { t: "Datei", l: "file:///Users/name/a.pdf" }),
            task(12, { t: "Böse", l: "javascript:alert(1)" })
        ]
    }));

    const byTitle = title => app.Kanban.state.tasks.find(item => item.t === title);
    assert.equal(app.Kanban.state.tasks.length, 3);
    assert.equal(byTitle("Web").l, "https://example.com");
    assert.equal(byTitle("Datei").l, "file:///Users/name/a.pdf");
    assert.equal("l" in byTitle("Böse"), false);
});

test("exportiert Links und importiert sie unverändert in ein frisches Profil", async () => {
    const source = createApp();
    source.Kanban.state.tasks = [task(20, { t: "Mit Link", l: "https://example.com/x" })];
    source.Kanban.initBackup(() => { });
    await source.element("exp").onclick();
    const exported = await source.downloads[0].blob.text();

    const target = createApp();
    target.Kanban.initBackup(() => { });
    await importText(target, exported);

    assert.equal(target.Kanban.state.tasks[0].l, "https://example.com/x");
});

test("legt Aufgaben mit Link über das Formular an", () => {
    const app = loadBoard(createApp());
    app.element("add").onclick();
    app.element("t").value = "Mit Link";
    app.element("l").value = "  https://example.com/x  ";
    app.element("f").onsubmit(submitEvent());

    assert.equal(app.Kanban.state.tasks[0].l, "https://example.com/x");
    assert.equal(app.element("ndlg").open, false);

    // Beim nächsten Öffnen ist das Linkfeld leer.
    app.element("add").onclick();
    assert.equal(app.element("l").value, "");
});

test("legt Aufgaben ohne Link ohne Linkfeld an", () => {
    const app = loadBoard(createApp());
    app.element("t").value = "Ohne Link";
    app.element("f").onsubmit(submitEvent());

    assert.equal(app.Kanban.state.tasks.length, 1);
    assert.equal("l" in app.Kanban.state.tasks[0], false);
});

test("lehnt ungültige Links im Formular mit Hinweis ab", () => {
    const app = loadBoard(createApp());
    app.element("t").value = "Böser Link";
    app.element("l").value = "javascript:alert(1)";
    app.element("f").onsubmit(submitEvent());

    assert.equal(app.Kanban.state.tasks.length, 0);
    assert.match(app.element("msg").textContent, /Der Link muss mit http/);
    assert.equal(app.element("l").focused, true);
});

test("bearbeitet, ändert und entfernt Links im Bearbeiten-Fenster", () => {
    const item = task(30, { t: "Bearbeiten", l: "https://alt.example.com" });
    const app = loadBoard(createApp({ storage: { kanban: JSON.stringify([item]) } }));

    actionButton(cardFor(app, "Bearbeiten"), "✎").onclick();
    assert.equal(app.element("el").value, "https://alt.example.com");

    app.element("el").value = "file:///Users/name/neu.pdf";
    app.element("ef").onsubmit(submitEvent());
    assert.equal(app.Kanban.state.tasks[0].l, "file:///Users/name/neu.pdf");

    actionButton(cardFor(app, "Bearbeiten"), "✎").onclick();
    app.element("el").value = "";
    app.element("ef").onsubmit(submitEvent());
    assert.equal(Boolean(app.Kanban.state.tasks[0].l), false);
});

test("lehnt ungültige Links im Bearbeiten-Fenster ab und ändert nichts", () => {
    const item = task(31, { t: "Unverändert", l: "https://example.com" });
    const app = loadBoard(createApp({ storage: { kanban: JSON.stringify([item]) } }));

    actionButton(cardFor(app, "Unverändert"), "✎").onclick();
    app.element("el").value = "javascript:alert(1)";
    app.element("ef").onsubmit(submitEvent());

    assert.match(app.element("emsg").textContent, /Der Link muss mit http/);
    assert.equal(app.element("edlg").open, true);
    assert.equal(app.Kanban.state.tasks[0].l, "https://example.com");
});

test("zeigt den Link auf der Karte als sicheren Verweis an", () => {
    const app = loadBoard(createApp({
        storage: {
            kanban: JSON.stringify([
                task(40, { t: "Web", l: "https://example.com" }),
                task(41, { t: "Datei", l: "file:///Users/name/a.pdf" }),
                task(42, { t: "Ohne" })
            ])
        }
    }));

    const web = linkOf(cardFor(app, "Web"));
    assert.equal(web.tagName, "a");
    assert.equal(web.href, "https://example.com");
    assert.equal(web.target, "_blank");
    assert.match(web.rel, /noopener/);
    assert.match(web.rel, /noreferrer/);

    assert.equal(linkOf(cardFor(app, "Datei")).href, "file:///Users/name/a.pdf");
    assert.equal(linkOf(cardFor(app, "Ohne")), null);
});

test("zeigt keinen Link an, wenn der gespeicherte Link unzulässig ist", () => {
    const app = loadBoard(createApp({
        storage: { kanban: JSON.stringify([task(50, { t: "Manipuliert", l: "javascript:alert(1)" })]) }
    }));

    assert.equal(linkOf(cardFor(app, "Manipuliert")), null);
});