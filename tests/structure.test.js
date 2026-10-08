const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { projectRoot } = require("./test-helpers");

const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

test("index.html hat genau ein body-Element mit der Klasse app", () => {
    assert.equal((html.match(/<body\b/gi) || []).length, 1);
    assert.match(html, /<body class="app">/);
});

test("index.html vergibt jede id nur einmal", () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
});

test("index.html lädt jede Skriptdatei aus src/ genau einmal und alle existieren", () => {
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(scripts).size, scripts.length);
    for (const script of scripts) assert.ok(fs.existsSync(path.join(projectRoot, script)), `${script} fehlt`);
    const inSrc = fs.readdirSync(path.join(projectRoot, "src"))
        .filter(name => name.endsWith(".js"))
        .map(name => `src/${name}`)
        .sort();
    assert.deepEqual([...scripts].sort(), inSrc);
});