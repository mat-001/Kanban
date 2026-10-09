// Aufgaben-Aktionen. Der Datenspeicher wird übergeben, nicht global gesucht.
export function createTaskActions(store) {
  const { addLog, save, saveLog, state } = store;

  function addTask(task) {
    state.tasks.push(task);
    addLog("add", task.t);
    save();
  }

  function updateTask(id, updates) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return false;

    Object.assign(task, updates);
    save();
    return true;
  }

  function moveTask(task, column) {
    if ((task.c === "done" && column !== "done") || (task.c === "doing" && column === "todo")) {
      task.since = Date.now();
    }
    task.c = column;
    task.doneAt = column === "done" ? Date.now() : undefined;

    const kind = column === "done" ? "done" : column === "doing" ? "start" : "back";
    addLog(kind, task.t);
    save();
  }

  let undoItem = null;

  function dismissUndo() {
    undoItem = null;
  }

  function deleteTask(task) {
    const entry = addLog("del", task.t);
    state.tasks = state.tasks.filter(item => item.id !== task.id);
    save();
    undoItem = { task, entry };
  }

  function undoDelete() {
    if (!undoItem) return false;

    const { task, entry } = undoItem;
    while (state.tasks.some(item => item.id === task.id)) task.id++;
    state.tasks.push(task);
    state.log = state.log.filter(item => item !== entry);
    saveLog();
    save();
    undoItem = null;
    return true;
  }

  return { addTask, updateTask, moveTask, dismissUndo, deleteTask, undoDelete };
}
