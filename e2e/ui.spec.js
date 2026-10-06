const { test, expect } = require("@playwright/test");
const { openBoard, addTask } = require("./helpers");

test("zeigt die Zusammenfassung und wechselt den Zeitraum", async ({ page }) => {
    await openBoard(page);
    await addTask(page, "Zusammenfassungstest");

    await page.locator("#sumbtn").click();
    await expect(page.locator("#sdlg")).toBeVisible();
    await expect(page.locator("#stitle")).toHaveText("Die letzten 24 Stunden");
    await expect(page.locator("#sum")).toContainText("Zusammenfassungstest");

    await page.locator("#days").fill("7");
    await page.locator("#days").blur();
    await expect(page.locator("#stitle")).toHaveText("Die letzten 7 Tage");
});

test("wechselt zwischen hellem und dunklem Farbschema", async ({ page }) => {
    await openBoard(page);

    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(244, 245, 247)");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(20, 23, 31)");
});

test("öffnet die Hilfe in einem neuen Tab", async ({ page, context }) => {
    await openBoard(page);
    const [help] = await Promise.all([context.waitForEvent("page"), page.locator("#help").click()]);
    await help.waitForLoadState();

    expect(help.url()).toMatch(/help\.html$/);
    await expect(help.locator("h1")).toContainText("Hilfe");
});