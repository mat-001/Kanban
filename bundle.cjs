// Bündelt die ES-Module aus src/ zu einem einzigen klassischen Skript (ohne Webserver lauffähig).
// Wird vom Build (build.cjs) und von den Tests (tests/test-helpers.js) gemeinsam benutzt, damit die Tests
// genau den Code prüfen, der ausgeliefert wird.
//
// Unterstützt genau die Schreibweisen, die in src/ verwendet werden:
//   import { a, b } from "./datei.js";
//   export const|let|function|async function name ...
// Andere Formen (export default, export { }, import * as, "as"-Umbenennungen) brechen mit Fehler ab.

const fs = require("node:fs");
const path = require("node:path");

const importRe = /^import\s+\{([\s\S]*?)\}\s+from\s+"\.\/([\w-]+\.js)";?[ \t]*$/gm;
const exportRe = /^export\s+(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm;

// entry: Startmodul. autorun: true = Startmodul wird ausgeführt (fertige Seite);
// false = das Skript liefert die require-Funktion zurück (für Tests).
// transform(name, source): optional, ändert den Quelltext eines Moduls (Tests).
function bundle({ srcDir, entry = "main.js", autorun = true, transform = (name, source) => source }) {
  const compiled = new Map(); // Modulname -> Quelltext der Modulfunktion, Abhängigkeiten zuerst
  const visiting = new Set();

  function compile(name) {
    if (compiled.has(name)) return;
    if (visiting.has(name)) throw new Error(`Zirkuläre Abhängigkeit bei ${name}`);
    visiting.add(name);

    let code = fs.readFileSync(path.join(srcDir, name), "utf8").replace(/\r\n/g, "\n");
    code = transform(name, code);

    code = code.replace(importRe, (match, specifiers, file) => {
      if (/\bas\b/.test(specifiers)) throw new Error(`${name}: "as" in Imports wird nicht unterstützt.`);
      compile(file);
      return `const {${specifiers}} = __require("${file}");`;
    });
    if (/^import\b/m.test(code)) throw new Error(`${name}: nicht unterstützte import-Form.`);

    const exportNames = [...code.matchAll(exportRe)].map(match => match[1]);
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

  const code = [
    "// AUTOMATISCH ERZEUGT von build.cjs aus src/*.js. Nicht von Hand ändern, sondern src/ ändern und neu bauen.",
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
    autorun ? `  __require("${entry}");` : "  return __require;",
    "})();",
    ""
  ].join("\n");

  return { code, modules: [...compiled.keys()] };
}

module.exports = { bundle };
