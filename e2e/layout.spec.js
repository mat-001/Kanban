const { test, expect } = require("@playwright/test");
const { makeTask, openBoard, column } = require("./helpers");

const manyTasks = () =>
    Array.from({ length: 40 }, (_, i) => makeTask(i + 1, { t: `Layouttest ${i + 1}` }));

const pageScrolls = page =>
    page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);

test("bei niedrigem Fenster scrollt die ganze Seite und Kopf- und Fußzeile sind erreichbar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await openBoard(page, manyTasks());

    expect(await pageScrolls(page)).toBe(true);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator("#foot")).toBeInViewport({ ratio: 1 });

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator("h1")).toBeInViewport({ ratio: 1 });
    await expect(page.locator("#add")).toBeInViewport({ ratio: 1 });
});

test("bei normaler Höhe scrollt die Seite nicht und die Fußzeile steht am unteren Rand", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBoard(page, manyTasks());

    expect(await pageScrolls(page)).toBe(false);
    await expect(page.locator("#foot")).toBeInViewport({ ratio: 1 });
});

test("bei niedrigem Fenster scrollen die Spalten weiterhin für sich", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await openBoard(page, manyTasks());

    const columnScrolls = await column(page, "todo").evaluate(el => el.scrollHeight > el.clientHeight);
    expect(columnScrolls).toBe(true);
});

test("wechselt beim Ändern der Fensterhöhe zwischen fester und scrollender Seite", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBoard(page, manyTasks());
    expect(await pageScrolls(page)).toBe(false);

    await page.setViewportSize({ width: 1280, height: 400 });
    await expect.poll(() => pageScrolls(page)).toBe(true);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(() => pageScrolls(page)).toBe(false);
});