// Reine Konstanten ohne Abhängigkeiten. Jedes andere Modul darf dieses importieren.

export const RANK = Object.freeze({ hoch: 0, mittel: 1, niedrig: 2 });
export const TOK = Object.freeze(["todo", "doing", "done"]);

export const COLS = [
  ["todo", "Zu erledigen", "Sortiert nach: verpasster Start, Priorität (inkl. Alterung), spätester Start, Ablage"],
  ["doing", "In Arbeit", "Sortiert nach: verpasster Start, Priorität (inkl. Alterung), spätester Start, Ablage"],
  ["done", "Erledigt", "Sortiert nach: Zeitpunkt des Erledigens, neueste oben"]
];

export const LOG_MAX = 1000;
export const LOG_DAYS = 30;
export const RECOVERY_DAYS = 30;
export const LOG_KINDS = Object.freeze(["add", "start", "done", "back", "del"]);

// Version des Datenformats im Browser-Speicher (Schlüssel "kanban_version"). Ändert sich das Format,
// DATA_VERSION um 1 erhöhen und in storage.js unter MIGRATIONS[alteVersion] eine Umwandlung ergänzen.
export const DATA_VERSION = 1;

export const LBL = Object.freeze({
  add: "Angelegt",
  start: "In Arbeit gestartet",
  done: "Erledigt",
  back: "Zurückgeschoben",
  del: "Gelöscht"
});
