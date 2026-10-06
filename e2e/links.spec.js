const { test, expect } = require("@playwright/test");
const { makeTask, openBoard, card, addTask, openEditor } = require("./helpers");

test("zeigt einen Weblink auf der Karte und öffnet ihn sicher in einem neuen Tab", async ({ page }) => {
    await openBoard(page, []);
    await addTask(page, "Weblink", "https://example.com/x");

    const link = card(page, "Weblink").locator("a.tlink");
    await expect(link).toHaveAttribute("href", "https://example.com/x");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
});

test("akzeptiert Dateilinks", async ({ page }) => {
    await openBoard(page, []);
    await addTask(page, "Dateilink", "file:///Users/name/Bericht.pdf");

    await expect(card(page, "Dateilink").locator("a.tlink")).toHaveAttribute("href", "file:///Users/name/Bericht.pdf");
});

test("lehnt gefährliche Links ab und legt keine Aufgabe an", async ({ page }) => {
    await openBoard(page, []);
    await addTask(page, "Böser Link", "javascript:alert(1)");

    await expect(page.locator("#msg")).toContainText("Der Link muss mit http");
    await expect(page.locator(".card")).toHaveCount(0);
});

test("zeigt manipulierte Links aus dem Speicher nicht an", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Manipuliert", l: "javascript:alert(1)" })]);

    await expect(card(page, "Manipuliert")).toBeVisible();
    await expect(card(page, "Manipuliert").locator("a")).toHaveCount(0);
});

test("ändert und entfernt Links im Bearbeiten-Dialog", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Linkbearbeitung", l: "https://alt.example.com" })]);

    await openEditor(page, "Linkbearbeitung");
    await expect(page.locator("#el")).toHaveValue("https://alt.example.com");
    await page.fill("#el", "https://neu.example.com");
    await page.locator("#ef").getByRole("button", { name: "Speichern" }).click();
    await expect(card(page, "Linkbearbeitung").locator("a.tlink")).toHaveAttribute("href", "https://neu.example.com");

    await openEditor(page, "Linkbearbeitung");
    await page.fill("#el", "");
    await page.locator("#ef").getByRole("button", { name: "Speichern" }).click();
    await expect(card(page, "Linkbearbeitung").locator("a")).toHaveCount(0);
});

test("zeigt HTML im Titel als Text und führt keinen Code aus", async ({ page }) => {
    const evil = '<img src=x onerror="window.__xss = 1">';
    await openBoard(page, []);
    await addTask(page, evil);

    await expect(card(page, evil)).toBeVisible();
    await expect(page.locator("#b img")).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    await page.locator("#sumbtn").click();
    await expect(page.locator("#sum")).toContainText(evil);
    await expect(page.locator("#sum img")).toHaveCount(0);
});