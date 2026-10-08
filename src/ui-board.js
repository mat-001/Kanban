(function (Kanban) {
    const { ageDays, fmt, fmtD, lastStart, today } = Kanban;
    const { COLS, effRank, RANK, sorter } = Kanban;
    const { moveTask, state } = Kanban;
    const { openEdit, removeTask } = Kanban;
    const $ = id => document.getElementById(id);

    let dragId = null;

    function createActionButton(container, task, label, title, action) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", `${title}: ${task.t.slice(0, 60)}`);
        button.onclick = action;
        container.appendChild(button);
    }

    function createTaskMetadata(task, column) {
        const metadata = document.createElement("div");
        metadata.className = "meta";

        const currentDate = today();
        const isOpen = column !== "done";
        const age = ageDays(task);
        const overdue = task.due && isOpen && task.due < currentDate;
        const priorityIncrease = isOpen ? RANK[task.p] - effRank(task, state.step) : 0;
        const latestStart = task.due && isOpen ? lastStart(task, state.buffer) : null;
        const waiting = isOpen && age >= 1
            ? `<br>Wartet seit ${age} Tag${age > 1 ? "en" : ""}`
            : "";
        const effort = task.e ? `<br>Aufwand: ${task.e} Std.` : "";
        const due = task.due
            ? `<br><span class="${overdue ? "late" : ""}">Termin: ${fmtD(task.due)}${overdue ? " (überfällig)" : ""}</span>`
            : "";
        const start = latestStart
            ? `<br><span class="${latestStart <= currentDate ? "late" : ""}">Spätester Start (mit Puffer): ` +
            `${fmtD(latestStart)}${latestStart < currentDate ? " (verpasst)" : latestStart === currentDate ? " (heute!)" : ""}</span>`
            : "";
        const completed = task.doneAt ? `<br>Erledigt: ${fmt(task.doneAt)}` : "";
        const rank = task.p[0].toUpperCase() + task.p.slice(1);
        const aging = priorityIncrease
            ? ` (durch Alterung ${priorityIncrease} Stufe${priorityIncrease > 1 ? "n" : ""} höher)`
            : "";

        metadata.innerHTML =
            `Priorität: ${rank}${aging}<br>Abgelegt: ${fmt(task.created)}` +
            waiting + effort + due + start + completed;
        return metadata;
    }

    function createTaskCard(task, columnIndex, column) {
        const card = document.createElement("div");
        card.className = `card ${task.p}`;
        card.draggable = true;
        card.ondragstart = () => {
            dragId = task.id;
            card.classList.add("drag");
        };
        card.ondragend = () => card.classList.remove("drag");

        const body = document.createElement("div");
        const title = document.createElement("div");
        title.className = "ttitle";
        title.textContent = task.t;
        body.append(title, createTaskMetadata(task, column));
        if (task.l) {
            const link = document.createElement("a");
            link.href = task.l;
            link.textContent = "🔗 Link öffnen";
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.className = "tlink";
            link.draggable = false;
            body.appendChild(link);
        }

        const actions = document.createElement("div");
        actions.className = "mv";
        if (columnIndex > 0) {
            createActionButton(actions, task, "←", "Eine Spalte zurück", () => {
                moveTask(task, COLS[columnIndex - 1][0]);
                render();
            });
        }
        if (columnIndex < COLS.length - 1) {
            createActionButton(actions, task, "→", "Eine Spalte weiter", () => {
                moveTask(task, COLS[columnIndex + 1][0]);
                render();
            });
        }
        createActionButton(actions, task, "✎", "Bearbeiten", () => openEdit(task));
        createActionButton(actions, task, "✕", "Löschen", () => removeTask(task, render));
        card.append(body, actions);
        return card;
    }

    function createColumn([key, name, subtitle], index) {
        const column = document.createElement("div");
        column.className = `col col-${key}`;

        const tasks = state.tasks
            .filter(task => task.c === key)
            .sort(sorter(key, state.step, state.buffer));
        column.innerHTML = `<h2>${name}<span>${tasks.length}</span></h2><div class="sub">${subtitle}</div>`;

        column.ondragover = event => {
            event.preventDefault();
            column.classList.add("over");
        };
        column.ondragleave = () => column.classList.remove("over");
        column.ondrop = event => {
            event.preventDefault();
            column.classList.remove("over");
            const task = state.tasks.find(item => item.id === dragId);
            if (task && task.c !== key) {
                moveTask(task, key);
                render();
            }
        };

        if (!tasks.length) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "Keine Aufgaben";
            column.appendChild(empty);
        } else {
            tasks.forEach(task => column.appendChild(createTaskCard(task, index, key)));
        }
        return column;
    }

    function render() {
        $("b").replaceChildren(...COLS.map(createColumn));
        if (Kanban.updateFooter) Kanban.updateFooter();
    }

    Object.assign(Kanban, { render });
})(window.Kanban ||= {});