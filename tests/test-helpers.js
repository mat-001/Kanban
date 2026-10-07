const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const DAY_MS = 864e5;
const FIXED_NOW = new Date(2026, 9, 4, 12).getTime();

function findScriptPath(filename) {
    const directPath = path.join(projectRoot, "src", filename);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
        return directPath;
    }

    const rootDirectPath = path.join(projectRoot, filename);
    if (fs.existsSync(rootDirectPath) && fs.statSync(rootDirectPath).isFile()) {
        return rootDirectPath;
    }

    function searchDir(dir) {
        if (!fs.existsSync(dir)) return null;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const found = searchDir(fullPath);
                if (found) return found;
            } else if (entry.isFile()) {
                if (entry.name === filename || fullPath.endsWith(path.sep + filename) || fullPath.endsWith("/" + filename)) {
                    return fullPath;
                }
            }
        }
        return null;
    }

    return searchDir(path.join(projectRoot, "src")) || searchDir(projectRoot);
}

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
    const listeners = new Map();
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
        dispatchEvent(event) {
            events.push(event.type);
            (listeners.get(event.type) || []).forEach(listener => listener(event));
        },
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(listener);
        },
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
        CustomEvent: class CustomEvent {
            constructor(type) { this.type = type; }
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

    const load = filename => {
        const filePath = findScriptPath(filename);
        if (!filePath) throw new Error(`Skriptdatei nicht gefunden: ${filename}`);
        let source = fs.readFileSync(filePath, "utf8");
        const baseName = path.basename(filePath);
        if (patch[filename]) source = patch[filename](source);
        else if (patch[baseName]) source = patch[baseName](source);
        vm.runInNewContext(source, sandbox, { filename: baseName });
    };

    ["dates.js", "sort.js", "storage.js", "task.js"].forEach(load);

    return {
        Kanban: sandbox.Kanban,
        document,
        element,
        events,
        load,
        sandbox,
        timers,
        storedValues,
        writes,
        downloads,
        revokedUrls
    };
}

function loadBoard(app) {
    app.load("backup.js");
    app.load("summary.js");
    app.load("ui-notifications.js");
    app.load("ui-dialogs.js");
    app.load("ui-board.js");
    app.load("app.js");
    return app;
}

function submitEvent() {
    return { preventDefault() { } };
}

function cardFor(app, title) {
    for (const column of app.element("b").children) {
        const card = column.children.find(child =>
            child.className.startsWith("card ") &&
            child.children[0].children[0].textContent === title);
        if (card) return card;
    }
    return null;
}

function actionButton(card, label) {
    return card.children[1].children.find(button => button.textContent === label);
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
        "storage.js": source => source.replace(
            /const DATA_VERSION = \d+;\s*const MIGRATIONS = \{[^}]*\};/,
            `const DATA_VERSION = ${version};\n  const MIGRATIONS = ${migrations};`
        )
    };
}

module.exports = {
    projectRoot,
    DAY_MS,
    FIXED_NOW,
    findScriptPath,
    getAllFiles,
    createApp,
    loadBoard,
    submitEvent,
    cardFor,
    actionButton,
    task,
    withVersion
};