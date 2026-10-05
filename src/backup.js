(function (Kanban) {
  const { ymd, MAX_SETTING } = Kanban;
  const { DATA_VERSION, migrate } = Kanban;
  const { cleanTask, LBL, pruneLog, save, saveLog, saveSetting, state } = Kanban;
  const $ = id => document.getElementById(id);

  function showMessage(text, success = true) {
    const message = $("dmsg");
    message.textContent = text;
    message.className = "msg" + (success ? " ok" : "");
    message.hidden = false;
  }

  // Startet den Download über einen kurzlebigen Link. Ob der Browser die Datei danach wirklich speichert
  // (oder der Nutzer abbricht), lässt sich von der Seite aus nicht feststellen.
  function downloadFile(name, text) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }

  function createBackup() {
    return {
      format: "kanban-sicherung",
      // Bei schreibgeschützten Daten einer neueren Version werden die Originaldaten unverändert gesichert.
      version: state.readOnly ? state.storedVersion : DATA_VERSION,
      exportedAt: new Date().toISOString(),
      tasks: state.readOnly && state.rawTasks ? state.rawTasks : state.tasks,
      log: state.readOnly && state.rawLog ? state.rawLog : state.log,
      settings: { buffer: state.buffer, step: state.step }
    };
  }

  function importTasks(tasks) {
    const existing = new Map(state.tasks.map(task => [task.id, task]));
    const fingerprints = new Set(state.tasks.map(task =>
      JSON.stringify([task.t, task.c, task.p, task.created, task.due, task.e, task.doneAt, task.since])
    ));
    let added = 0;
    let skipped = 0;
    let invalid = 0;

    tasks.forEach(rawTask => {
      const task = cleanTask(rawTask);
      if (!task) {
        invalid++;
        return;
      }

      const current = existing.get(task.id);
      const fingerprint = JSON.stringify([
        task.t, task.c, task.p, task.created, task.due, task.e, task.doneAt, task.since
      ]);
      if ((current && current.t === task.t) || fingerprints.has(fingerprint)) {
        skipped++;
        return;
      }

      while (existing.has(task.id)) task.id++;
      state.tasks.push(task);
      existing.set(task.id, task);
      fingerprints.add(fingerprint);
      added++;
    });

    return { added, skipped, invalid };
  }

  function importLog(entries) {
    const eventKey = event => `${event.ts}|${event.k}|${event.t}`;
    const existing = new Set(state.log.map(eventKey));

    (Array.isArray(entries) ? entries : []).forEach(event => {
      if (!event ||
        !Number.isFinite(event.ts) ||
        typeof event.t !== "string" ||
        !Object.hasOwn(LBL, event.k)) return;

      const cleanEvent = { ts: event.ts, k: event.k, t: event.t.slice(0, 60) };
      const key = eventKey(cleanEvent);
      if (existing.has(key)) return;
      state.log.push(cleanEvent);
      existing.add(key);
    });

    pruneLog();
  }

  function importSettings(settings) {
    const validSetting = value => Number.isInteger(value) && value >= 0 && value <= MAX_SETTING;
    const values = [
      ["buffer", "buf"],
      ["step", "age"]
    ];
    const failed = [];

    values.forEach(([key, inputId]) => {
      const value = settings[key];
      if (!validSetting(value)) return;

      state[key] = value;
      if (!saveSetting(key, value)) failed.push(key);
      $(inputId).value = value;
    });
    return failed;
  }

  async function importFile(file, render) {
    if (state.readOnly) {
      throw new Error(
        "Diese Daten stammen von einer neueren Version der Seite und sind schreibgeschützt. " +
        "Importieren ist deshalb nicht möglich."
      );
    }
    if (file.size > 2e6) throw new Error("Die Datei ist zu groß (über 2 MB).");

    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch (error) {
      throw new Error("Die Datei ist keine gültige Sicherung.");
    }
    if (!backup || typeof backup !== "object") {
      throw new Error("In der Datei wurden keine Aufgaben gefunden.");
    }

    const fileVersion = backup.version === undefined ? 1 : backup.version;
    if (!Number.isInteger(fileVersion) || fileVersion < 1) {
      throw new Error("Die Sicherung hat eine ungültige Versionsnummer.");
    }
    if (fileVersion > DATA_VERSION) {
      throw new Error(
        `Die Sicherung stammt von einer neueren Version der Seite (Datenversion ${fileVersion}, ` +
        `hier unterstützt: ${DATA_VERSION}) und kann hier nicht gelesen werden.`
      );
    }
    if (!Array.isArray(backup.tasks)) {
      throw new Error("In der Datei wurden keine Aufgaben gefunden.");
    }

    const result = importTasks(migrate(backup.tasks, fileVersion));
    importLog(backup.log);
    const failedSettings = importSettings(backup.settings || {});
    const settingNames = { buffer: "Sicherheitspuffer", step: "Alterung" };
    save();
    saveLog();
    render();

    showMessage(
      `${result.added} Aufgabe${result.added === 1 ? "" : "n"} hinzugefügt, ` +
      `${result.skipped} schon vorhanden` +
      (result.invalid ? `, ${result.invalid} ungültig übersprungen` : "") +
      ". Einstellungen aus der Datei wurden übernommen." +
      (failedSettings.length
        ? ` ${failedSettings.map(key => settingNames[key]).join(" und ")} konnten nicht dauerhaft gespeichert werden.`
        : ""),
      !failedSettings.length
    );
  }

  function initBackup(render) {
    $("exp").onclick = () => {
      const backup = createBackup();
      const filename = `kanban-sicherung-${ymd(new Date())}.json`;
      try {
        downloadFile(filename, JSON.stringify(backup, null, 1));
        showMessage(`Sicherung mit ${backup.tasks.length} Aufgaben wird heruntergeladen.`);
      } catch (error) {
        showMessage("Der Download konnte nicht gestartet werden.", false);
      }
    };

    $("imp").onclick = () => $("impfile").click();
    $("impfile").onchange = async event => {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file) return;

      try {
        await importFile(file, render);
      } catch (error) {
        showMessage(error.message || "Der Import ist fehlgeschlagen.", false);
      }
    };
  }

  Object.assign(Kanban, { initBackup });
})(window.Kanban ||= {});
