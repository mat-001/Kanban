# Kanban-Board

Ein leichtgewichtiges Kanban-Board für die persönliche Aufgabenverwaltung. Die Anwendung läuft vollständig im Browser; für die Veröffentlichung erstellt der Build einen eigenständigen Ordner mit den benötigten Dateien.

## Starten

Vor dem ersten Öffnen oder Veröffentlichen `npm run build` ausführen. Das erzeugt `dist/`; dessen `index.html` kann direkt per `file://` geöffnet oder über einen beliebigen statischen HTTP-Server veröffentlicht werden. Nach Änderungen an `src/` muss deshalb neu gebaut werden.

Der Build benötigt **Node.js 22 oder neuer**, aber keine Installation zusätzlicher npm-Pakete. Für die Tests wird ebenfalls Node.js benötigt.

## Funktionen

- Aufgaben mit Titel, Priorität, Aufwand, optionalem Zieltermin und Link in eigenen Fenstern erstellen und bearbeiten; der Aufgabentext darf mehrzeilig sein (Enter speichert, Umschalt+Enter macht eine neue Zeile)
- Aufgaben zwischen „Zu erledigen“, „In Arbeit“ und „Erledigt“ verschieben – per Pfeiltaste oder Drag-and-drop
- Löschungen innerhalb von 10 Sekunden rückgängig machen
- Aufgaben nach verpasstem spätestem Start, effektiver Priorität, spätestem Start und Erstellungszeit ordnen
- Sicherheitspuffer und Prioritätsalterung konfigurieren
- Verlauf und Zusammenfassung für Zeiträume von 1 bis 30 Tagen anzeigen
- Aufgaben, Verlauf und Einstellungen als JSON-Datei exportieren und importieren
- Speicherbelegung in der Fußzeile anzeigen
- Helles und dunkles Farbschema entsprechend der Systemeinstellung

Für Links zu Aufgaben werden nur `http://`, `https://` und `file://` akzeptiert. Dateilinks funktionieren nur, wenn `index.html` direkt von der Festplatte geöffnet wird; bei einem Aufruf über HTTP funktionieren sie nicht in allen Browsern.

Ausführlichere Bedienhinweise stehen in der [Hilfe](help.html). Technische Details, Datenmodell und bekannte Grenzen beschreibt die [Projektdokumentation](doku/projektdokumentation.md).

## Daten und Datenschutz

Aufgaben, Verlauf und Einstellungen werden lokal im `localStorage` des jeweiligen Browserprofils gespeichert. Die Anwendung synchronisiert oder überträgt diese Daten nicht an einen Server. Beim Löschen der Website-Daten oder bei Verwendung eines privaten Fensters können Daten verloren gehen. Regelmäßige JSON-Exporte werden empfohlen.

Importierte Sicherungen werden validiert. Aufgaben und Ereignisse werden bereinigt; doppelte Aufgaben werden übersprungen und ID-Kollisionen aufgelöst. Eine Sicherung aus einer neueren, nicht unterstützten Datenversion wird nicht importiert. Daten einer neueren Version im Browser bleiben schreibgeschützt, um sie nicht zu überschreiben.

## Tests

Voraussetzung: Node.js 22 oder neuer.

```sh
npm test
```

Der Befehl verwendet den eingebauten Node-Testläufer; ein `npm install` ist nicht erforderlich. Die Tests liegen in `tests/` und decken Fachlogik, Datums- und Sortierregeln, Speicher-/Versionsverwaltung, Import und Export, Links sowie ausgewählte UI-Abläufe ab.

Die Tests führen die produktiven Skripte in einer simulierten Browserumgebung aus. Sie ersetzen keine echten Browserprüfungen für Layout, Browserkompatibilität, native Dialoge, Tastaturfokus oder Screenreader-Verhalten.

Diese Prüfungen übernehmen die Browser-Tests im Ordner `e2e/` (Playwright, Chromium, Firefox und WebKit):

```sh
npm install
npx playwright install   # einmalig
npm run test:e2e
```

`npm run test:e2e` erstellt vor dem Start der Playwright-Tests automatisch einen frischen Build und prüft damit die ausgelieferte Anwendung in Chromium, Firefox und WebKit. Einrichtung und Hinweise stehen in der [Projektdokumentation](doku/projektdokumentation.md). Der [Testplan](doku/testplan.md) beschreibt alle Prüfungen, auch die, die von Hand erfolgen.

## Projektstruktur

```text
.
├── .gitignore
├── README.md
├── Kanban.png
├── package.json
├── build.cjs
├── bundle.cjs
├── index.html
├── help.html
├── style.css
├── src/
│   ├── app.js
│   ├── main.js
│   ├── backup.js
│   ├── constants.js
│   ├── dates.js
│   ├── summary.js
│   ├── sort.js
│   ├── storage.js
│   ├── task.js
│   ├── ui-board.js
│   ├── ui-dialogs.js
│   ├── ui-footer.js
│   └── ui-notifications.js
├── tests/
│   ├── backup.test.js
│   ├── board-ui.test.js
│   ├── build.test.js
│   ├── domain.test.js
│   ├── due-date.test.js
│   ├── link.test.js
│   ├── storage.test.js
│   ├── structure.test.js
│   └── test-helpers.js
├── e2e/
│   ├── board.spec.js
│   ├── dialogs.spec.js
│   ├── due-date.spec.js
│   ├── helpers.js
│   ├── layout.spec.js
│   ├── links.spec.js
│   ├── storage.spec.js
│   └── ui.spec.js
└── doku/
    ├── projektdokumentation.md
    └── testplan.md
```

`npm run build` erzeugt `dist/` mit `index.html`, `help.html`, `style.css`, `Kanban.png` und dem gebündelten `kanban.js`. Für die Produktivsetzung wird nur dieser Ordner benötigt; Quellmodule, Tests und Entwicklungsdateien sind nicht enthalten.
