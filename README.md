# Kanban-Board

Ein leichtgewichtiges Kanban-Board für die persönliche Aufgabenverwaltung. Die Anwendung besteht aus statischen HTML-, CSS- und JavaScript-Dateien, läuft vollständig im Browser und benötigt für den Betrieb weder einen Server noch einen Build-Schritt.

## Starten

`index.html` direkt im Browser öffnen. Alternativ kann das Projekt über einen beliebigen lokalen statischen HTTP-Server aufgerufen werden.

Die Anwendung benötigt keine Installation. Für die Tests wird **Node.js 20 oder neuer** benötigt; es müssen keine zusätzlichen npm-Pakete installiert werden.

## Funktionen

- Aufgaben mit Titel, Priorität, Aufwand, optionalem Zieltermin und Link erstellen und bearbeiten
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

Voraussetzung: Node.js 20 oder neuer.

```sh
npm test
```

Der Befehl verwendet den eingebauten Node-Testläufer; ein `npm install` ist nicht erforderlich. Die Tests liegen in `tests/` und decken Fachlogik, Datums- und Sortierregeln, Speicher-/Versionsverwaltung, Import und Export, Links sowie ausgewählte UI-Abläufe ab.

Die Tests führen die produktiven Skripte in einer simulierten Browserumgebung aus. Sie ersetzen keine echten Browserprüfungen für Layout, Browserkompatibilität, native Dialoge, Tastaturfokus oder Screenreader-Verhalten. Der [Testplan](doku/testplan.md) dokumentiert zusätzliche geplante Prüfungen.

## Projektstruktur

```text
.
├── .gitignore
├── README.md
├── Kanban.png
├── package.json
├── index.html
├── help.html
├── style.css
├── src/
│   ├── app.js
│   ├── backup.js
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
│   ├── board-ui.test.js
│   ├── backup.test.js
│   ├── domain.test.js
│   ├── link.test.js
│   ├── storage.test.js
│   └── test-helpers.js
└── doku/
    ├── projektdokumentation.md
    └── testplan.md
```
