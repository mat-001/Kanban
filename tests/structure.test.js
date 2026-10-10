const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { projectRoot } = require("./test-helpers");
const { bundle } = require("../bundle.cjs");

const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

test("index.html hat genau ein body-Element mit der Klasse app", () => {
    assert.equal((html.match(/<body\b/gi) || []).length, 1);
    assert.match(html, /<body class="app">/);
});

test("index.html vergibt jede id nur einmal", () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
});

test("index.html lädt genau das gebaute Skript kanban.js als klassisches Skript", () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map(match => match[1]);
    assert.equal(scripts.length, 1);
    assert.match(scripts[0], /src="kanban\.js"/);
    assert.doesNotMatch(scripts[0], /type="module"/);
    assert.ok(fs.existsSync(path.join(projectRoot, "dist", "kanban.js")), "kanban.js fehlt, bitte node build.cjs ausführen");
});

test("dist/kanban.js ist aktuell und enthält jedes Modul aus src/", () => {
    const { code, modules } = bundle({ srcDir: path.join(projectRoot, "src"), entry: "main.js" });
    const built = fs.readFileSync(path.join(projectRoot, "dist", "kanban.js"), "utf8").replace(/\r\n/g, "\n");
    assert.equal(built, code, "dist/kanban.js ist veraltet, bitte node build.cjs ausführen");

    const inSrc = fs.readdirSync(path.join(projectRoot, "src")).filter(name => name.endsWith(".js")).sort();
    assert.deepEqual([...modules].sort(), inSrc, "Jede Datei in src/ muss vom Einstiegspunkt aus erreichbar sein");
});

test("Module haben beim Laden keine Seiteneffekte außer main.js", () => {
    for (const name of fs.readdirSync(path.join(projectRoot, "src")).filter(file => file.endsWith(".js") && file !== "main.js")) {
        const source = fs.readFileSync(path.join(projectRoot, "src", name), "utf8");
        assert.doesNotMatch(source, /window\.Kanban/, `${name} nutzt noch den globalen Container`);
    }
});
