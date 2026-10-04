# Kanban-Board

Ein kleines, browserbasiertes Kanban-Board ohne Build-Schritt und ohne externe Laufzeitabhängigkeiten. Aufgaben und Einstellungen werden lokal im Browser gespeichert.

## Starten

Das Projekt kann direkt im Browser geöffnet werden: `index.html`.

Alternativ lässt es sich über einen lokalen HTTP-Server ausliefern. Das ist für Tests und Browser-Entwicklerwerkzeuge empfehlenswert. Die Anwendung benötigt keine Installation und keinen Build.

## Funktionen

- Aufgaben mit Priorität, optionalem Zieltermin und Aufwand erfassen und bearbeiten
- Aufgaben zwischen „Zu erledigen“, „In Arbeit“ und „Erledigt“ verschieben
- Aufgaben per Pfeil-Schaltflächen oder Drag-and-drop bewegen
- Löschungen innerhalb von 10 Sekunden rückgängig machen
- Aufgaben nach Frist, Priorität, Alterung und Ablagezeit ordnen
- Sicherheitspuffer und Prioritätsalterung konfigurieren
- Verlauf und Zusammenfassung für bis zu 30 Tage ansehen
- Aufgaben, Verlauf und Einstellungen als JSON-Datei exportieren und importieren
- Helles und dunkles Farbschema entsprechend der Systemeinstellung

Weitere Bedienhinweise stehen in der [Hilfe](help.html). Die technischen Details und Grenzen sind in der [Projektdokumentation](doku/projektdokumentation.md) beschrieben.

## Daten und Datenschutz

Die Anwendung überträgt keine Aufgaben an einen Server. Aufgaben, Protokoll und Einstellungen liegen im `localStorage` des verwendeten Browsers und Geräts. Das Löschen der Website-Daten oder die Nutzung eines privaten Fensters kann gespeicherte Daten entfernen. Für Sicherungen die Exportfunktion in den Einstellungen verwenden.

## Tests

Voraussetzung ist Node.js. Die Anwendung selbst benötigt Node.js nicht.

```sh
npm test
```

Die Tests laufen mit dem eingebauten Node-Testläufer und benötigen keine zusätzlichen Pakete. Sie prüfen Fachlogik und wichtige Abläufe mit einer simulierten Browserumgebung. Sie sind keine vollständigen Tests in Chrome, Firefox oder Safari und prüfen weder visuelles Layout noch tatsächliche Tastatur- oder Screenreader-Bedienung.

Der [Testplan](doku/testplan.md) beschreibt die geplanten manuellen und automatisierten Prüfungen.

## Projektstruktur

```text
.
├── index.html
├── help.html
├── style.css
├── src/
│   ├── dates.js
│   ├── sort.js
│   ├── storage.js
│   ├── task.js
│   ├── backup.js
│   ├── summary.js
│   └── board.js
├── tests/
│   └── kanban.test.js
└── doku/
    ├── projektdokumentation.md
    └── testplan.md
```
