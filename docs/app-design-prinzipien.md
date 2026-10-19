# App-Design-Prinzipien für Android-Apps

Quellen und Kennzeichnung:
- **[F]** = abgeleitet aus der Figma-Datei „Mobile App UI“ (Notiz-App „Notely“ von Kole Jain, iOS-Mockups 393×852 + Desktop-Dashboard)
- **[A]** = Übertragung auf Android / Material 3
- Video „Everything you need to know about Mobile App UI's in 8 minutes“ (Kole Jain): Inhalt konnte nicht abgerufen werden (YouTube aus der Umgebung gesperrt, kein Transkript gefunden). Abschnitt 9 ist ein Platzhalter zum Ergänzen.

---

## 1. Layout & Raster

| Regel | Wert | Quelle |
|---|---|---|
| Seitenrand links/rechts | **16 dp** (Inhalt 361 von 393 Breite) | F |
| Abstandsraster | **4er-Raster**: 4 · 8 · 12 · 16 · 24 (häufigste Werte) | F |
| Innenabstand Karten/Container | 12–16 dp, kleine Chips 4 dp | F |
| Abstand zwischen Sektionen | größer als innerhalb einer Sektion (z. B. 24 vs. 8–12) | F |
| Edge-to-Edge | Inhalt läuft hinter Status- und Navigationsleiste, Insets beachten | A |

**Klausur-Merksatz:** Abstände nie frei wählen, sondern nur Werte aus dem Raster verwenden. Nähe gruppiert, Abstand trennt.

## 2. Navigation

| Regel | Umsetzung | Quelle |
|---|---|---|
| Hauptnavigation unten | Schwebende Pill-Leiste mit 4 Zielen (Overview, Notes, Calendar, Tasks) | F |
| Primäre Aktion getrennt | Runder Button (FAB) neben der Leiste, öffnet „Create“-Sheet | F |
| Max. 3–5 Hauptziele | Mehr gehört in Menüs bzw. Einstellungen | A |
| Sekundäre Aktionen kontextbezogen | Long-Press auf Karte → Menü (Pin, Lock, Share, History, Delete) | F |
| Destruktive Aktion | „Delete“ ganz unten im Menü, farblich abgesetzt (rot) | F |
| Android | Material 3 `NavigationBar` + FAB, Systemzurück-Geste bzw. Predictive Back unterstützen | A |

## 3. Inhalte & Hierarchie

- **Startseite = Überblick:** Sektionen mit Überschrift (Recents, Suggested, Calendar, Daily Tasks). Jede Sektion beantwortet eine Frage. [F]
- **Horizontales Karussell:** Die nächste Karte ist angeschnitten sichtbar, damit klar ist, dass man wischen kann. [F]
- **Karten zeigen nur das Nötigste:** Titel, 2–3 Zeilen Vorschau, Metadatum („3h ago“). [F]
- **Bottom Sheets** für Auswahl und Erstellen (Templates mit Suchfeld, Create-Menü) statt neuer Vollbildseiten. [F]
- **Empty State gestalten:** Überschrift („Get started with …“), ein Satz Erklärung, klarer Einstieg. Nie einen leeren Bildschirm zeigen. [F]
- **Kontext-Toolbar über der Tastatur** im Editor (Insert Template, Insert Event …). [F]

## 4. Typografie

| Rolle | Größe / Gewicht (Figma) | Android-Äquivalent [A] |
|---|---|---|
| Seitentitel | 24 Bold | `headlineSmall` (24 sp) |
| Sektions- bzw. Kartentitel | 16–18 SemiBold | `titleMedium`/`titleLarge` |
| Fließtext | 14–16 Regular/Medium | `bodyLarge`/`bodyMedium` |
| Metadaten, Labels | 12 Regular (am häufigsten) | `labelMedium`/`bodySmall` |
| Kleinstes | 10 | `labelSmall` (11 sp) |

- **Eine Schriftfamilie** (DM Sans), Hierarchie nur über Größe, Gewicht und Farbe. [F]
- Gewichte begrenzen: Regular · Medium · SemiBold (Bold nur für Seitentitel). [F]
- Auf Android immer in **sp** angeben, damit die Systemschriftgröße respektiert wird. [A]

## 5. Farben (Dark Theme)

| Rolle | Wert | Quelle |
|---|---|---|
| Hintergrund | #141414 (kein reines Schwarz) | F |
| Flächen (Karten, Leisten) | #1F1F1F · #242424 · #3F3F3F bzw. Weiß mit 11 % Deckkraft | F |
| Text primär | #FFFFFF | F |
| Text sekundär/tertiär | #808080 · #646464 | F |
| Akzentfarben | sparsam, nur für Kategorien/Status: Gelb #FFDD55, Violett #7373FF, Koralle #FF8573, Blau #0F77F0 | F |
| Akzent als Hintergrund | Akzentfarbe mit ~10 % Deckkraft hinter farbigem Text/Icon | F |
| Design-Tokens | Variablen je Modus: Primary · Secondary · Ink · Action · Alt (Light + Dark) | F |

- **Hierarchie über Helligkeitsstufen** statt über viele Farben. [F]
- Farben als Tokens im Theme definieren, nie hart im Code. Light und Dark als zwei Modi derselben Tokens. [F/A]
- Kontrast Text/Hintergrund mind. 4,5 : 1 (WCAG AA). [A]
- Optional Dynamic Color (Material You), dann Akzente aus dem Farbschema statt fester Werte. [A]

## 6. Formen & Tiefe

| Element | Eckenradius | Quelle |
|---|---|---|
| Karten | **16** | F |
| Kleine Elemente (Chips, Tags) | 5–10 | F |
| Buttons, Navigationsleiste, Suchfeld | **voll rund (Pill)** | F |
| Große Flächen, Bilder | 20–28 | F |

- **Wenige feste Radien** konsequent wiederverwenden. [F]
- Tiefe durch **1-px-Lichtkante** (Schatten y = 1, Blur 0) und **Hintergrund-Blur/Glas** bei schwebenden Elementen statt schwerer Schlagschatten. [F]
- **Verlauf am unteren Rand** hinter der schwebenden Navigation, damit Inhalt sauber ausblendet. [F]
- Android: Glas-Effekte sparsam (Performance, ältere Geräte), alternativ halbtransparente Flächen. [A]

## 7. Interaktion & Bedienbarkeit

- **Touch-Ziele mind. 48 × 48 dp** (Figma: Icon-Buttons 48 × 48, Buttons 48 hoch). [F/A]
- **Zustände sichtbar machen:** Default, Fokus/Long-Press (Rest abgedunkelt), aktiv, leer. [F]
- **Wichtige Aktionen im Daumenbereich** (unteres Bildschirmdrittel). [F]
- Feedback auf jede Aktion: Ripple, Snackbar mit „Rückgängig“ beim Löschen. [A]

## 8. Komponenten-Denken

- Jedes Element als **Komponente mit Varianten** anlegen (Theme = Light/Dark, Size = Small/Large, State = Active/Inactive). [F]
- In Compose: wiederverwendbare `@Composable`s mit Parametern statt kopierter Layouts. [A]

## 9. Ergänzungen aus dem Video

*(Transkript in YouTube über „…mehr“ → „Transkript anzeigen“ kopieren und hier ergänzen lassen.)*

---

## Checkliste vor jedem Screen

- [ ] Ränder 16 dp, alle Abstände aus dem 4er-Raster
- [ ] Max. 3–5 Hauptziele in der Navigation, primäre Aktion klar erkennbar
- [ ] Eine Schrift, max. 3 Gewichte, Größen aus der Typo-Skala (sp)
- [ ] Farben nur als Tokens, Akzente sparsam, Kontrast ≥ 4,5 : 1
- [ ] Feste Radien: 16 Karten, Pill für Buttons, 5–10 klein
- [ ] Touch-Ziele ≥ 48 dp, Aktionen im Daumenbereich
- [ ] Empty State, Ladezustand und Fehlerzustand gestaltet
- [ ] Light und Dark Mode geprüft
