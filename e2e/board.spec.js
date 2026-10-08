const { test, expect } = require("@playwright/test");
const {  makeTask, openBoard, column, card, titlesIn, openEditor } = require("./helpers");

test("jede id kommt in index.html nur einmal vor", async ({ page }) => {
    await openBoard(page);
    const duplicates = await page.evaluate(() => {
        const seen = new Set();
        const result = [];
        document.querySelectorAll("[id]").forEach(el => {
            if (seen.has(el.id)) result.push(el.id);
            seen.add(el.id);
        });
        return result;
    });
    expect(duplicates).toEqual([]);
});

test("nur die Spalten scrollen, die Fußzeile sitzt direkt darunter am unteren Rand", async ({ page }) => {
    const tasks = Array.from({ length: 40 }, (_, i) => makeTask(i + 1, { t: `Scrolltest ${i + 1}` }));
    await openBoard(page, tasks);

    const pageScrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    const columnScrolls = await column(page, "todo").evaluate(el => el.scrollHeight > el.clientHeight);
    expect(pageScrolls).toBe(false);
    expect(columnScrolls).toBe(true);

    const col = await column(page, "todo").boundingBox();
    const foot = await page.locator("#foot").boundingBox();
    const height = page.viewportSize().height;
    expect(foot.y - (col.y + col.height)).toBeLessThan(10);
    expect(Math.abs(foot.y + foot.height - height)).toBeLessThanOrEqual(2);
});

test("legt Aufgaben mit der Eingabetaste an und leert das Feld", async ({ page }) => {
    await openBoard(page, []);
    await page.fill("#t", "Per Enter");
    await page.press("#t", "Enter");

    await expect(card(page, "Per Enter")).toBeVisible();
    await expect(page.locator("#t")).toHaveValue("");
});

test("weist eine leere Aufgabe mit Hinweis ab", async ({ page }) => {
    await openBoard(page, []);
    await page.getByRole("button", { name: "Hinzufügen" }).click();

    await expect(page.locator("#msg")).toContainText("Bitte eine Aufgabe eingeben");
    await expect(page.locator("#t")).toBeFocused();
    await expect(page.locator(".card")).toHaveCount(0);
});

test("sortiert nach Priorität", async ({ page }) => {
    await openBoard(page, [
        makeTask(1, { t: "Niedrig", p: "niedrig" }),
        makeTask(2, { t: "Hoch", p: "hoch" }),
        makeTask(3, { t: "Mittel", p: "mittel" })
    ]);
    expect(await titlesIn(page, "todo")).toEqual(["Hoch", "Mittel", "Niedrig"]);
});

test("zeigt überfällige Termine und verpassten Start", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Überfällig", due: "2020-01-01", e: 8 })]);
    const item = card(page, "Überfällig");

    await expect(item).toContainText("(überfällig)");
    await expect(item).toContainText("(verpasst)");
});

test("zeigt die Alterung einer lange wartenden Aufgabe", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Lange wartend", p: "niedrig", created: Date.now() - 15 * 864e5 })]);
    const item = card(page, "Lange wartend");

    await expect(item).toContainText("Wartet seit 15 Tagen");
    await expect(item).toContainText("durch Alterung 2 Stufen höher");
});

test("verschiebt Aufgaben mit den Pfeilen", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Pfeiltest" })]);
    const forward = () => card(page, "Pfeiltest").getByRole("button", { name: /Eine Spalte weiter/ });

    await forward().click();
    await expect(column(page, "doing").locator(".card", { hasText: "Pfeiltest" })).toBeVisible();
    await forward().click();
    await expect(column(page, "done").locator(".card", { hasText: "Pfeiltest" })).toContainText("Erledigt:");
});

test("verschiebt Aufgaben per Drag-and-drop", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Ziehtest" })]);
    await card(page, "Ziehtest").dragTo(column(page, "doing"));

    await expect(column(page, "doing").locator(".card", { hasText: "Ziehtest" })).toBeVisible();
    await expect(column(page, "todo").locator(".card")).toHaveCount(0);
});

test("löscht eine Aufgabe und holt sie mit Rückgängig zurück", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Löschtest" })]);
    const item = card(page, "Löschtest");

    await item.getByRole("button", { name: /Löschen/ }).click();
    await expect(item).toHaveCount(0);
    await expect(page.locator("#toast")).toBeVisible();
    await expect(page.locator("#ttext")).toContainText("Löschtest");

    await page.locator("#tundo").click();
    await expect(item).toBeVisible();
    await expect(page.locator("#toast")).toBeHidden();
});

test("bearbeitet eine Aufgabe im Dialog und setzt den Fokus auf das Textfeld", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Vorher" })]);
    await openEditor(page, "Vorher");
    await expect(page.locator("#et")).toBeFocused();

    await page.fill("#et", "Nachher");
    await page.selectOption("#ep", "hoch");
    await page.locator("#ef").getByRole("button", { name: "Speichern" }).click();

    await expect(page.locator("#edlg")).toBeHidden();
    await expect(card(page, "Nachher")).toBeVisible();
    await expect(card(page, "Nachher")).toContainText("Priorität: Hoch");
});

test("verwirft Änderungen, wenn der Dialog mit Escape geschlossen wird", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Unverändert" })]);
    await openEditor(page, "Unverändert");
    await page.fill("#et", "Nicht gespeichert");
    await page.keyboard.press("Escape");

    await expect(page.locator("#edlg")).toBeHidden();
    await expect(card(page, "Unverändert")).toBeVisible();
    await expect(card(page, "Nicht gespeichert")).toHaveCount(0);
});