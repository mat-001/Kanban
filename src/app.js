import { initBackup } from "./backup.js";
import { browserStorage, createStore } from "./storage.js";
import { initSummary } from "./summary.js";
import { createTaskActions } from "./task.js";
import { createBoard } from "./ui-board.js";
import { initDialogs } from "./ui-dialogs.js";
import { updateFooter } from "./ui-footer.js";
import { initNotifications } from "./ui-notifications.js";

// Einzige Stelle, an der die Module zusammengesteckt werden. Alles andere bekommt seine
// Abhängigkeiten über Parameter. Das Laden dieser Datei startet nichts: gestartet wird erst durch
// den Aufruf von startApp() (siehe main.js). Speicher, Store und Aktionen lassen sich von außen ersetzen.
export function startApp({
  storage = browserStorage,
  store = createStore({ storage }),
  actions = createTaskActions(store)
} = {}) {
  // Die Pfeilfunktionen unten greifen erst beim Klick auf notifications/dialogs zu,
  // wenn beide längst existieren. Deshalb ist die Reihenfolge der Definitionen unkritisch.
  const board = createBoard({
    store,
    actions,
    onEdit: task => dialogs.openEdit(task),
    onDelete: task => notifications.removeTask(task),
    onRendered: () => updateFooter(storage)
  });
  const notifications = initNotifications({ store, actions, onChange: board.render });
  const dialogs = initDialogs({ store, actions, notifications, onChange: board.render });

  initBackup({ store, onChange: board.render });
  initSummary({ store });

  board.render();
  return { store, actions, board, notifications, dialogs };
}
