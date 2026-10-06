const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const { makeTask, openBoard, card, addTask } = require("./helpers");

test("behält Aufgaben nach dem Neuladen", async ({ page }) => {
    await openBoard(page, []);
    await addTask(page, "Bleibt erhalten", "https://example.com");
    await page.reload();

    await expect(card(page, "Bleibt erhalten")).toBeVisible();
    await expect(card(page, "Bleibt erhalten").locator("a.tlink")).toHaveAttribute("href", "https://example.com");
});

test("speichert Einstellungen dauerhaft", async ({ page }) => {
    await openBoard(page);
    await page.locator("#gear").click();
    await page.locator("#buf").fill("3");
    await page.locator("#buf").blur();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("kanban_buf"))).toBe("3");

    await page.reload();
    await expect(page.locator("#buf")).toHaveValue("3");
});

test("zeigt in der Fußzeile den Speicherverbrauch", async ({ page }) => {
    await openBoard(page, []);
    await expect(page.locator("#foot")).toContainText("Aufgaben:");
    await expect(page.locator("#foot")).toContainText("Protokoll:");

    await addTask(page, "Fußzeilentest");
    await expect(page.locator("#fa")).not.toHaveText("Aufgaben: 0 Byte");
    await expect(page.locator("#ft")).toContainText("%");
});

test("meldet beschädigte Daten und legt eine Originalkopie ab", async ({ page }) => {
    await openBoard(page);
    await page.evaluate(() => localStorage.setItem("kanban", "{invalid"));
    await page.reload();

    await expect(page.locator("#notice")).toBeVisible();
    await expect(page.locator("#ntext")).toContainText("beschädigt");
    expect(await page.evaluate(() => localStorage.getItem("kanban_defekt"))).toBe("{invalid");
});

test("behandelt Daten einer neueren Version als schreibgeschützt", async ({ page }) => {
    await openBoard(page);
    const original = JSON.stringify([makeTask(1, { t: "Zukunft" })]);
    await page.evaluate(data => {
        localStorage.setItem("kanban", data);
        localStorage.setItem("kanban_version", "2");
    }, original);
    await page.reload();

    await expect(page.locator("#notice")).toBeVisible();
    await expect(page.locator("#ntext")).toContainText("neueren Version");

    await addTask(page, "Wird nicht gespeichert");
    expect(await page.evaluate(() => localStorage.getItem("kanban"))).toBe(original);
    expect(await page.evaluate(() => localStorage.getItem("kanban_version"))).toBe("2");
});

test("exportiert eine Sicherung und importiert sie wieder", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Roundtrip", l: "https://example.com" })]);
    await page.locator("#gear").click();

    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#exp").click()]);
    expect(download.suggestedFilename()).toMatch(/^kanban-sicherung-\d{4}-\d{2}-\d{2}\.json$/);
    const content = fs.readFileSync(await download.path(), "utf8");
    const backup = JSON.parse(content);
    expect(backup.format).toBe("kanban-sicherung");
    expect(backup.tasks[0].t).toBe("Roundtrip");

    // Speicher leeren, damit der Import in ein leeres Board läuft
    await page.evaluate(() => localStorage.setItem("kanban", "[]"));
    await page.reload();
    await expect(page.locator(".card")).toHaveCount(0);

    await page.locator("#gear").click();
    await page.locator("#impfile").setInputFiles({
        name: "sicherung.json",
        mimeType: "application/json",
        buffer: Buffer.from(content)
    });

    await expect(page.locator("#dmsg")).toContainText("1 Aufgabe hinzugefügt");
    await page.locator("#close").click();
    await expect(card(page, "Roundtrip").locator("a.tlink")).toHaveAttribute("href", "https://example.com");
});

test("lehnt eine ungültige Importdatei ab", async ({ page }) => {
    await openBoard(page, [makeTask(1, { t: "Bleibt" })]);
    await page.locator("#gear").click();
    await page.locator("#impfile").setInputFiles({
        name: "kaputt.json",
        mimeType: "application/json",
        buffer: Buffer.from("kein JSON")
    });

    await expect(page.locator("#dmsg")).toContainText("keine gültige Sicherung");
    await page.locator("#close").click();
    await expect(card(page, "Bleibt")).toBeVisible();
});