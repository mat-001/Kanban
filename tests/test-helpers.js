const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { bundle } = require("../bundle.cjs");

const projectRoot = path.resolve(__dirname, "..");
const DAY_MS = 864e5;
const FIXED_NOW = new Date(2026, 9, 4, 12).getTime();

function getAllFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(getAllFiles(fullPath));
        } else if (entry.isFile()) {
            files.push(fullPath);
        }
    }
    return files;
}

function createApp({ storage = {}, now = FIXED_NOW, failWrites = [], maxValueLength = {}, patch = {} } = {}) {
    const storedValues = new Map(Object.entries({ kanban: "[]", ...storage }));
    if (storage.kanban === null) storedValues.delete("kanban"); // leerer Speicher = erster Start
    const failedKeys = new Set(failWrites);
    const valueLimits = new Map(Object.entries(maxValueLength));
    const writes = [];
    const downloads = [];
    const blobUrls = new Map();
    const revokedUrls = [];
    const events = [];
    const elements = new Map();
    const timers = new Map();
    let nextTimerId = 1;
    const NativeDate = Date;

    class FixedDate extends NativeDate {
        constructor(...args) {
            super(...(args.length ? args : [now]));
        }

        static now() {
            return now;
        }
    }

    function makeElement(tagName = "div", id = "") {
        const classes = new Set();
        const node = {
            tagName,
            id,
            hidden: false,
            textContent: "",
            className: "",
            value: "",
            type: "",
            title: "",
            draggable: false,
            validity: { badInput: false },
            files: [],
            children: [],
            open: false,
            attributes: {},
            classList: {
                add(name) { classes.add(name); },
                remove(name) { classes.delete(name); },
                contains(name) { return classes.has(name); }
            },
            appendChild(child) { this.children.push(child); },
            append(...children) { this.children.push(...children); },
            replaceChildren(...children) { this.children = children; },
            setAttribute(name, value) { this.attributes[name] = value; },
            focus() { this.focused = true; },
            showModal() { this.open = true; },
            close() { this.open = false; },
            click() {
                this.clicked = true;
                if (this.tagName === "a" && this.download) {
                    downloads.push({ filename: this.download, href: this.href, blob: blobUrls.get(this.href) });
                }
                if (this.onclick) this.onclick();
            },
            remove() { this.removed = true; },
            replaceWith(replacement) {
                if (this.id) elements.set(this.id, replacement);
            }
        };
        Object.defineProperties(node, {
            outerHTML: { get() { return `<${this.tagName} id="${this.id}">`; } },
            firstElementChild: { get() { return this.children[0] || null; } },
            innerHTML: {
                get() { return this._innerHTML || ""; },
                set(value) {
                    this._innerHTML = value;
                    const match = value.match(/<input\b[^>]*\bid="([^"]+)"/);
                    if (match) this.children = [makeElement("input", match[1])];
                }
            }
        });
        return node;
    }

    function element(id) {
        if (!elements.has(id)) {
            const inputIds = new Set(["age", "buf", "d", "days", "ed", "ee", "e", "ep", "et", "impfile", "p", "t"]);
            const tagName = inputIds.has(id) ? "input" : "div";
            const input = makeElement(tagName, id);
            if (id === "p" || id === "ep") input.value = "mittel";
            if (id === "e") input.value = "1";
            elements.set(id, input);
        }
        return elements.get(id);
    }

    const document = {
        body: { appendChild() { } },
        createElement(tagName) { return makeElement(tagName); },
        getElementById: element
    };

    const timersApi = {
        setTimeout(callback, delay) {
            const id = nextTimerId++;
            timers.set(id, { callback, delay });
            return id;
        },
        clearTimeout(id) { timers.delete(id); }
    };

    const sandbox = {
        Date: FixedDate,
        Blob,
        URL: {
            createObjectURL(blob) {
                const url = `blob:test-${blobUrls.size + 1}`;
                blobUrls.set(url, blob);
                return url;
            },
            revokeObjectURL(url) { revokedUrls.push(url); }
        },
        document,
        setTimeout: timersApi.setTimeout,
        clearTimeout: timersApi.clearTimeout,
        localStorage: {
            getItem(key) { return storedValues.has(key) ? storedValues.get(key) : null; },
            setItem(key, value) {
                writes.push(key);
                if (failedKeys.has(key)) throw new Error("Storage unavailable");
                if (valueLimits.has(key) && String(value).length > valueLimits.get(key)) throw new Error("Quota exceeded");
                storedValues.set(key, String(value));
            },
            removeItem(key) {
                writes.push(key);
                storedValues.delete(key);
            }
        }
    };
    sandbox.window = sandbox;

    // Die Module aus src/ werden mit demselben Bündler wie im Build zusammengesetzt (aber ohne Autostart)
    // und in der Sandbox ausgeführt. Ergebnis ist die require-Funktion für die einzelnen Module.
    const { code } = bundle({
        srcDir: path.join(projectRoot, "src"),
        entry: "main.js",
        autorun: false,
        transform: (name, source) => (patch[name] ? patch[name](source) : source)
    });
    const req = vm.runInNewContext(code, sandbox, { filename: "kanban-test-bundle.js" });

    // Eigener Speicher und eigene Aktionen pro Test: es gibt keinen globalen Zustand mehr.
    const store = req("storage.js").createStore();
    const actions = req("task.js").createTaskActions(store);
    store.on("saved", () => events.push("saved"));
    store.on("failed", () => events.push("failed"));

    // Kurzschreibweise für die Tests: alle Funktionen und Konstanten an einer Stelle.
    const Kanban = {
        ...req("constants.js"),
        ...req("dates.js"),
        ...req("sort.js"),
        cleanTask: req("storage.js").cleanTask,
        migrate: req("storage.js").migrate,
        state: store.state,
        save: store.save,
        saveLog: store.saveLog,
        saveSetting: store.saveSetting,
        pruneLog: store.pruneLog,
        addLog: store.addLog,
        ...actions,
        initBackup: onChange => req("backup.js").initBackup({ store, onChange }),
        initSummary: () => req("summary.js").initSummary({ store })
    };

    return {
        Kanban,
        store,
        actions,
        req,
        document,
        element,
        events,
        sandbox,
        timers,
        storedValues,
        writes,
        downloads,
        revokedUrls
    };
}

function loadBoard(app) {
    app.req("app.js").startApp({ store: app.store, actions: app.actions });
    return app;
}

function submitEvent() {
    return { preventDefault() { } };
}

// Sucht Nachfahren eines Elements anhand ihres Klassennamens (unabhängig von ihrer Position).
function findAll(root, className) {
    const found = [];
    const visit = node => {
        for (const child of node.children || []) {
            if (String(child.className || "").split(/\s+/).includes(className)) found.push(child);
            visit(child);
        }
    };
    visit(root);
    return found;
}

const find = (root, className) => findAll(root, className)[0] || null;
const columnFor = (app, key) => find(app.element("b"), `col-${key}`);

function cardFor(app, title) {
    return findAll(app.element("b"), "card")
        .find(card => find(card, "ttitle")?.textContent === title) || null;
}

function actionButton(card, label) {
    return find(card, "mv").children.find(button => button.textContent === label);
}

function task(id, overrides = {}) {
    return {
        id,
        t: `Aufgabe ${id}`,
        c: "todo",
        p: "mittel",
        created: FIXED_NOW - id,
        due: "",
        e: 8,
        ...overrides
    };
}

function withVersion(version, migrations = "{}") {
    return {
        "constants.js": source => source.replace(/export const DATA_VERSION = \d+;/, `export const DATA_VERSION = ${version};`),
        "storage.js": source => source.replace(/export const MIGRATIONS = \{\};/, `export const MIGRATIONS = ${migrations};`)
    };
}

module.exports = {
    projectRoot,
    DAY_MS,
    FIXED_NOW,
    getAllFiles,
    createApp,
    loadBoard,
    submitEvent,
    find,
    findAll,
    columnFor,
    cardFor,
    actionButton,
    task,
    withVersion
};