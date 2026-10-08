(function (Kanban) {
  const { lastStart, today } = Kanban;
  const { LBL, LOG_DAYS, state } = Kanban;
  const $ = id => document.getElementById(id);

  function countEvents(events) {
    return events.reduce((counts, event) => {
      counts[event.k] = (counts[event.k] || 0) + 1;
      return counts;
    }, {});
  }

  function appendTextElement(parent, tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    parent.appendChild(element);
    return element;
  }

  function showSummary() {
    const daysInput = $("days");
    let days = Math.round(Number(daysInput.value));
    if (!Number.isFinite(days) || days < 1) days = 1;
    days = Math.min(days, LOG_DAYS);
    daysInput.value = days;

    const hours = days * 24;
    const periodLabel = days === 1 ? "24 Stunden" : `${days} Tage`;
    $("stitle").textContent = `Die letzten ${periodLabel}`;

    const box = $("sum");
    box.replaceChildren();
    const cutoff = Date.now() - hours * 36e5;
    const events = state.log
      .filter(event => event.ts >= cutoff)
      .sort((a, b) => b.ts - a.ts);
    const counts = countEvents(events);
    let todoCount = 0;
    let doingCount = 0;
    let missedCount = 0;
    const currentDay = today();

    state.tasks.forEach(task => {
      if (task.c === "todo") todoCount++;
      if (task.c === "doing") doingCount++;
      if (task.c !== "done" && task.due && lastStart(task, state.buffer) < currentDay) {
        missedCount++;
      }
    });

    appendTextElement(box, "h3", "Bilanz");
    appendTextElement(
      box,
      "p",
      `Angelegt: ${counts.add || 0} · In Arbeit gestartet: ${counts.start || 0} · ` +
      `Erledigt: ${counts.done || 0} · Gelöscht: ${counts.del || 0}`,
      "s-bilanz"
    );
    appendTextElement(box, "h3", "Aktueller Stand");
    appendTextElement(
      box,
      "p",
      `Zu erledigen: ${todoCount} · In Arbeit: ${doingCount} · Mit verpasstem Start: ${missedCount}`,
      "s-stand"
    );
    appendTextElement(box, "h3", "Verlauf");

    if (!events.length) {
      appendTextElement(box, "p", `In den letzten ${periodLabel} ist nichts passiert.`, "s-verlauf");
    } else {
      const list = document.createElement("ul");
      list.className = "s-verlauf";
      events.forEach(event => {
        const timestamp = new Date(event.ts).toLocaleString("de-DE", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });
        appendTextElement(list, "li", `${timestamp} – ${LBL[event.k]}: ${event.t}`);
      });
      box.appendChild(list);
    }

    const dialog = $("sdlg");
    if (!dialog.open) dialog.showModal();
  }

  function initSummary() {
    const dialog = $("sdlg");
    $("sumbtn").onclick = () => {
      $("days").value = 1;
      showSummary();
    };
    $("days").onchange = showSummary;
    $("sclose").onclick = () => dialog.close();
    dialog.onclick = event => {
      if (event.target === dialog) dialog.close();
    };
  }

  Object.assign(Kanban, { initSummary });
})(window.Kanban ||= {});
