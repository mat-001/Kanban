(function (Kanban) {
  const { ageDays, fmt, fmtD, lastStart, today } = Kanban;
  const { MAX_EFFORT, MAX_SETTING, clampEffort, clampSetting } = Kanban;
  const { COLS, effRank, RANK, sorter } = Kanban;
  const { saveSetting, state } = Kanban;
  const { addTask, deleteTask, dismissUndo, moveTask, undoDelete, updateTask } = Kanban;
  const { initBackup, initSummary } = Kanban;
  const $ = id => document.getElementById(id);

  let noticeKind = null;
  let dragId = null;
  let undoTimer = null;
  let editing = null;

  function showNotice(kind, text, source = kind) {
    $("ntext").textContent = text;
    $("notice").className = `notice ${kind}`;
    $("notice").hidden = false;
    noticeKind = source;
  }

  function hideNotice(kind) {
    if (noticeKind !== kind) return;
    $("notice").hidden = true;
    noticeKind = null;
  }

  if (state.loadProblem) {
    let details = "";
    if (state.recoveryCopySaved) {
      details = " Die Originaldaten wurden als Sicherheitskopie im Browser abgelegt.";
    } else if (state.recoveryCopyAttempted) {
      details = " Die Sicherheitskopie konnte nicht im Browser abgelegt werden.";
    }
    showNotice("info", state.loadProblem + details);
  }
  document.addEventListener("kanban-storage-failed", () => {
    showNotice(
      "warn",
      "⚠️ Die Änderungen konnten nicht im Browser gespeichert werden (Speicher voll oder blockiert, z. B. im privaten Fenster). " +
      "Sie gehen beim Schließen oder Neuladen verloren. Sichere die Aufgaben jetzt mit ⚙️ → Exportieren.",
      "task-storage"
    );
  });
  document.addEventListener("kanban-storage-saved", () => hideNotice("task-storage"));

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
    title.textContent = task.t;
    body.append(title, createTaskMetadata(task, column));

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
    createActionButton(actions, task, "✕", "Löschen", () => removeTask(task));
    card.append(body, actions);
    return card;
  }

  function createColumn([key, name, subtitle], index) {
    const column = document.createElement("div");
    column.className = "col";

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
  }

  function hideToast() {
    $("toast").hidden = true;
    clearTimeout(undoTimer);
    dismissUndo();
  }

  function removeTask(task) {
    deleteTask(task);
    const title = task.t.length > 40 ? task.t.slice(0, 40) + "…" : task.t;
    $("ttext").textContent = `„${title}“ gelöscht.`;
    $("toast").hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideToast, 10000);
    render();
  }

  function resetDate(id = "d") {
    const input = $(id);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = input.outerHTML;
    input.replaceWith(wrapper.firstElementChild);
  }

  function showMessage(text, buttonText, messageId = "msg", dateId = "d") {
    const message = $(messageId);
    message.textContent = text + " ";
    if (buttonText) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = buttonText;
      button.onclick = () => {
        resetDate(dateId);
        message.hidden = true;
      };
      message.appendChild(button);
    }
    message.hidden = false;
  }

  $("f").onsubmit = event => {
    event.preventDefault();
    const titleInput = $("t");
    const title = titleInput.value.trim();
    const dueInput = $("d");
    $("msg").hidden = true;

    if (!title) {
      showMessage("Bitte eine Aufgabe eingeben.");
      titleInput.focus();
      return;
    }
    if (dueInput.validity.badInput) {
      showMessage("Der Zieltermin ist nur teilweise ausgefüllt. Bitte vollständig eingeben oder", "Termin leeren");
      return;
    }
    const effort = parseFloat($("e").value) || 0;
    if (effort > MAX_EFFORT) {
      showMessage(`Der Aufwand darf höchstens ${MAX_EFFORT} Stunden betragen.`);
      $("e").focus();
      return;
    }

    const now = Date.now();
    addTask({
      id: now,
      t: title,
      c: "todo",
      p: $("p").value,
      created: now,
      due: dueInput.value,
      e: clampEffort(effort)
    });
    titleInput.value = "";
    resetDate();
    $("e").value = "1";
    render();
  };

  function initSetting(key, inputId) {
    const input = $(inputId);
    input.value = state[key];
    input.onchange = () => {
      state[key] = clampSetting(parseInt(input.value, 10) || 0);
      input.value = state[key];
      if (!saveSetting(key, state[key])) {
        showNotice(
          "warn",
          "Die Einstellung gilt bis zum Schließen der Seite, konnte aber nicht gespeichert werden.",
          "setting-storage"
        );
      } else {
        hideNotice("setting-storage");
      }
      render();
    };
  }

  // Obergrenzen auch im Formular sichtbar machen (die Prüfung im Skript bleibt maßgeblich)
  $("e").max = $("ee").max = MAX_EFFORT;
  $("buf").max = $("age").max = MAX_SETTING;

  initSetting("buffer", "buf");
  initSetting("step", "age");

  const settingsDialog = $("dlg");
  $("gear").onclick = () => {
    $("dmsg").hidden = true;
    settingsDialog.showModal();
  };
  $("close").onclick = () => settingsDialog.close();
  settingsDialog.onclick = event => {
    if (event.target === settingsDialog) settingsDialog.close();
  };
  $("tundo").onclick = () => {
    if (undoDelete()) render();
    hideToast();
  };
  $("nclose").onclick = () => {
    $("notice").hidden = true;
    noticeKind = null;
  };

  const editDialog = $("edlg");
  function openEdit(task) {
    editing = task.id;
    $("et").value = task.t;
    $("ep").value = task.p;
    $("ee").value = task.e || 0;
    resetDate("ed");
    $("ed").value = task.due || "";
    $("emsg").hidden = true;
    editDialog.showModal();
    $("et").focus();
  }

  $("ef").onsubmit = event => {
    event.preventDefault();
    const task = state.tasks.find(item => item.id === editing);
    if (!task) {
      editDialog.close();
      return;
    }

    const title = $("et").value.trim();
    $("emsg").hidden = true;
    if (!title) {
      showMessage("Bitte einen Aufgabentext eingeben.", "", "emsg", "ed");
      $("et").focus();
      return;
    }
    if ($("ed").validity.badInput) {
      showMessage(
        "Der Zieltermin ist nur teilweise ausgefüllt. Bitte vollständig eingeben oder",
        "Termin leeren",
        "emsg",
        "ed"
      );
      return;
    }

    const effort = parseFloat($("ee").value) || 0;
    if (effort > MAX_EFFORT) {
      showMessage(`Der Aufwand darf höchstens ${MAX_EFFORT} Stunden betragen.`, "", "emsg", "ed");
      $("ee").focus();
      return;
    }

    updateTask(editing, {
      t: title,
      p: $("ep").value,
      due: $("ed").value,
      e: clampEffort(effort)
    });
    render();
    editDialog.close();
  };
  $("ecancel").onclick = () => editDialog.close();
  editDialog.onclick = event => {
    if (event.target === editDialog) editDialog.close();
  };

  initBackup(render);
  initSummary();
  render();
})(window.Kanban ||= {});
