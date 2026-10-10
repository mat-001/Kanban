const { pathToFileURL } = require("node:url");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const url = pathToFileURL(path.join(root, "dist", "index.html")).href;

function makeTask(id, overrides = {}) {
    return { id, t: `Aufgabe ${id}`, c: "todo", p: "mittel", created: Date.now() - id, due: "", e: 1, ...overrides };
}

// Öffnet das Board. Mit `tasks` wird der Speicher vorbefüllt und die Seite neu geladen.
async function openBoard(page, tasks) {
    await page.goto(url);
    if (tasks) {
        await page.evaluate(data => localStorage.setItem("kanban", data), JSON.stringify(tasks));
        await page.reload();
    }
}

const column = (page, key) => page.locator(`.col-${key}`);
const card = (page, title) => page.locator(".card", { hasText: title });
const titlesIn = (page, key) => column(page, key).locator(".card .ttitle").allTextContents();

// Öffnet das Fenster „Neue Aufgabe“ über den Knopf oben.
async function openNewTask(page) {
    await page.locator("#add").click();
    await page.locator("#ndlg").waitFor();
}

// Legt eine Aufgabe über das Fenster „Neue Aufgabe“ an. Bei einer Fehlermeldung bleibt das Fenster offen.
async function addTask(page, title, link = "") {
    await openNewTask(page);
    await page.fill("#t", title);
    if (link) await page.fill("#l", link);
    await page.locator("#f").getByRole("button", { name: "Hinzufügen" }).click();
}

async function openEditor(page, title) {
    await card(page, title).getByRole("button", { name: /Bearbeiten/ }).click();
    await page.locator("#edlg").waitFor();
}

module.exports = { url, makeTask, openBoard, column, card, titlesIn, addTask, openNewTask, openEditor };