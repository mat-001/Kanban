(function (Kanban) {
  const { ymd, MAX_SETTING } = Kanban;
  const { cleanTask, LBL, pruneLog, save, saveLog, saveSetting, state } = Kanban;
  const $ = id => document.getElementById(id);

  function showMessage(text, success = true) {
    const message = $("dmsg");
    message.textContent = text;
    message.className = "msg" + (success ? " ok" : "");
    message.hidden = false;
  }

  async function saveFile(name, text) {
    try {
      const downloads = window.claude && window.claude.use
        ? await window.claude.use("downloads")
        : null;
      if (downloads) {
        await downloads.save({ filename: name, data: text });
        return "saved";
      }
    } catch (error) {
      if (error && error.code === "declined") return "declined";
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    return "download";
  }

  function createBackup() {
    return {
      format: "kanban-sicherung",
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      log: state.log,
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
    if (file.size > 2e6) throw new Error("Die Datei ist zu groß (über 2 MB).");

    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch (error) {
      throw new Error("Die Datei ist keine gültige Sicherung.");
    }
    if (!backup || !Array.isArray(backup.tasks)) {
      throw new Error("In der Datei wurden keine Aufgaben gefunden.");
    }

    const result = importTasks(backup.tasks);
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
    $("exp").onclick = async () => {
      const text = JSON.stringify(createBackup(), null, 1);
      const filename = `kanban-sicherung-${ymd(new Date())}.json`;
      const result = await saveFile(filename, text);
      const message = result === "declined"
        ? "Speichern abgebrochen."
        : `Sicherung mit ${state.tasks.length} Aufgaben ` +
          `${result === "saved" ? "gespeichert" : "wird heruntergeladen"}.`;
      showMessage(message, result !== "declined");
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
