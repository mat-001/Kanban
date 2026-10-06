const fs = require("node:fs");

const files = ["index.html", "help.html", "style.css", "Kanban.png", "src"];

fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist");
for (const name of files) {
    if (fs.existsSync(name)) fs.cpSync(name, `dist/${name}`, { recursive: true });
}
console.log("Fertig: Ordner dist/ enthält nur die Website.");