import { MAX_EFFORT, MAX_SETTING, clampEffort, clampSetting, cleanLink } from "./dates.js";

const $ = id => document.getElementById(id);

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
    button.className = "msg-action";
    button.textContent = buttonText;
    button.onclick = () => {
      resetDate(dateId);
      message.hidden = true;
    };
    message.appendChild(button);
  }
  message.hidden = false;
}

// Formulare und Dialoge (Anlegen, Bearbeiten, Einstellungen). `onChange` zeichnet das Board neu.
// Rückgabe: openEdit(task), damit das Board den Bearbeiten-Dialog öffnen kann.
export function initDialogs({ store, actions, notifications, onChange }) {
  const { state, saveSetting } = store;
  const { addTask, updateTask } = actions;
  const { hideNotice, showNotice } = notifications;
  let editing = null;

  function openEdit(task) {
    editing = task.id;
    $("et").value = task.t;
    $("ep").value = task.p;
    $("ee").value = task.e || 0;
    resetDate("ed");
    $("ed").value = task.due || "";
    $("el").value = task.l || "";
    $("emsg").hidden = true;
    $("edlg").showModal();
    $("et").focus();
  }

  $("e").max = $("ee").max = MAX_EFFORT;
  $("buf").max = $("age").max = MAX_SETTING;

  // Enter speichert wie bisher, Umschalt+Enter fügt im Aufgabentext eine neue Zeile ein.
  [["t", "f"], ["et", "ef"]].forEach(([fieldId, formId]) => {
    $(fieldId).onkeydown = event => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      $(formId).requestSubmit();
    };
  });

  // Dialog "Neue Aufgabe": wird bei jedem Öffnen geleert
  const newDialog = $("ndlg");
  function openNew() {
    $("t").value = "";
    $("p").value = "mittel";
    $("e").value = "1";
    resetDate();
    $("l").value = "";
    $("msg").hidden = true;
    newDialog.showModal();
    $("t").focus();
  }

  $("add").onclick = openNew;
  $("ncancel").onclick = () => newDialog.close();
  newDialog.onclick = event => {
    if (event.target === newDialog) newDialog.close();
  };

  // Erstellen-Formular
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

    const linkText = $("l").value.trim();
    const link = cleanLink(linkText);
    if (linkText && !link) {
      showMessage("Der Link muss mit http://, https:// oder file:// beginnen und darf höchstens 500 Zeichen lang sein.");
      $("l").focus();
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
      e: clampEffort(effort),
      ...(link && { l: link })
    });
    onChange();
    newDialog.close();
  };

  // Bearbeiten-Formular
  const editDialog = $("edlg");
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
      showMessage("Der Zieltermin ist nur teilweise ausgefüllt. Bitte vollständig eingeben oder", "Termin leeren", "emsg", "ed");
      return;
    }

    const effort = parseFloat($("ee").value) || 0;
    if (effort > MAX_EFFORT) {
      showMessage(`Der Aufwand darf höchstens ${MAX_EFFORT} Stunden betragen.`, "", "emsg", "ed");
      $("ee").focus();
      return;
    }

    const linkText = $("el").value.trim();
    const link = cleanLink(linkText);
    if (linkText && !link) {
      showMessage("Der Link muss mit http://, https:// oder file:// beginnen und darf höchstens 500 Zeichen lang sein.", "", "emsg", "ed");
      $("el").focus();
      return;
    }

    updateTask(editing, {
      t: title,
      p: $("ep").value,
      due: $("ed").value,
      e: clampEffort(effort),
      l: link
    });
    onChange();
    editDialog.close();
  };

  $("ecancel").onclick = () => editDialog.close();
  editDialog.onclick = event => {
    if (event.target === editDialog) editDialog.close();
  };

  // Einstellungs-Dialog
  function bindSetting(key, inputId) {
    const input = $(inputId);
    input.value = state[key];
    input.onchange = () => {
      state[key] = clampSetting(parseInt(input.value, 10) || 0);
      input.value = state[key];
      if (saveSetting(key, state[key])) {
        hideNotice("setting-storage");
      } else if (!state.readOnly) {
        showNotice(
          "warn",
          "Die Einstellung gilt bis zum Schließen der Seite, konnte aber nicht gespeichert werden.",
          "setting-storage"
        );
      }
      onChange();
    };
  }

  bindSetting("buffer", "buf");
  bindSetting("step", "age");

  const settingsDialog = $("dlg");
  $("gear").onclick = () => {
    $("dmsg").hidden = true;
    settingsDialog.showModal();
  };
  $("close").onclick = () => settingsDialog.close();
  settingsDialog.onclick = event => {
    if (event.target === settingsDialog) settingsDialog.close();
  };

  return { openEdit };
}
