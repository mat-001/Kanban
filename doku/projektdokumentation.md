# Projektdokumentation

## Zweck und Umfang

Das Kanban-Board ist eine statische Webanwendung zur persönlichen Aufgabenverwaltung. Es besteht aus HTML, CSS und klassischen JavaScript-Dateien, die direkt vom Browser geladen werden. Es gibt keinen Server, Build-Prozess, Framework oder externen Paketbedarf für die Anwendung.

## Einstiegspunkte und Module

- `index.html` enthält das Board, Formulare, Dialoge und lädt die JavaScript-Dateien in ihrer benötigten Reihenfolge.
- `help.html` enthält die Bedienhilfe.
- `style.css` definiert Layout, responsive Spalten, Dialoge und helle/dunkle Farbschemata.
- `src/dates.js` berechnet Datumsdarstellungen, Wartezeit und spätesten Start.
- `src/sort.js` definiert Board-Spalten, Prioritätsrang und Sortierung.
- `src/storage.js` initialisiert Zustand, bereinigt lokale Daten und verwaltet Speicherung sowie Verlaufsgrenzen.
- `src/task.js` enthält Aktionen zum Anlegen, Aktualisieren, Verschieben, Löschen und Wiederherstellen.
- `src/backup.js` exportiert und importiert JSON-Sicherungen.
- `src/summary.js` erstellt die Verlaufs- und Statuszusammenfassung.
- `src/board.js` verbindet Zustand und Funktionen mit DOM-Ereignissen und rendert das Board.

Die Module hängen ihre Funktionen an `window.Kanban`. Die Script-Reihenfolge in `index.html` ist relevant: Datums- und Sortierfunktionen werden vor Speicherung, Aufgabenaktionen und Oberfläche geladen.

## Datenmodell

Eine Aufgabe enthält im Regelfall:

| Feld | Bedeutung |
|---|---|
| `id` | numerische Aufgabenkennung |
| `t` | Titel, getrimmt und auf 120 Zeichen begrenzt |
| `c` | Spalte: `todo`, `doing` oder `done` |
| `p` | Priorität: `hoch`, `mittel` oder `niedrig` |
| `created` | Erstellungszeit als Zeitstempel |
| `due` | optionaler Zieltermin im Format `YYYY-MM-DD` |
| `e` | geschätzter Aufwand in Stunden |
| `doneAt` | Zeitstempel beim Erledigen; optional |
| `since` | Zeitpunkt, ab dem die aktuelle Wartezeit läuft; optional |

Der Verlauf besteht aus Zeitstempel (`ts`), Ereignistyp (`k`) und gekürztem Titel (`t`). Es werden maximal 1000 gültige Einträge aus den letzten 30 Tagen behalten.

## Fachregeln

- Neue Aufgaben starten in „Zu erledigen“.
- Offene Aufgaben werden zuerst nach verpasstem spätestem Start, dann nach effektiver Priorität, spätestem Start und Erstellungszeit sortiert.
- Je angefangene 8 Stunden Aufwand wird ein Arbeitstag angesetzt. Samstag und Sonntag sind keine Arbeitstage; Feiertage werden nicht berücksichtigt.
- Der Sicherheitspuffer wird in Arbeitstagen zum benötigten Vorlauf addiert.
- Die Alterung kann die effektive Priorität in konfigurierten Tagesintervallen stufenweise erhöhen, maximal bis „hoch“. `0` schaltet sie aus.
- Erledigte Aufgaben werden nach Erledigungszeit absteigend sortiert.
- Beim Zurückschieben aus „In Arbeit“ nach „Zu erledigen“ beginnt die Wartezeit neu. Beim Wiederöffnen einer erledigten Aufgabe beginnt sie ebenfalls neu.
- Löschen bietet für 10 Sekunden eine Wiederherstellung an.

## Speicherung und Sicherungen

Die Browserdaten werden unter diesen `localStorage`-Schlüsseln abgelegt:

- `kanban`: Aufgaben
- `kanban_log`: Verlaufsereignisse
- `kanban_buf`: Sicherheitspuffer
- `kanban_age`: Alterungsintervall
- `kanban_defekt`: Sicherung beschädigter Rohdaten, wenn die Wiederherstellung beim Laden versucht wird

Die Speicherung erfolgt lokal im Browserprofil. Ist der Speicher nicht verfügbar oder voll, meldet die Oberfläche den Fehler; eine erfolgreiche dauerhafte Speicherung ist dann nicht garantiert. Nutzer sollten regelmäßig exportieren.

Eine JSON-Sicherung enthält `format`, `version`, `exportedAt`, `tasks`, `log` und `settings`. Beim Import werden gültige Aufgaben hinzugefügt; vorhandene Aufgaben werden anhand ihrer ID/Titel-Kombination oder ihrer vollständigen Aufgabenfelder erkannt. ID-Kollisionen werden durch eine freie numerische ID gelöst. Verlaufseinträge werden validiert und dedupliziert. Einstellungen werden übernommen, wenn sie ganzzahlig und im Bereich 0 bis 365 liegen.

## Ausführen und Testen

Zum Start genügt das Öffnen von `index.html`; für eine lokale HTTP-Auslieferung kann ein beliebiger statischer Webserver verwendet werden.

Automatisierte Tests werden mit Node.js ausgeführt:

```sh
npm test
```

`tests/kanban.test.js` lädt die produktiven Skripte in einer isolierten VM mit kontrollierter Uhr, simuliertem `localStorage` und einer vereinfachten DOM-Umgebung. So sind Fachregeln und zentrale Abläufe wiederholbar testbar, ohne Browserpakete zu installieren.

Die simulierte DOM-Umgebung ist kein vollständiger Browser. Tatsächliche Darstellung, Browserkompatibilität, HTML-Parsing, Tastaturfokus, native Dialogfunktionen und Screenreader-Verhalten benötigen ergänzende Prüfungen in realen Browsern.

## Bekannte Grenzen

- Die Daten sind nicht zwischen Geräten synchronisiert und nicht serverseitig gesichert.
- Feiertage und individuelle Arbeitszeitkalender werden nicht berücksichtigt.
- Die Oberfläche ist für die direkte Bedienung im Browser ausgelegt; echte Cross-Browser- und Accessibility-Tests sind nicht Bestandteil der Node-Tests.
- Es gibt kein Schema-Migrationssystem für zukünftige Änderungen am Sicherungsformat; die Sicherung enthält derzeit Version `1`.
