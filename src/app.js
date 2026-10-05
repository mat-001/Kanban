(function (Kanban) {
    const { initBackup, initDialogs, initNotifications, initSummary, render } = Kanban;

    initNotifications(render);
    initDialogs(render);
    initBackup(render);
    initSummary();

    render();
})(window.Kanban ||= {});