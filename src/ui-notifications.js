(function (Kanban) {
    const { DATA_VERSION, deleteTask, dismissUndo, state, undoDelete } = Kanban;
    const $ = id => document.getElementById(id);

    let noticeKind = null;
    let undoTimer = null;

    function showNotice(kind, text, source = kind) {
        $("ntext").textContent = text;
        $("notice").className = `notice ${kind}`;
        $("notice").hidden = false;
        noticeKind = source;
    }

    function hideNotice(kind) {
        if (noticeKind !== kind) return;
        $("notice").hidden = true;
        noticeKind = null;
    }

    function hideToast() {
        $("toast").hidden = true;
        clearTimeout(undoTimer);
        dismissUndo();
    }

    function removeTask(task, render) {
        deleteTask(task);
        const title = task.t.length > 40 ? task.t.slice(0, 40) + "…" : task.t;
        $("ttext").textContent = `„${title}“ gelöscht.`;
        $("toast").hidden = false;
        clearTimeout(undoTimer);
        undoTimer = setTimeout(hideToast, 10000);
        render();
    }

    function initNotifications(render) {
        if (state.loadProblem) {
            let details = "";
            if (state.recoveryCopySaved) {
                details = " Die Originaldaten wurden als Sicherheitskopie im Browser abgelegt.";
            } else if (state.recoveryCopyAttempted) {
                details = " Die Sicherheitskopie konnte nicht im Browser abgelegt werden.";
            }
            showNotice("info", state.loadProblem + details);
        }

        if (state.readOnly) {
            showNotice(
                "warn",
                `⚠️ Diese Daten wurden mit einer neueren Version der Seite gespeichert (Datenversion ${state.storedVersion}, ` +
                `hier unterstützt: ${DATA_VERSION}). Damit nichts verloren geht, werden Änderungen weder gespeichert noch ` +
                "importiert. Exportieren ist möglich. Bitte die neuere Version der Seite verwenden.",
                "read-only"
            );
        }

        document.addEventListener("kanban-storage-failed", () => {
            showNotice(
                "warn",
                "⚠️ Die Änderungen konnten nicht im Browser gespeichert werden (Speicher voll oder blockiert, z. B. im privaten Fenster). " +
                "Sie gehen beim Schließen oder Neuladen verloren. Sichere die Aufgaben jetzt mit ⚙️ → Exportieren.",
                "task-storage"
            );
        });

        document.addEventListener("kanban-storage-saved", () => hideNotice("task-storage"));

        $("nclose").onclick = () => {
            $("notice").hidden = true;
            noticeKind = null;
        };

        $("tundo").onclick = () => {
            if (undoDelete()) render();
            hideToast();
        };
    }

    Object.assign(Kanban, { showNotice, hideNotice, removeTask, initNotifications });
})(window.Kanban ||= {});