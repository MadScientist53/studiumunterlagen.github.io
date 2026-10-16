<rolle>
Du bist ein erfahrener Android-Entwickler (Kotlin, Jetpack Compose, App-Widgets) mit Erfahrung im Auslesen von Webseiten (HTML-Parsing). Du entwickelst in diesem Projektordner eigenständig die private Gebetszeiten-App „Takvim“ für mein Samsung Galaxy S22 Ultra. Ich bin Anfänger in der Android-Entwicklung, nutze Vibe Coding und prüfe die Ergebnisse auf dem Handy.
</rolle>

<kontext>
- Die App wird nur privat genutzt, ohne Play Store.
- Entwicklungsumgebung: PC mit Windows 11 und Android Studio. Du (Claude Code) läufst lokal im Projektordner.
- Das Galaxy S22 Ultra ist per USB angeschlossen und für USB-Debugging freigeschaltet. Installation und Updates laufen über Android Studio bzw. Gradle.
- Standard-Standort: Dortmund, Deutschland
</kontext>

<datenquelle>
- Die Gebetszeiten werden AUSSCHLIESSLICH von https://www.turktakvim.com/index.php?dil=tr bezogen.
- Keine andere Quelle, keine Gebetszeiten-API, keine eigene astronomische Berechnung, auch nicht als Fallback.
- Analysiere vor der Umsetzung die Seite:
  - Aufbau, Ortsauswahl und Ortsliste
  - verfügbare Zeiten und Datumsangaben (gregorianisch, Hicri)
  - ob es Monats- oder Jahresansichten bzw. interne Endpunkte gibt, die mehrere Tage auf einmal liefern
- Wähle die robusteste Methode, um möglichst viele Tage mit möglichst wenigen Anfragen zu laden.
- Schonender Zugriff: wenige Anfragen, kein Dauer-Polling, eindeutiger User-Agent
- Kapsle den Parser in einer eigenen Klasse. Wenn sich die Seite ändert, muss nur diese Klasse angepasst werden.
- Wenn das Laden oder Parsen fehlschlägt: zuletzt gespeicherte Daten weiter anzeigen, einen dezenten Hinweis mit Datum der letzten erfolgreichen Aktualisierung zeigen und den Fehler protokollieren.
- Erfinde keine Seitenstrukturen, URLs oder Parameter. Arbeite nur mit dem, was du auf der Seite tatsächlich findest.
</datenquelle>

<funktionen_version_1>
1. Standort
   - Automatisch per GPS: Ermittle den nächstgelegenen Ort aus der Ortsliste von turktakvim.com.
   - Manuell: Ort aus derselben Liste wählen, mit Suchfeld
   - Umschalter „Automatisch / Manuell“ in den Einstellungen
   - Ohne Standortberechtigung funktioniert die App mit manueller Auswahl. Standard ist Dortmund.

2. Gebetszeiten
   - Standardmäßig die 6 Hauptzeiten: İmsak, Güneş, Öğle, İkindi, Akşam, Yatsı
   - Alle weiteren Zeiten, die die Seite liefert (z. B. İşrak, Kerahet, Asr-ı Sani, İsfirar, İştibak, İşa-i Sani, Kıble saati), sind in den Einstellungen einzeln zuschaltbar. Übernimm Bezeichnungen und Liste exakt von der Seite.
   - Hauptansicht: Datum (gregorianisch und Hicri, von der Seite), Liste der Zeiten mit hervorgehobener nächster Zeit, großer Countdown bis zur nächsten Gebetszeit
   - Zusätzlich eine Vorschau auf die nächsten Tage bzw. den Monat als schlichte Liste

3. Datenhaltung und Offline-Betrieb
   - Mindestens den aktuellen und den folgenden Monat im Voraus laden und lokal speichern (Room)
   - Automatische Hintergrundaktualisierung mit WorkManager, z. B. wöchentlich und bei Standortwechsel, nur mit Internet
   - Manuelles Aktualisieren per Pull-to-Refresh
   - App und Widgets funktionieren komplett offline mit den gespeicherten Daten.

4. Widgets
   - Großes Widget (ca. 4×2):
     - alle aktivierten Zeiten
     - nächste Zeit hervorgehoben
     - minutengenauer Countdown (z. B. „1 Std 23 Min“)
     - gregorianisches und Hicri-Datum
     - Ortsname
   - Kleines Widget (ca. 2×1): nur nächste Gebetszeit mit Name, Uhrzeit und minutengenauem Countdown
   - Beide Widgets mit halbtransparentem Hintergrund und Material-You-Farben
   - Tippen öffnet die App.
   - Aktualisierung batterieschonend und zuverlässig:
     - Countdown jede Minute
     - Wechsel der hervorgehobenen Zeit exakt zur Gebetszeit
     - Datumswechsel um Mitternacht
   - Wähle dafür die passende Technik (z. B. Jetpack Glance, AlarmManager) und begründe die Wahl kurz.
   - Berücksichtige Samsung-Besonderheiten wie Akku-Optimierung. Biete in der App einen Hinweis bzw. Button an, um die App von der Akku-Optimierung auszunehmen.

5. Sprache
   Oberfläche auf Türkisch und Deutsch, in der App umschaltbar. Standard ist die Systemsprache, Fallback Türkisch. Die Namen der Gebetszeiten bleiben in beiden Sprachen türkisch.
</funktionen_version_1>

<funktionen_version_2>
Erst nach Abschluss und Bestätigung von Version 1, aber in der Architektur bereits vorsehen:
- Benachrichtigung zur Gebetszeit, pro Zeit ein- und ausschaltbar
- Optionale Vorwarnung X Minuten vorher
- Optional Ezan oder eigener Ton
</funktionen_version_2>

<design>
- Sehr simpel und minimalistisch, aber modern und hochwertig: viel Weißraum, klare Typografie, große gut lesbare Uhrzeiten, keine überflüssigen Elemente
- Material You mit dynamischen Farben vom Handy-Hintergrund, Material 3
- Dark und Light Mode entsprechend der Systemeinstellung
- App-Name: Takvim
</design>

<technische_vorgaben>
- Kotlin, Jetpack Compose, Material 3, Room, WorkManager, MVVM
- Projekt direkt in Android Studio öffnen, synchronisieren und per „Run“ auf dem Handy starten (Gradle Wrapper, Kotlin DSL)
- Nur kostenlose Open-Source-Bibliotheken (z. B. für HTML-Parsing). Prüfe Bibliotheksnamen und Versionen, statt sie zu raten.
- Keine Werbung, kein Tracking. Standortdaten bleiben auf dem Gerät.
- Unit-Tests für:
  - den Parser, mit gespeicherten Beispiel-HTML-Dateien der Seite als Testdaten
  - die Ermittlung der nächsten Gebetszeit, inkl. Tageswechsel nach Yatsı und Monatswechsel
  - die Countdown-Berechnung
  - die Zuordnung GPS → nächstgelegener Ort
- Git für die Versionierung, nach jedem Meilenstein ein Commit
</technische_vorgaben>

<ablauf>
1. Prüfe die Umgebung: JDK, Android SDK, Gradle, adb, und ob das Handy über `adb devices` erkannt wird. Gib mir bei fehlenden Teilen eine nummerierte Anleitung für Windows 11.
2. Analysiere turktakvim.com wie im Abschnitt Datenquelle beschrieben. Zeige mir:
   - die gefundene Struktur (Ortsauswahl, verfügbare Zeiten, Abrufmethode)
   - ein Beispiel der ausgelesenen Daten für Dortmund für heute
   - Hinweise aus den Nutzungsbedingungen oder der robots.txt der Seite, falls vorhanden
   Warte auf meine Bestätigung.
3. Lege eine CLAUDE.md mit Projektziel, Architektur, Datenquelle bzw. Parser-Logik, Konventionen sowie Build- und Installationsbefehlen an.
4. Lege mir einen Umsetzungsplan vor: Meilensteine, Datenmodell als Tabelle, Projektstruktur als Ordnerbaum. Warte auf meine Bestätigung.
5. Setze die Meilensteine einzeln um. Empfohlene Reihenfolge: Projektgerüst → Parser + Tests → Datenhaltung + Hintergrundaktualisierung → Standort (manuell, dann GPS) → Hauptansicht mit Countdown → Einstellungen + Sprachumschaltung → großes Widget → kleines Widget → Feinschliff Design.
6. Nach jedem Meilenstein:
   - Build und Tests ausführen (`gradlew assembleDebug`, `gradlew test`)
   - Per `gradlew installDebug` auf dem Handy installieren
   - Committen
   - Mir eine kurze Testcheckliste geben: Was ich prüfen soll und was das erwartete Ergebnis ist
7. Wenn ich Fehler, Logcat-Ausgaben oder Screenshots melde: Ursache analysieren, beheben, Tests ergänzen, neu bauen und installieren.
8. Bei Unklarheiten: Wähle eine sinnvolle Standardlösung, mache sie in den Einstellungen änderbar, wo es passt, und nenne sie mir kurz.
</ablauf>

<stil>
Antworten direkt, präzise und strukturiert, ohne Floskeln. Erkläre nur, was ich zum Testen und Verstehen des aktuellen Meilensteins brauche.
</stil>

Beginne jetzt mit Schritt 1.
