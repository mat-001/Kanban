const { test, expect } = require("@playwright/test");
const { makeTask, openBoard, card, openEditor, openNewTask } = require("./helpers");

test("schließt das Fenster Neue Aufgabe mit Abbrechen, Escape und Klick auf den Hintergrund ohne Anlegen", async ({ page }) => {
    await openBoard(page, []);

    await openNewTask(page);
    await page.fill("#t", "Nicht gespeichert");
    await page.locator("#ncancel").click();
    await expect(page.locator("#ndlg")).toBeHidden();

    await openNewTask(page);
    await expect(page.locator("#t")).toHaveValue("");
    await page.fill("#t", "Nicht gespeichert");
    await page.keyboard.press("Escape");
    await expect(page.locator("#ndlg")).toBeHidden();

    await openNewTask(page);
    await page.mouse.click(5, 5); // außerhalb des Fensters, also auf dem Hintergrund
    await expect(page.locator("#ndlg")).toBeHidden();

    await expect(page.locator(".card")).toHaveCount(0);
});

test("Neue Aufgabe: Text und Link nutzen die Breite des Fensters, die Knöpfe stehen in einer eigenen Zeile", async ({ page }) => {
    await openBoard(page, []);
    await openNewTask(page);

    const dialog = await page.locator("#ndlg").boundingBox();
    for (const id of ["#t", "#l"]) {
        const box = await page.locator(id).boundingBox();
        expect(box.width, id).toBeGreaterThan(dialog.width - 60);
    }

    const link = await page.locator("#l").boundingBox();
    const add = await page.locator("#f").getByRole("button", { name: "Hinzufügen" }).boundingBox();
    const cancel = await page.locator("#ncancel").boundingBox();
    expect(add.y).toBeGreaterThanOrEqual(link.y + link.height);
    expect(Math.abs(add.y - cancel.y)).toBeLessThan(2);
});

test("Aufgabe bearbeiten: Text und Link nutzen die Breite des Fensters, die Knöpfe stehen in einer eigenen Zeile", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Breitentest" })]);
    await openEditor(page, "Breitentest");

    const dialog = await page.locator("#edlg").boundingBox();
    for (const id of ["#et", "#el"]) {
        const box = await page.locator(id).boundingBox();
        expect(box.width, id).toBeGreaterThan(dialog.width - 60);
    }

    const link = await page.locator("#el").boundingBox();
    const save = await page.locator("#ef").getByRole("button", { name: "Speichern" }).boundingBox();
    const cancel = await page.locator("#ecancel").boundingBox();
    expect(save.y).toBeGreaterThanOrEqual(link.y + link.height);
    expect(Math.abs(save.y - cancel.y)).toBeLessThan(2);
});

test("zeigt Zeilenumbrüche des Aufgabentextes auf der Karte", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Zeile A\nZeile B" })]);

    const title = card(page, "Zeile A").locator(".ttitle");
    await expect(title).toHaveCSS("white-space", "pre-line");
    // innerText berücksichtigt white-space: pre-line und liefert den Umbruch mit
    expect(await title.evaluate(el => el.innerText)).toBe("Zeile A\nZeile B");
});
