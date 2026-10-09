// Reine Datums- und Zahlenfunktionen. Keine Abhängigkeiten, kein Zugriff auf Browser-Speicher oder DOM.

const DAY_MS = 864e5;
export const MAX_EFFORT = 1000; // Stunden pro Aufgabe
export const MAX_SETTING = 365; // Tage für Sicherheitspuffer und Alterung
export const MAX_LINK = 500;

export const fmt = timestamp => new Date(timestamp).toLocaleString("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});
export const fmtD = date => new Date(date + "T00:00").toLocaleDateString("de-DE");
export const ymd = date =>
  date.getFullYear() + "-" +
  String(date.getMonth() + 1).padStart(2, "0") + "-" +
  String(date.getDate()).padStart(2, "0");
export const today = () => ymd(new Date());
export const ageDays = task => Math.floor((Date.now() - (task.since || task.created)) / DAY_MS);
export const isWorkday = date => date.getDay() !== 0 && date.getDay() !== 6;
export const clampEffort = value => Math.min(MAX_EFFORT, Math.max(0, Number.isFinite(value) ? value : 0));
export const clampSetting = value => Math.min(MAX_SETTING, Math.max(0, Number.isFinite(value) ? Math.trunc(value) : 0));

export const cleanLink = text => {
  if (typeof text !== "string") return "";
  let link = text.trim();
  // Leerzeichen in Dateipfaden (z. B. "Meine Dokumente") werden als %20 geschrieben
  if (/^file:\/\//i.test(link)) link = link.replace(/ /g, "%20");
  return link.length <= MAX_LINK && /^(https?|file):\/\/\S+$/i.test(link) ? link : "";
};

export const isRealDate = text => {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

export function lastStart(task, buffer) {
  if (!task.due) return null;

  // Die Werte werden hier noch einmal begrenzt, damit die Rechenzeit nie von ihnen abhängt.
  const workdays = Math.max(1, Math.ceil(clampEffort(task.e) / 8)) + clampSetting(buffer);
  const date = new Date(task.due + "T00:00");

  // Der Termin zählt als erster Arbeitstag; fällt er auf ein Wochenende, beginnt die Zählung am Freitag davor.
  while (!isWorkday(date)) date.setDate(date.getDate() - 1);

  // Je 5 weitere Arbeitstage sind genau eine Kalenderwoche; nur der Rest wird einzeln zurückgezählt.
  const remaining = workdays - 1;
  date.setDate(date.getDate() - Math.floor(remaining / 5) * 7);
  for (let step = 0; step < remaining % 5; step++) {
    do date.setDate(date.getDate() - 1); while (!isWorkday(date));
  }
  return ymd(date);
}
