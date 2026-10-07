# Projektdokumentation

## Zweck und Umfang

Das Kanban-Board ist eine statische Webanwendung zur persönlichen Aufgabenverwaltung. Es besteht aus HTML, CSS und klassischen JavaScript-Dateien, die direkt vom Browser geladen werden. Es gibt keinen Server, Framework oder externen Paketbedarf für die Anwendung. Pakete werden nur für die Browser-Tests gebraucht (siehe „Browser-Tests einrichten“).

## Einstiegspunkte und Module

- `index.html` enthält das Board, Formulare, Dialoge und lädt die JavaScript-Dateien in ihrer benötigten Reihenfolge.
- `help.html` enthält die Bedienhilfe.
- `style.css` definiert Layout, responsive Spalten, Dialoge und helle/dunkle Farbschemata.
- `src/dates.js` berechnet Datumsdarstellungen, Wartezeit und spätesten Start und enthält kleine Prüffunktionen (`clampEffort`, `clampSetting`, `cleanLink`).
- `src/sort.js` definiert Board-Spalten, Prioritätsrang und Sortierung.
- `src/storage.js` initialisiert Zustand, bereinigt lokale Daten und verwaltet Speicherung sowie Verlaufsgrenzen.
- `src/task.js` enthält Aktionen zum Anlegen, Aktualisieren, Verschieben, Löschen und Wiederherstellen.
- `src/backup.js` exportiert und importiert JSON-Sicherungen.
- `src/summary.js` erstellt die Verlaufs- und Statuszusammenfassung.
- `src/ui-notifications.js` zeigt Hinweisleiste und Rückgängig-Meldung.
- `src/ui-dialogs.js` verbindet Formular, Bearbeiten-Fenster und Einstellungen.
- `src/ui-footer.js` berechnet und zeigt den Speicherverbrauch in der Fußzeile.
- `src/ui-board.js` rendert Spalten und Karten.
- `src/app.js` startet alle Module.

Die Module hängen ihre Funktionen an `window.Kanban`. Die Script-Reihenfolge in `index.html` ist relevant: Datums- und Sortierfunktionen werden vor Speicherung, Aufgabenaktionen und Oberfläche geladen.

## Datenmodell

Eine Aufgabe enthält im Regelfall:

| Feld | Bedeutung |
|---|---|
| `id` | numerische Aufgabenkennung |
| `t` | Titel, getrimmt und auf 300 Zeichen begrenzt |
| `c` | Spalte: `todo`, `doing` oder `done` |
| `p` | Priorität: `hoch`, `mittel` oder `niedrig` |
| `created` | Erstellungszeit als Zeitstempel |
| `due` | optionaler Zieltermin im Format `YYYY-MM-DD` |
| `e` | geschätzter Aufwand in Stunden |
| `doneAt` | Zeitstempel beim Erledigen; optional |
| `since` | Zeitpunkt, ab dem die aktuelle Wartezeit läuft; optional |
| `l` | optionaler Link; nur `http://`, `https://` oder `file://`, höchstens 500 Zeichen |

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
- Beim ersten Start (leerer Speicher) wird eine Beispielaufgabe angelegt und sofort gespeichert. Wird sie gelöscht, kommt sie nicht wieder.

## Links an Aufgaben

- Erlaubt sind `http://`, `https://` und `file://`. Alles andere (etwa `javascript:` oder `data:`) wird abgelehnt.
- Die Prüfung steckt in `cleanLink` (`src/dates.js`) und läuft an drei Stellen: beim Anlegen und Bearbeiten, beim Laden aus dem Speicher und beim Import. `cleanTask` ruft sie für Speicher und Import auf.
- Leerzeichen in `file://`-Pfaden werden zu `%20`, Links werden auf 500 Zeichen gekürzt.
- Auf der Karte wird der Link mit `href` und `textContent` gesetzt (nie über `innerHTML`) und mit `rel="noopener noreferrer"` geöffnet.
- Dateilinks funktionieren nur, wenn die Seite direkt als Datei geöffnet wird. In Safari blockiert der normale Klick sie meist; Rechtsklick → „In neuem Tab öffnen“ funktioniert.

## Fußzeile

Die Fußzeile zeigt den belegten Browser-Speicher für Aufgaben (`kanban`) und Protokoll (`kanban_log`) sowie die Summe. Die Prozentangabe bezieht sich auf eine grobe Annahme von 5 MB; das tatsächliche Limit hängt vom Browser ab. Angezeigt wird der Wert, der wirklich gespeichert ist, nicht der im Arbeitsspeicher.

## Speicherung und Sicherungen

Die Browserdaten werden unter diesen `localStorage`-Schlüsseln abgelegt:

- `kanban`: Aufgaben
- `kanban_version`: Datenversion der gespeicherten Aufgaben
- `kanban_log`: Verlaufsereignisse
- `kanban_buf`: Sicherheitspuffer
- `kanban_age`: Alterungsintervall
- `kanban_defekt`: Sicherung beschädigter Rohdaten, wenn die Wiederherstellung beim Laden versucht wird. Sie wird 30 Tage nach dem letzten Fehler automatisch gelöscht.
- `kanban_defekt_ts`: Zeitpunkt der Sicherung beschädigter Rohdaten (für das automatische Löschen)

Die Speicherung erfolgt lokal im Browserprofil. Ist der Speicher nicht verfügbar oder voll, meldet die Oberfläche den Fehler; eine erfolgreiche dauerhafte Speicherung ist dann nicht garantiert. Nutzer sollten regelmäßig exportieren.

Eine JSON-Sicherung enthält `format`, `version`, `exportedAt`, `tasks`, `log` und `settings`. Beim Import werden gültige Aufgaben hinzugefügt; vorhandene Aufgaben werden anhand ihrer ID/Titel-Kombination oder ihrer vollständigen Aufgabenfelder erkannt. ID-Kollisionen werden durch eine freie numerische ID gelöst. Verlaufseinträge werden validiert und dedupliziert. Einstellungen werden übernommen, wenn sie ganzzahlig und im Bereich 0 bis 365 liegen.

## Ausführen und Testen

Zum Start genügt das Öffnen von `index.html`; für eine lokale HTTP-Auslieferung kann ein beliebiger statischer Webserver verwendet werden.

Automatisierte Tests werden mit Node.js ausgeführt:

```sh
npm test
```

Die Tests liegen in `tests/` und sind nach Themen aufgeteilt: `domain.test.js` (Fachregeln), `storage.test.js` (Speicherung, Versionen), `backup.test.js` (Export und Import), `board-ui.test.js` (Oberfläche) und `link.test.js` (Links). `test-helpers.js` lädt die produktiven Skripte in einer isolierten VM mit kontrollierter Uhr, simuliertem `localStorage` und einer vereinfachten DOM-Umgebung. So sind Fachregeln und zentrale Abläufe wiederholbar testbar, ohne Browserpakete zu installieren.

Die simulierte DOM-Umgebung ist kein vollständiger Browser. Tatsächliche Darstellung, Browserkompatibilität, HTML-Parsing, Tastaturfokus, native Dialogfunktionen und Screenreader-Verhalten benötigen ergänzende Prüfungen in realen Browsern.

## Browser-Tests einrichten (e2e)

Die Browser-Tests im Ordner `e2e/` nutzen Playwright und prüfen die Seite in Chromium, Firefox und WebKit (Engine von Safari). Sie sind bewusst von `npm test` getrennt, weil sie deutlich langsamer sind.

Voraussetzung: Node.js ab Version 20 (siehe `engines` in `package.json`).

**Einmalig nach dem Herunterladen des Projekts:**

```sh
npm install
npx playwright install
```

- `npm install` liest `package.json` und `package-lock.json` und legt den Ordner `node_modules/` an. Dieser Ordner gehört nicht zum Projekt, steht in `.gitignore` und kann jederzeit gelöscht und neu erzeugt werden.
- `npx playwright install` lädt die Testbrowser herunter. Sie liegen nicht im Projekt, sondern im Benutzerverzeichnis (auf dem Mac unter `~/Library/Caches/ms-playwright`) und müssen nur einmal pro Rechner und Playwright-Version geladen werden.

**Tests starten:**

```sh
npm run test:e2e
```

**Wann:** Die schnellen Tests (`npm test`) laufen bei jeder Änderung, die Browser-Tests vor größeren Änderungen oder vor einer Veröffentlichung.

**Hinweise:**

- Die Tests öffnen `index.html` direkt als Datei (`file://`), so wie die Seite auch im Alltag genutzt wird.
- Playwright legt beim Lauf die Ordner `test-results/` und `playwright-report/` an. Beide stehen in `.gitignore`.
- WebKit in Playwright ist nah an Safari, aber nicht identisch. Das Verhalten bei Dateilinks in Safari wird weiterhin von Hand geprüft.
- Neue Browser-Tests gehören in `e2e/` und enden auf `.spec.js`. Dateien in `tests/` sind nur für `node --test` gedacht.
- `npx playwright test --project=chromium` testet nur in einem Browser und ist deutlich schneller.
- `npx playwright test --ui` öffnet eine Oberfläche, in der du Tests einzeln startest und siehst, was der Browser tut.
- Ein einzelner Test: `npx playwright test -g "Escape"`.

## Website bereitstellen

`npm run build` kopiert nur `index.html`, `help.html`, `style.css`, `Kanban.png` und `src/` in den Ordner `dist/`. Nur dieser Ordner wird veröffentlicht. Tests, `package.json` und `node_modules` bleiben draußen. Dateilinks funktionieren auf einer veröffentlichten Seite nicht, und die Aufgaben liegen im Browserspeicher der jeweiligen Adresse (Export und Import zum Umziehen).

## Bekannte Grenzen

- Die Daten sind nicht zwischen Geräten synchronisiert und nicht serverseitig gesichert.
- Feiertage und individuelle Arbeitszeitkalender werden nicht berücksichtigt.
- Die Oberfläche ist für die direkte Bedienung im Browser ausgelegt; echte Cross-Browser- und Accessibility-Tests sind nicht Bestandteil der Node-Tests. Sie werden durch die e2e-Tests abgedeckt.
- Änderungen am Datenformat laufen über `DATA_VERSION` und `MIGRATIONS` in `src/storage.js`. Daten einer neueren Version werden nur gelesen und nie überschrieben; Import ist dann gesperrt, Export weiterhin möglich.
