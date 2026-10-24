// Antiallergika: allgemeine Informationen nach Fachinformation (übliche Dosierungen, Stand 2026).
// Keine Therapieempfehlung. dose(age, weight) liefert die übliche Tagesdosis oder null, wenn nicht zugelassen.

const MED_CATEGORIES = [
  { id: 'tablette', name: 'Tabletten (Antihistaminika)', hint: 'Wirken gegen Niesen, Juckreiz, Fließschnupfen und tränende Augen. Wenig Wirkung auf verstopfte Nase.' },
  { id: 'nase', name: 'Nasensprays', hint: 'Kortison-Sprays sind laut Leitlinie am wirksamsten bei Heuschnupfen, brauchen aber einige Tage bis zur vollen Wirkung.' },
  { id: 'auge', name: 'Augentropfen', hint: 'Bei juckenden, geröteten Augen. Kontaktlinsen vorher herausnehmen.' },
  { id: 'weitere', name: 'Weitere & Notfall', hint: 'Ärztlich verordnete Optionen.' },
  { id: 'ait', name: 'Ursachentherapie', hint: 'Behandelt die Ursache statt nur Symptome.' }
];

const MEDS = [
  {
    id: 'cetirizin', name: 'Cetirizin', cat: 'tablette', klass: 'Antihistaminikum, 2. Generation',
    rx: 'rezeptfrei', onset: 'ca. 1 Std.', duration: '24 Std.', sedation: 'gering bis mäßig',
    minAge: 2, pregnancy: 'preferred', kidney: true, for: ['pollen', 'milben', 'tierhaare', 'schimmel'],
    dose: (age) => age >= 12 ? '10 mg 1× täglich' : age >= 6 ? '5 mg 2× täglich' : age >= 2 ? '2,5 mg 2× täglich (Tropfen/Saft)' : null,
    notes: ['Am besten abends einnehmen, falls es müde macht.', 'Alkohol verstärkt die Müdigkeit.']
  },
  {
    id: 'levocetirizin', name: 'Levocetirizin', cat: 'tablette', klass: 'Antihistaminikum, 2. Generation',
    rx: 'Rezeptstatus in der Apotheke erfragen', onset: 'ca. 1 Std.', duration: '24 Std.', sedation: 'gering',
    minAge: 2, kidney: true, for: ['pollen', 'milben', 'tierhaare', 'schimmel'],
    dose: (age) => age >= 6 ? '5 mg 1× täglich' : age >= 2 ? '1,25 mg 2× täglich (Lösung)' : null,
    notes: ['Wirksame Hälfte von Cetirizin, daher niedrigere Dosis.']
  },
  {
    id: 'loratadin', name: 'Loratadin', cat: 'tablette', klass: 'Antihistaminikum, 2. Generation',
    rx: 'rezeptfrei', onset: '1–3 Std.', duration: '24 Std.', sedation: 'sehr gering',
    minAge: 2, pregnancy: 'preferred', for: ['pollen', 'milben', 'tierhaare', 'schimmel'],
    dose: (age, w) => age >= 12 ? '10 mg 1× täglich' : age >= 2 ? (w ? (w > 30 ? '10 mg 1× täglich (über 30 kg)' : '5 mg 1× täglich (bis 30 kg, Saft)') : '5 mg (bis 30 kg) bzw. 10 mg (über 30 kg) 1× täglich') : null,
    notes: ['Kinderdosis richtet sich nach dem Körpergewicht.']
  },
  {
    id: 'desloratadin', name: 'Desloratadin', cat: 'tablette', klass: 'Antihistaminikum, 2. Generation',
    rx: 'verschreibungspflichtig', onset: 'ca. 1 Std.', duration: '24 Std.', sedation: 'sehr gering',
    minAge: 1, for: ['pollen', 'milben', 'tierhaare', 'schimmel'],
    dose: (age) => age >= 12 ? '5 mg 1× täglich' : age >= 6 ? '2,5 mg 1× täglich (Lösung)' : age >= 1 ? '1,25 mg 1× täglich (Lösung)' : null,
    notes: ['Wirksames Abbauprodukt von Loratadin.']
  },
  {
    id: 'fexofenadin', name: 'Fexofenadin', cat: 'tablette', klass: 'Antihistaminikum, 2. Generation',
    rx: 'Rezeptstatus in der Apotheke erfragen', onset: 'ca. 1 Std.', duration: '24 Std.', sedation: 'praktisch keine',
    minAge: 6, for: ['pollen', 'milben', 'tierhaare', 'schimmel'],
    dose: (age) => age >= 12 ? '120 mg 1× täglich (Heuschnupfen)' : age >= 6 ? '30 mg 2× täglich' : null,
    notes: ['Nicht mit Fruchtsäften (Grapefruit, Orange, Apfel) einnehmen – vermindert die Aufnahme.', 'Gut geeignet, wenn Müdigkeit vermieden werden muss (Autofahren, Prüfungen).']
  },
  {
    id: 'bilastin', name: 'Bilastin', cat: 'tablette', klass: 'Antihistaminikum, 2. Generation',
    rx: 'verschreibungspflichtig', onset: 'ca. 1 Std.', duration: '24 Std.', sedation: 'praktisch keine',
    minAge: 6, for: ['pollen', 'milben', 'tierhaare', 'schimmel'],
    dose: (age, w) => age >= 12 ? '20 mg 1× täglich, nüchtern' : age >= 6 ? (w && w < 20 ? null : '10 mg 1× täglich (ab 20 kg)') : null,
    notes: ['1 Std. vor oder 2 Std. nach dem Essen bzw. Fruchtsaft einnehmen.']
  },
  {
    id: 'rupatadin', name: 'Rupatadin', cat: 'tablette', klass: 'Antihistaminikum, 2. Generation',
    rx: 'verschreibungspflichtig', onset: '1–2 Std.', duration: '24 Std.', sedation: 'gering',
    minAge: 2, for: ['pollen', 'milben', 'tierhaare'],
    dose: (age, w) => age >= 12 ? '10 mg 1× täglich' : age >= 2 ? (w ? (w >= 25 ? '5 mg 1× täglich (Lösung, ab 25 kg)' : w >= 10 ? '2,5 mg 1× täglich (Lösung, 10–25 kg)' : null) : '2,5 mg (10–25 kg) bzw. 5 mg (ab 25 kg) 1× täglich') : null,
    notes: ['Keine Grapefruit gleichzeitig.']
  },
  {
    id: 'dimetinden', name: 'Dimetinden', cat: 'tablette', klass: 'Antihistaminikum, 1. Generation',
    rx: 'rezeptfrei', onset: '30 Min.', duration: '6–8 Std.', sedation: 'deutlich (macht müde)',
    minAge: 1, for: ['insekten', 'pollen'],
    dose: () => 'laut Packungsbeilage (mehrmals täglich)',
    notes: ['Ältere Wirkstoffgruppe: macht deutlich müde, beeinträchtigt Fahrtüchtigkeit.', 'Als Gel auch bei Insektenstichen.']
  },
  {
    id: 'mometason', name: 'Mometason', cat: 'nase', klass: 'Kortison-Nasenspray',
    rx: 'rezeptfrei ab 18 J. (nach ärztlicher Erstdiagnose), sonst Rezept', onset: '12 Std., volle Wirkung nach Tagen', duration: '24 Std.', sedation: 'keine',
    minAge: 3, pregnancy: 'preferred', for: ['pollen', 'milben', 'tierhaare', 'schimmel'],
    dose: (age) => age >= 12 ? '2 Sprühstöße je Nasenloch 1× täglich' : age >= 3 ? '1 Sprühstoß je Nasenloch 1× täglich' : null,
    notes: ['Am besten schon kurz vor Saisonbeginn starten.', 'Regelmäßig anwenden, nicht nur bei Bedarf.']
  },
  {
    id: 'fluticason', name: 'Fluticasonpropionat', cat: 'nase', klass: 'Kortison-Nasenspray',
    rx: 'rezeptfrei ab 18 J., sonst Rezept', onset: '12 Std., volle Wirkung nach Tagen', duration: '24 Std.', sedation: 'keine',
    minAge: 4, pregnancy: 'ok', for: ['pollen', 'milben', 'tierhaare', 'schimmel'],
    dose: (age) => age >= 12 ? '2 Sprühstöße je Nasenloch 1× täglich' : age >= 4 ? '1 Sprühstoß je Nasenloch 1× täglich' : null,
    notes: ['Sprühkopf leicht nach außen richten, nicht auf die Nasenscheidewand.']
  },
  {
    id: 'budesonid', name: 'Budesonid', cat: 'nase', klass: 'Kortison-Nasenspray',
    rx: 'Rezeptstatus in der Apotheke erfragen', onset: '1–2 Tage', duration: '24 Std.', sedation: 'keine',
    minAge: 6, pregnancy: 'preferred', for: ['pollen', 'milben', 'tierhaare', 'schimmel'],
    dose: (age) => age >= 6 ? 'laut Packungsbeilage, meist 1–2 Sprühstöße je Nasenloch 1–2× täglich' : null,
    notes: ['In der Schwangerschaft besonders gut untersucht.']
  },
  {
    id: 'azelastin-nase', name: 'Azelastin (Nase)', cat: 'nase', klass: 'Antihistaminikum-Nasenspray',
    rx: 'rezeptfrei', onset: '15 Min.', duration: '12 Std.', sedation: 'gering, bitterer Geschmack möglich',
    minAge: 6, for: ['pollen', 'tierhaare'],
    dose: (age) => age >= 6 ? '1 Sprühstoß je Nasenloch 2× täglich' : null,
    notes: ['Schneller Wirkeintritt, gut bei akuten Beschwerden.']
  },
  {
    id: 'azelastin-fluticason', name: 'Azelastin + Fluticason', cat: 'nase', klass: 'Kombinationsspray',
    rx: 'verschreibungspflichtig', onset: '30 Min.', duration: '12 Std.', sedation: 'gering',
    minAge: 12, for: ['pollen'],
    dose: (age) => age >= 12 ? '1 Sprühstoß je Nasenloch 2× täglich' : null,
    notes: ['Für mittelschwere bis schwere Beschwerden, wenn ein Wirkstoff allein nicht reicht.']
  },
  {
    id: 'cromoglicin-nase', name: 'Cromoglicinsäure (Nase)', cat: 'nase', klass: 'Mastzellstabilisator',
    rx: 'rezeptfrei', onset: 'mehrere Tage (vorbeugend)', duration: '4–6 Std.', sedation: 'keine',
    minAge: null, pregnancy: 'preferred', for: ['pollen', 'tierhaare'],
    dose: () => '1 Sprühstoß je Nasenloch 4× täglich',
    notes: ['Nur vorbeugend wirksam, früh beginnen.', 'Sehr gut verträglich, schwächer als Kortison.']
  },
  {
    id: 'ketotifen-auge', name: 'Ketotifen (Augentropfen)', cat: 'auge', klass: 'Antihistaminikum + Mastzellstabilisator',
    rx: 'rezeptfrei', onset: '15 Min.', duration: '8–12 Std.', sedation: 'keine',
    minAge: 3, for: ['pollen', 'tierhaare'],
    dose: (age) => age >= 3 ? '1 Tropfen je Auge 2× täglich' : null,
    notes: []
  },
  {
    id: 'azelastin-auge', name: 'Azelastin (Augentropfen)', cat: 'auge', klass: 'Antihistaminikum',
    rx: 'rezeptfrei', onset: '15 Min.', duration: '8–12 Std.', sedation: 'keine',
    minAge: 4, for: ['pollen', 'tierhaare'],
    dose: (age) => age >= 4 ? '1 Tropfen je Auge 2× täglich (bei Bedarf bis 4×)' : null,
    notes: []
  },
  {
    id: 'cromoglicin-auge', name: 'Cromoglicinsäure (Augentropfen)', cat: 'auge', klass: 'Mastzellstabilisator',
    rx: 'rezeptfrei', onset: 'mehrere Tage (vorbeugend)', duration: '4–6 Std.', sedation: 'keine',
    minAge: null, pregnancy: 'preferred', for: ['pollen', 'tierhaare'],
    dose: () => '1 Tropfen je Auge 4× täglich',
    notes: ['Einzeldosen ohne Konservierungsmittel bevorzugen.']
  },
  {
    id: 'montelukast', name: 'Montelukast', cat: 'weitere', klass: 'Leukotrien-Rezeptor-Antagonist',
    rx: 'verschreibungspflichtig', onset: 'Stunden bis Tage', duration: '24 Std.', sedation: 'keine',
    minAge: 2, asthma: true, for: ['pollen', 'milben'],
    dose: (age) => age >= 15 ? '10 mg 1× täglich abends' : age >= 6 ? '5 mg Kautablette abends' : age >= 2 ? '4 mg Kautablette/Granulat abends' : null,
    notes: ['Vor allem bei allergischem Asthma als Zusatztherapie.', 'Behördlicher Warnhinweis: auf Schlafstörungen, Albträume und Stimmungsänderungen achten.']
  },
  {
    id: 'adrenalin', name: 'Adrenalin-Autoinjektor (Notfallset)', cat: 'weitere', klass: 'Notfallmedikament bei Anaphylaxie',
    rx: 'verschreibungspflichtig', onset: 'Minuten', duration: '10–20 Min.', sedation: '–',
    minAge: null, for: ['insekten'],
    dose: (age, w) => w ? (w < 15 ? 'ärztlich festlegen (unter 15 kg)' : w <= 30 ? '150 µg (15–30 kg)' : w < 60 ? '300 µg (über 30 kg)' : '300 µg, ab 60 kg ggf. 500 µg (ärztlich festlegen)') : 'nach Körpergewicht: 150 µg (15–30 kg), 300 µg (über 30 kg)',
    notes: ['Bei Atemnot, Kreislaufproblemen oder Schwellung im Hals sofort in den Oberschenkel spritzen und 112 rufen.', 'Zum Set gehören meist auch ein Antihistaminikum und Kortison zum Einnehmen.']
  },
  {
    id: 'ait', name: 'Hyposensibilisierung (AIT)', cat: 'ait', klass: 'Allergen-Immuntherapie als Spritze (SCIT) oder Tablette/Tropfen (SLIT)',
    rx: 'ärztliche Therapie', onset: 'nach Monaten', duration: 'jahrelang nach Abschluss', sedation: 'keine',
    minAge: 5, for: ['pollen', 'milben', 'insekten', 'tierhaare'],
    dose: () => 'über ca. 3 Jahre nach Schema der Ärztin/des Arztes',
    notes: ['Einzige Behandlung der Ursache, kann Asthma vorbeugen.', 'Bei Pollenallergie Start meist im Herbst oder Winter, also außerhalb der Saison.', 'Bei Insektengiftallergie sehr hohe Erfolgsrate.']
  }
];
