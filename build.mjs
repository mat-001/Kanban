// Bündelt die ES-Module aus src/ zu dist/kanban.js, damit index.html auch per Doppelklick
// (file://) funktioniert. Browser blockieren <script type="module"> beim Öffnen von der Festplatte.
//
// Aufruf:  node build.mjs      (nach jeder Änderung in src/; keine Pakete nötig)
//
// Unterstützt genau die Schreibweisen, die in src/ verwendet werden:
//   import { a, b } from "./datei.js";
//   export const|let|function|async function name ...
// Andere Formen (export default, export { }, import * as, "as"-Umbenennungen) brechen den Build ab.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = join(root, "src");
const outFile = join(root, "dist", "kanban.js");
const entry = "app.js";

const importRe = /^import\s+\{([\s\S]*?)\}\s+from\s+"\.\/([\w-]+\.js)";?[ \t]*$/gm;
const exportRe = /^export\s+(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm;

const compiled = new Map(); // Dateiname -> Quelltext der Modulfunktion (Reihenfolge = Abhängigkeiten zuerst)
const visiting = new Set();

function compile(name) {
  if (compiled.has(name)) return;
  if (visiting.has(name)) throw new Error(`Zirkuläre Abhängigkeit bei ${name}`);
  visiting.add(name);

  let code = readFileSync(join(srcDir, name), "utf8");

  code = code.replace(importRe, (match, specifiers, file) => {
    if (/\bas\b/.test(specifiers)) throw new Error(`${name}: "as" in Imports wird nicht unterstützt.`);
    compile(file);
    return `const {${specifiers}} = __require("${file}");`;
  });
  if (/^import\b/m.test(code)) throw new Error(`${name}: nicht unterstützte import-Form.`);

  const exportNames = [...code.matchAll(exportRe)].map(m => m[1]);
  const exportLines = (code.match(/^export\b/gm) || []).length;
  if (exportLines !== exportNames.length) throw new Error(`${name}: nicht unterstützte export-Form.`);
  code = code.replace(/^export\s+/gm, "");

  const body = code.trim().split("\n").map(line => (line ? "    " + line : line)).join("\n");
  compiled.set(
    name,
    `  __modules["${name}"] = function () {\n${body}\n    return { ${exportNames.join(", ")} };\n  };`
  );
  visiting.delete(name);
}

compile(entry);

const output = [
  "// AUTOMATISCH ERZEUGT von build.mjs aus src/*.js. Nicht von Hand ändern, sondern src/ ändern und neu bauen.",
  "(function () {",
  '  "use strict";',
  "  const __modules = {};",
  "  const __cache = {};",
  "  function __require(name) {",
  "    if (!(name in __cache)) __cache[name] = __modules[name]();",
  "    return __cache[name];",
  "  }",
  "",
  [...compiled.values()].join("\n\n"),
  "",
  `  __require("${entry}");`,
  "})();",
  ""
].join("\n");

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, output);
console.log(`dist/kanban.js geschrieben (${compiled.size} Module, ${output.length} Zeichen).`);
