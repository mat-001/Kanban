Read , lines 1 to 240
Completed with input: {
  "path": "/Users/ich/Projekte/HTML/Kanban/style.css",
  "view_range": [
    1,
    240
  ]
}

Read , lines 241 to 500
Completed with input: {
  "path": "/Users/ich/Projekte/HTML/Kanban/style.css",
  "view_range": [
    241,
    500
  ]
}

Read , lines 1 to 240
Completed with input: {
  "path": "/Users/ich/Projekte/HTML/Kanban/help.html",
  "view_range": [
    1,
    240
  ]
}

## Testplan: Kanban-Board

Der Plan deckt Kernfunktionen, Frist- und Sortierlogik, Persistenz, Import/Export sowie Bedienbarkeit ab. Die fachlichen Regeln stehen teilweise in der `Hilfe`; die zugehörige Oberfläche ist in `index.html` und `style.css` umgesetzt.

### 1. Testziele und Testumgebung

**Ziele**
- Sicherstellen, dass Aufgaben korrekt angelegt, bearbeitet, verschoben und gelöscht werden.
- Prüfen, ob Fristen, Prioritäten und Alterung wie beschrieben berechnet und sortiert werden.
- Datenverlust und Fehlverhalten bei beschädigten oder nicht verfügbaren Browserdaten erkennen.
- Import und Export sowie die Bedienbarkeit auf Desktop und Mobilgeräten absichern.

**Umgebung**
- Mit einer frischen Browser-Profilsitzung und einem separaten Profil für Persistenztests starten.
- Aktuelle Versionen von Chrome, Firefox und Safari prüfen.
- Desktop und schmales Mobil-Viewport testen; auf Mobilgeräten insbesondere horizontales Scrollen und die Pfeil-Schaltflächen prüfen.
- Für automatisierte Browserprüfungen einen lokalen HTTP-Server verwenden; `file://` bei Bedarf als zusätzlichen manuellen Test prüfen.

### 2. Funktionale Testfälle

| ID | Prio | Test | Erwartetes Ergebnis |
|---|---|---|---|
| F-01 | P0 | Seite erstmals ohne gespeicherte Daten öffnen | Board erscheint mit der vorgesehenen Beispielaufgabe. |
| F-02 | P0 | Aufgabe mit Text, Priorität, Termin und Aufwand anlegen | Aufgabe erscheint in „Zu erledigen“; Eingaben werden zurückgesetzt. |
| F-03 | P1 | Leeren bzw. nur aus Leerzeichen bestehenden Titel absenden | Aufgabe wird nicht angelegt; verständliche Meldung erscheint. |
| F-04 | P1 | Titel mit 120 Zeichen, danach längeren Text eingeben | Eingabe ist auf 120 Zeichen begrenzt; gültiger Titel wird korrekt angezeigt. |
| F-05 | P1 | Aufgabe bearbeiten und speichern | Geänderte Felder werden angezeigt und nach Neuladen beibehalten. |
| F-06 | P1 | Bearbeitung abbrechen oder Dialog schließen | Änderungen werden nicht übernommen. |
| F-07 | P0 | Aufgabe per Pfeil und per Drag-and-drop verschieben | Aufgabe wechselt in die richtige Spalte; der Verlauf erhält den passenden Eintrag. |
| F-08 | P1 | Aufgabe löschen und innerhalb von 10 Sekunden rückgängig machen | Aufgabe erscheint wieder; der Löschvorgang ist nicht mehr im Verlauf. |
| F-09 | P1 | Aufgabe löschen und Undo-Zeit ablaufen lassen | Aufgabe bleibt gelöscht; Undo-Meldung verschwindet. |
| F-10 | P1 | Einstellungen für Sicherheitspuffer und Alterung ändern | Werte werden übernommen, gespeichert und beeinflussen Anzeige bzw. Sortierung. |

### 3. Frist-, Alterungs- und Sortierlogik

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
| L-09 | P1 | Aufgabe von „In Arbeit“ zurück nach „Zu erledigen“ verschieben | Die Wartezeit beginnt gemäß Beschreibung in der Hilfe neu. **Diesen Fall gezielt prüfen:** Die Logik für `since` in `src/task.js` setzt den Wert derzeit nur beim Zurückholen einer erledigten Aufgabe. |

### 4. Speicherung, Import und Export

Persistenz- und Bereinigungslogik liegt in `src/storage.js`; Import und Export in `src/backup.js`.

| ID | Prio | Test | Erwartetes Ergebnis |
|---|---|---|---|
| D-01 | P0 | Aufgabe anlegen, Seite neu laden | Aufgabe und Spaltenzuordnung bleiben erhalten. |
| D-02 | P1 | Export durchführen und Datei prüfen | Sicherung enthält Aufgaben, Verlauf, Einstellungen, Formatkennung und Versionsnummer. |
| D-03 | P0 | Export in frischem Profil importieren | Aufgaben und Verlauf werden übernommen; Einstellungen aus der Sicherung ersetzen die aktuellen. |
| D-04 | P1 | Dieselbe Sicherung mehrfach importieren | Bereits vorhandene Aufgaben werden übersprungen; Aufgaben werden nicht vervielfacht. |
| D-05 | P1 | Import mit doppelten IDs, aber unterschiedlichen Titeln | IDs werden konfliktfrei behandelt; keine Aufgabe geht verloren. |
| D-06 | P1 | Ungültige JSON-Datei, fehlende Aufgabenliste und Datei über 2 MB importieren | Import wird abgelehnt und zeigt eine verständliche Fehlermeldung; die vorhandenen Daten bleiben unverändert. |
| D-07 | P1 | Beschädigte oder teilweise ungültige lokale Daten laden | Lesbare Aufgaben bleiben verfügbar; übersprungene Daten und mögliche Sicherung werden gemeldet. |
| D-08 | P1 | `localStorage` blockieren oder Schreibfehler simulieren | Speicherfehler wird sichtbar gemeldet; die App behauptet nicht, Änderungen dauerhaft gespeichert zu haben. |
| D-09 | P1 | Import mit ungültigen Aufgaben, ungültigem Verlauf und ungültigen Einstellungen | Ungültige Einträge werden kontrolliert übersprungen; gültige Daten bleiben nutzbar. |
| D-10 | P1 | Exportieren und anschließend wieder importieren | Roundtrip erhält alle gültigen Aufgaben, Verlaufseinträge und Einstellungen. |

**Zu klärender Grenzfall für D-10:** Der Import akzeptiert Einstellungen nur bis `365`, die Einstellungsfelder selbst haben aber keine entsprechende Obergrenze. Es sollte festgelegt werden, ob Werte über `365` zulässig sind oder beim Einstellen begrenzt werden.

### 5. Zusammenfassung, Sicherheit und Barrierefreiheit

Die Zusammenfassung ist in `src/summary.js` implementiert.

- **Zusammenfassung:** Zeitraum 1, 30, ungültige Eingabe und leerer Verlauf prüfen. Ereigniszahlen, aktueller Stand und Verlauf müssen zum Zeitraum passen.
- **Protokollgrenzen:** Einträge außerhalb der letzten 30 Tage sowie oberhalb der maximalen Anzahl dürfen in der Zusammenfassung nicht erscheinen.
- **Unvertrauenswürdige Texte:** Titel und importierte Verlaufstexte mit HTML-ähnlichem Inhalt wie `<img onerror=...>` importieren. Der Text muss wörtlich angezeigt werden; es darf kein HTML ausgeführt werden.
- **Tastaturbedienung:** Formulare, Dialoge, Schließen, Bearbeiten, Verschieben und Undo ohne Maus bedienen. Fokuszustand muss sichtbar sein.
- **Dialoge:** Einstellungen, Zusammenfassung und Bearbeitung öffnen und schließen; insbesondere Escape und Klick auf den Dialoghintergrund prüfen.
- **Darstellung:** Helles und dunkles Farbschema, lange Aufgabentitel, viele Karten sowie horizontales Board-Scrollen auf schmalen Viewports testen.

### 6. Empfohlene Automatisierung und Abnahmekriterien

Als erste Automatisierungsstufe eignen sich Tests für Datumsberechnung, Sortierung, Bereinigung und Importlogik sowie wenige Browsertests für die zentralen Abläufe „Anlegen → Verschieben → Neuladen“ und „Export → Import“. Betroffene Logik liegt unter anderem in `src/dates.js`, `src/sort.js` und `src/storage.js`.

**Abnahme:** Alle P0-Fälle bestanden; keine Datenverluste in Import-/Persistenztests; keine unbehandelten Fehler in der Browserkonsole; P1-Abweichungen dokumentiert und priorisiert.