// Baut dist/kanban.js aus src/*.js, damit index.html auch per Doppelklick (file://) funktioniert.
// Aufruf:  node build.cjs      (nach jeder Änderung in src/; keine Pakete nötig)

const fs = require("node:fs");
const path = require("node:path");
const { bundle } = require("./bundle.cjs");

const { code, modules } = bundle({ srcDir: path.join(__dirname, "src"), entry: "main.js" });
const outFile = path.join(__dirname, "dist", "kanban.js");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, code);
console.log(`dist/kanban.js geschrieben (${modules.length} Module, ${code.length} Zeichen).`);
