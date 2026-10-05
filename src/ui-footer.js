(function (Kanban) {
    const $ = id => document.getElementById(id);
    const QUOTA_BYTES = 5 * 1024 * 1024; // grobe Schätzung: viele Browser erlauben ca. 5 MB

    function storedBytes(key) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? 0 : new Blob([value]).size;
        } catch (error) {
            return null;
        }
    }

    function formatSize(bytes) {
        if (bytes < 1024) return `${bytes} Byte`;
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toLocaleString("de-DE", { maximumFractionDigits: 1 })} KB`;
        return `${(kb / 1024).toLocaleString("de-DE", { maximumFractionDigits: 2 })} MB`;
    }

    function updateFooter() {
        const tasks = storedBytes("kanban");
        const log = storedBytes("kanban_log");
        if (tasks === null || log === null) {
            $("fa").textContent = "Speicherverbrauch nicht lesbar";
            $("fl").textContent = "";
            $("ft").textContent = "";
            return;
        }
        const total = tasks + log;
        const percent = Math.min(100, Math.round(total / QUOTA_BYTES * 100));
        $("fa").textContent = `Aufgaben: ${formatSize(tasks)}`;
        $("fl").textContent = `Protokoll: ${formatSize(log)}`;
        $("ft").textContent = `Gesamt: ${formatSize(total)} (ca. ${percent} % von etwa 5 MB)`;
    }

    Object.assign(Kanban, { updateFooter });
})(window.Kanban ||= {});