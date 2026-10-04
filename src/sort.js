(function (Kanban) {
  const { ageDays, lastStart, today } = Kanban;

  const COLS = [
    ["todo", "Zu erledigen", "Sortiert nach: verpasster Start, Priorität (inkl. Alterung), spätester Start, Ablage"],
    ["doing", "In Arbeit", "Sortiert nach: verpasster Start, Priorität (inkl. Alterung), spätester Start, Ablage"],
    ["done", "Erledigt", "Sortiert nach: Zeitpunkt des Erledigens, neueste oben"]
  ];
  const RANK = { hoch: 0, mittel: 1, niedrig: 2 };
  const TOK = ["todo", "doing", "done"];

  const effRank = (task, step) =>
    Math.max(0, RANK[task.p] - (step ? Math.floor(ageDays(task) / step) : 0));

  function sorter(column, step, buffer) {
    if (column === "done") {
      return (a, b) => (b.doneAt || 0) - (a.doneAt || 0);
    }

    const todayDate = today();
    const details = new Map();
    const sortDetails = task => {
      if (!details.has(task)) {
        const start = lastStart(task, buffer);
        details.set(task, {
          missed: start && start < todayDate ? 0 : 1,
          rank: effRank(task, step),
          start: start || "9999"
        });
      }
      return details.get(task);
    };

    return (a, b) => {
      const left = sortDetails(a);
      const right = sortDetails(b);
      return left.missed - right.missed ||
        left.rank - right.rank ||
        left.start.localeCompare(right.start) ||
        a.created - b.created;
    };
  }

  Object.assign(Kanban, { COLS, RANK, TOK, effRank, sorter });
})(window.Kanban ||= {});
