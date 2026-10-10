// Canonical build entry for the browser bundle used by the production app and the tests.
// Use: node build.cjs
// The legacy wrappers build.js / build.mjs delegate here to keep the build path consistent.

const fs = require("node:fs");
const path = require("node:path");
const { bundle } = require("./bundle.cjs");

const ENTRY = "main.js";
const OUTPUT_DIR = path.join(__dirname, "dist");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "kanban.js");
const STATIC_FILES = ["help.html", "style.css", "Kanban.png"];
const SOURCE_SCRIPT = '<script src="kanban.js"></script>';

function buildWebsite() {
  const { code, modules } = bundle({ srcDir: path.join(__dirname, "src"), entry: ENTRY });
  const indexPath = path.join(__dirname, "index.html");
  const index = fs.readFileSync(indexPath, "utf8");
  const occurrences = index.split(SOURCE_SCRIPT).length - 1;

  if (occurrences !== 1) {
    throw new Error(`index.html muss genau einen Verweis auf ${SOURCE_SCRIPT} enthalten.`);
  }

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const file of STATIC_FILES) {
    fs.copyFileSync(path.join(__dirname, file), path.join(OUTPUT_DIR, file));
  }
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "index.html"),
    index.replace(SOURCE_SCRIPT, '<script src="kanban.js"></script>')
  );
  fs.writeFileSync(OUTPUT_FILE, code);

  console.log(`Produktionsversion in dist/ erstellt (${modules.length} Module, ${code.length} Zeichen).`);
}

if (require.main === module) {
  buildWebsite();
}

module.exports = { buildWebsite, ENTRY, OUTPUT_FILE };
