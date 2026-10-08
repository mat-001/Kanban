const { test, expect } = require("@playwright/test");
const { makeTask, openBoard, card } = require("./helpers");

test("zeigt für einen unmöglichen Zieltermin aus dem Speicher keinen Termin und keinen Fehlertext", async ({ page }) => {
    await openBoard(page, [
        makeTask(1, { t: "Falscher Termin", due: "2026-02-31" }),
        makeTask(2, { t: "Daneben" })
    ]);
    const item = card(page, "Falscher Termin");

    await expect(item).toBeVisible();
    await expect(item).not.toContainText("Termin:");
    await expect(item).not.toContainText("Invalid");
    await expect(item).not.toContainText("NaN");
    await expect(card(page, "Daneben")).toBeVisible();
});

test("zeigt einen echten Zieltermin am Schalttag korrekt an", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Schalttag", due: "2028-02-29" })]);

    await expect(card(page, "Schalttag")).toContainText(/Termin: 29\.2\.2028/);
});

test("zählt einen unmöglichen Zieltermin nicht als verpassten Start", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Falscher Termin", due: "2026-02-31" })]);
    await page.locator("#sumbtn").click();

    await expect(page.locator("#sum .s-stand")).toContainText("Mit verpasstem Start: 0");
});