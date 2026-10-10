# Testplan: Kanban-Board

Der Plan deckt Kernfunktionen, Frist- und Sortierlogik, Persistenz, Import/Export sowie Bedienbarkeit ab. Die fachlichen Regeln stehen teilweise in der `Hilfe`; die zugehörige Oberfläche ist in `index.html` und `style.css` umgesetzt.

## 1. Testziele und Testumgebung

### Ziele

- Sicherstellen, dass Aufgaben korrekt angelegt, bearbeitet, verschoben und gelöscht werden.
- Prüfen, ob Fristen, Prioritäten und Alterung wie beschrieben berechnet und sortiert werden.
- Datenverlust und Fehlverhalten bei beschädigten oder nicht verfügbaren Browserdaten erkennen.
- Import und Export sowie die Bedienbarkeit auf Desktop und Mobilgeräten absichern.

### Umgebung

- Mit einer frischen Browser-Profilsitzung und einem separaten Profil für Persistenztests starten.
- Aktuelle Versionen von Chrome, Firefox und Safari prüfen.
- Desktop und schmales Mobil-Viewport testen; auf Mobilgeräten insbesondere horizontales Scrollen und die Pfeil-Schaltflächen prüfen.
- Die automatisierten Browserprüfungen (Playwright, siehe Abschnitt 6) öffnen `index.html` direkt per `file://`. Zusätzlich manuell prüfen: die gebaute Seite `dist/` über einen lokalen HTTP-Server.

## 2. Funktionale Testfälle

| ID | Prio | Test | Erwartetes Ergebnis |
|---|---|---|---|
| F-01 | P0 | Seite erstmals ohne gespeicherte Daten öffnen | Board erscheint mit der vorgesehenen Beispielaufgabe. |
| F-02 | P0 | „＋ Neue Aufgabe“ öffnen, Text, Priorität, Termin und Aufwand eingeben, „Hinzufügen“ | Das Fenster schließt sich, die Aufgabe erscheint in „Zu erledigen“. Beim erneuten Öffnen sind alle Felder leer (Priorität „Mittel“, Aufwand 1). |
| F-03 | P1 | Leeren bzw. nur aus Leerzeichen bestehenden Titel absenden | Aufgabe wird nicht angelegt; verständliche Meldung erscheint im Fenster, das Fenster bleibt offen und der Fokus steht im Textfeld. |
| F-04 | P1 | Titel mit 300 Zeichen, danach längeren Text eingeben | Eingabe ist auf 300 Zeichen begrenzt; gültiger Titel wird korrekt angezeigt. |
| F-05 | P1 | Aufgabe bearbeiten und speichern | Geänderte Felder werden angezeigt und nach Neuladen beibehalten. |
| F-06 | P1 | Bearbeitung abbrechen oder Dialog schließen | Änderungen werden nicht übernommen. |
| F-07 | P0 | Aufgabe per Pfeil und per Drag-and-drop verschieben | Aufgabe wechselt in die richtige Spalte; der Verlauf erhält den passenden Eintrag. |
| F-08 | P1 | Aufgabe löschen und innerhalb von 10 Sekunden rückgängig machen | Aufgabe erscheint wieder; der Löschvorgang ist nicht mehr im Verlauf. |
| F-09 | P1 | Aufgabe löschen und Undo-Zeit ablaufen lassen | Aufgabe bleibt gelöscht; Undo-Meldung verschwindet. |
| F-10 | P1 | Einstellungen für Sicherheitspuffer und Alterung ändern | Werte werden übernommen, gespeichert und beeinflussen Anzeige bzw. Sortierung. |
| F-11 | P1 | „Neue Aufgabe“ öffnen, etwas eingeben, dann mit „Abbrechen“, Escape bzw. Klick auf den Hintergrund schließen; Fenster erneut öffnen | Es wird keine Aufgabe angelegt. Beim erneuten Öffnen sind alle Felder und eine alte Fehlermeldung weg. Ein Klick ins Fenster selbst schließt es nicht. |
| F-12 | P1 | Im Aufgabentext (Neue Aufgabe und Bearbeiten) Enter und Umschalt+Enter drücken | Enter speichert. Umschalt+Enter fügt eine neue Zeile ein, ohne zu speichern. Der Zeilenumbruch bleibt gespeichert und ist auf der Karte sichtbar. |
| F-13 | P1 | „Neue Aufgabe“ und „Aufgabe bearbeiten“ auf Desktop und schmalem Viewport ansehen | Text und Link nutzen die volle Breite des Fensters. „Hinzufügen“ bzw. „Speichern“ und „Abbrechen“ stehen in einer eigenen Zeile unter den Feldern; nichts läuft über den Fensterrand. |

## 3. Frist-, Alterungs- und Sortierlogik

Die Regeln sind in `src/dates.js` und `src/sort.js` umgesetzt.

| ID | Prio | Test | Erwartetes Ergebnis |
|---|---|---|---|
| L-01 | P0 | Spätesten Start für 8 Stunden Aufwand berechnen | Ein Arbeitstag Aufwand wird angesetzt; Wochenenden werden bei der Rückrechnung übersprungen. |
| L-02 | P1 | Aufwand unter 8 Stunden und Aufwand über 8 Stunden testen | Je angefangene 8 Stunden zählen als Arbeitstag; der Puffer kommt hinzu. |
| L-03 | P1 | Termin an einem Wochenende bzw. nahe einem Wochenende testen | Arbeitstage werden korrekt berücksichtigt; Wochenenden zählen nicht als Arbeitstage. |
| L-04 | P0 | Verpassten spätesten Start mit nicht verpasstem Start vergleichen | Verpasste Starts stehen in offenen Spalten zuerst; die Anzeige kennzeichnet den Fall passend. |
| L-05 | P1 | Gleiche Termine mit unterschiedlicher Priorität vergleichen | Sortierung erfolgt nach effektiver Priorität und anschließend spätestem Start. |
| L-06 | P1 | Alterung nach Ablauf eines bzw. mehrerer Intervalle prüfen | Effektive Priorität steigt stufenweise; bei Alterung `0` bleibt sie unverändert. |
| L-07 | P1 | Aufgaben ohne Termin und Aufgaben mit gleichem Startdatum vergleichen | Aufgaben ohne Termin stehen bei ansonsten gleichen Kriterien dahinter; danach gilt die Ablage-Reihenfolge. |
| L-08 | P1 | Aufgaben in „Erledigt“ verschieben | Neu erledigte Aufgabe steht oben; Erledigungszeit wird angezeigt. |
| L-09 | P1 | Aufgabe von „In Arbeit“ zurück nach „Zu erledigen“ verschieben | Die Wartezeit beginnt gemäß Beschreibung in der Hilfe neu. `moveTask` in `src/task.js` setzt `since` in beiden Fällen: beim Zurückschieben aus „In Arbeit“ und beim Zurückholen aus „Erledigt“. |
| L-10 | P0 | Aufwand `1e300` im Formular, im Bearbeiten-Fenster, im Import und in bereits gespeicherten Daten; Puffer `1000000000` in den Einstellungen | Formular und Bearbeiten lehnen mit Meldung ab; Laden, Import und Einstellungen begrenzen auf 1000 Stunden bzw. 365 Tage; die Seite bleibt sofort bedienbar. |

## 4. Speicherung, Import und Export

Persistenz- und Bereinigungslogik liegt in `src/storage.js`; Import und Export in `src/backup.js`.

| ID | Prio | Test | Erwartetes Ergebnis |
|---|---|---|---|
| D-01 | P0 | Aufgabe anlegen, Seite neu laden | Aufgabe und Spaltenzuordnung bleiben erhalten. |
| D-02 | P1 | Export durchführen und Datei prüfen | Sicherung enthält Aufgaben, Verlauf, Einstellungen, Formatkennung und die aktuelle `DATA_VERSION`. |
| D-03 | P0 | Export in frischem Profil importieren | Aufgaben und Verlauf werden übernommen; Einstellungen aus der Sicherung ersetzen die aktuellen. |
| D-04 | P1 | Dieselbe Sicherung mehrfach importieren | Bereits vorhandene Aufgaben werden übersprungen; Aufgaben werden nicht vervielfacht. |
| D-05 | P1 | Import mit doppelten IDs, aber unterschiedlichen Titeln | IDs werden konfliktfrei behandelt; keine Aufgabe geht verloren. |
| D-06 | P1 | Ungültige JSON-Datei, fehlende Aufgabenliste und Datei über 2 MB importieren | Import wird abgelehnt und zeigt eine verständliche Fehlermeldung; die vorhandenen Daten bleiben unverändert. |
| D-07 | P1 | Beschädigte oder teilweise ungültige lokale Daten laden | Lesbare Aufgaben bleiben verfügbar; übersprungene Daten und mögliche Sicherung werden gemeldet. |
| D-08 | P1 | `localStorage` blockieren oder Schreibfehler simulieren | Speicherfehler wird sichtbar gemeldet; die App behauptet nicht, Änderungen dauerhaft gespeichert zu haben. |
| D-09 | P1 | Import mit ungültigen Aufgaben, ungültigem Verlauf und ungültigen Einstellungen | Ungültige Einträge werden kontrolliert übersprungen; gültige Daten bleiben nutzbar. |
| D-10 | P1 | Exportieren und anschließend wieder importieren | Roundtrip erhält alle gültigen Aufgaben, Verlaufseinträge und Einstellungen. |
| D-11 | P1 | Speicher blockiert oder fast voll, Protokoll mit vielen Einträgen, danach neue Aufgabe anlegen | Das Protokoll im Programm bleibt vollständig (die Zusammenfassung zeigt alles). Bei vollem Speicher wird nur eine gekürzte Kopie der neuesten Einträge abgelegt. Beim Start wird das Protokoll nur geschrieben, wenn es neu aufgebaut oder bereinigt wurde. |
| D-12 | P0 | Daten mit höherer `kanban_version` (z. B. 2) im Speicher, unbekannte Felder in den Aufgaben; danach anlegen, verschieben, Einstellungen ändern, exportieren, importieren | Daten bleiben lesbar. Der Speicher (`kanban`, `kanban_log`, `kanban_version`, Einstellungen) wird nie verändert. Rote, bleibende Warnung oben. Export enthält die Originaldaten mit deren Versionsnummer, Import wird verweigert. Daten ohne Versionsangabe gelten als Version 1; ungültige Angaben ebenfalls. |
| D-13 | P1 | Import einer Sicherung mit höherer, ungültiger (`"x"`, `0`, `1.5`, `null`) oder fehlender Versionsnummer | Höhere Version und ungültige Nummer werden mit Meldung abgelehnt (vor der Prüfung der Aufgaben); fehlende Nummer gilt als Version 1. Ältere Versionen laufen durch die Migrationen. |

**Geklärt (D-10):** Puffer und Alterung sind überall auf höchstens `365` Tage begrenzt (Einstellungen, Laden, Import), der Aufwand einer Aufgabe auf höchstens `1000` Stunden. Die Grenzen stehen als `MAX_SETTING` und `MAX_EFFORT` in `src/dates.js`.

## 5. Zusammenfassung, Sicherheit und Barrierefreiheit

Die Zusammenfassung ist in `src/summary.js` implementiert.

- **Zusammenfassung:** Zeitraum 1, 30, ungültige Eingabe und leerer Verlauf prüfen. Ereigniszahlen, aktueller Stand und Verlauf müssen zum Zeitraum passen.
- **Protokollgrenzen:** Einträge außerhalb der letzten 30 Tage sowie oberhalb der maximalen Anzahl dürfen in der Zusammenfassung nicht erscheinen.
- **Unvertrauenswürdige Texte:** Titel und importierte Verlaufstexte mit HTML-ähnlichem Inhalt wie `<img onerror=...>` importieren. Der Text muss wörtlich angezeigt werden; es darf kein HTML ausgeführt werden.
- **Tastaturbedienung:** „Neue Aufgabe“ öffnen und ausfüllen (Enter speichert, Umschalt+Enter macht eine neue Zeile), Dialoge schließen, Bearbeiten, Verschieben und Undo ohne Maus bedienen. Fokuszustand muss sichtbar sein.
- **Dialoge:** „Neue Aufgabe“, Einstellungen, Zusammenfassung und Bearbeitung öffnen und schließen; insbesondere „Abbrechen“, Escape und Klick auf den Dialoghintergrund prüfen (siehe F-11).
- **Darstellung:** Helles und dunkles Farbschema, lange und mehrzeilige Aufgabentitel, viele Karten sowie horizontales Board-Scrollen auf schmalen Viewports testen.

## 6. Empfohlene Automatisierung und Abnahmekriterien

Die Automatisierung besteht aus zwei Stufen:

- **Schnelle Tests** (`npm test`, Ordner `tests/`): Datumsberechnung, Sortierung, Bereinigung, Importlogik, Dialoge in einer simulierten Browserumgebung sowie Aufbau von `index.html` und Aktualität von `dist/kanban.js`. Betroffene Logik liegt unter anderem in `src/dates.js`, `src/sort.js` und `src/storage.js`.
- **Browser-Tests** (`npm run test:e2e`, Ordner `e2e/`, Playwright in Chromium, Firefox und WebKit): Der Befehl baut `dist/` frisch und prüft die ausgelieferte Anwendung. Getestet werden zentrale Abläufe wie „Anlegen → Verschieben → Neuladen“ und „Export → Import“, Escape und Hintergrundklick bei Dialogen, Breite und Anordnung der Felder und Knöpfe sowie das Scroll-Layout.

Noch von Hand zu prüfen bleiben unter anderem Screenreader-Verhalten, Dateilinks in Safari und das tatsächliche Aussehen auf Mobilgeräten.

**Abnahme:** Alle P0-Fälle bestanden; keine Datenverluste in Import-/Persistenztests; keine unbehandelten Fehler in der Browserkonsole; P1-Abweichungen dokumentiert und priorisiert.
