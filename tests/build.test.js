const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { buildWebsite } = require("../build.cjs");

const distDir = path.join(__dirname, "..", "dist");

test("Build erstellt in dist/ nur die veröffentlichbare Website", () => {
    buildWebsite();

    assert.deepEqual(fs.readdirSync(distDir).sort(), [
        "Kanban.png",
        "help.html",
        "index.html",
        "kanban.js",
        "style.css"
    ]);

    const index = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
    assert.match(index, /<script src="kanban\.js"><\/script>/);
    assert.doesNotMatch(index, /dist\/kanban\.js/);
    assert.ok(fs.statSync(path.join(distDir, "kanban.js")).size > 0);
});
