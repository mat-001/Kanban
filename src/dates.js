(function (Kanban) {
  const DAY_MS = 864e5;

  const fmt = timestamp => new Date(timestamp).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const fmtD = date => new Date(date + "T00:00").toLocaleDateString("de-DE");
  const today = () => ymd(new Date());
  const ymd = date =>
    date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
  const ageDays = task => Math.floor((Date.now() - (task.since || task.created)) / DAY_MS);
  const isWorkday = date => date.getDay() !== 0 && date.getDay() !== 6;

  function lastStart(task, buffer) {
    if (!task.due) return null;

    const workdays = Math.max(1, Math.ceil((task.e || 0) / 8)) + buffer;
    const date = new Date(task.due + "T00:00");
    let counted = 0;

    while (counted < workdays) {
      if (isWorkday(date)) counted++;
      if (counted < workdays) date.setDate(date.getDate() - 1);
    }
    return ymd(date);
  }

  Object.assign(Kanban, { fmt, fmtD, today, ymd, ageDays, lastStart });
})(window.Kanban ||= {});
