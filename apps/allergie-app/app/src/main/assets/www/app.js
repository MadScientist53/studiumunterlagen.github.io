'use strict';

// ---------- Bridge zur nativen App ----------
const A = window.Android;
const pending = {};
let cbSeq = 0;
window.__cb = (id, ok, payload) => {
  const p = pending[id];
  delete pending[id];
  if (p) ok ? p.resolve(payload) : p.reject(new Error(payload || 'Unbekannter Fehler'));
};
function call(fn, ...args) {
  return new Promise((resolve, reject) => {
    const id = 'cb' + (++cbSeq);
    pending[id] = { resolve, reject };
    A[fn](...args, id);
  });
}
function parse(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
}

// ---------- Daten & Zustand ----------
const CAT = JSON.parse(A.getCatalog());
const BY_ID = Object.fromEntries(CAT.allergens.map(a => [a.id, a]));
const LEVELS = CAT.levels;
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const SEV = ['', 'leicht', 'mittel', 'stark'];

const DEFAULT_PROFILE = {
  name: '', age: null, weight: null, height: null, sex: '',
  pregnant: false, asthma: false, kidney: false,
  allergies: {}, notify: true, locMode: 'gps', manual: null, dwdRegion: 0
};

const state = {
  tab: 'heute',
  profile: Object.assign({}, DEFAULT_PROFILE, parse(A.getProfile(), {})),
  report: parse(A.getCachedReport(), null),
  loading: false,
  error: '',
  calMonth: new Date().getMonth(),
  calMine: false,
  medsMine: true,
  placeResults: null
};

function hasProfile() { return Object.keys(state.profile.allergies || {}).length > 0; }
function saveProfile() { A.saveProfile(JSON.stringify(state.profile)); }
function myIds() { return Object.keys(state.profile.allergies || {}).filter(id => BY_ID[id]); }
function isMine(id) { return !!(state.profile.allergies || {})[id]; }

/** Kategorie eines Allergens für Tipps und Medikamente. */
function kindOf(a) {
  if (a.group === 'baum' || a.group === 'gras' || a.group === 'kraut') return 'pollen';
  return a.id;
}
function myKinds() { return [...new Set(myIds().map(id => kindOf(BY_ID[id])))]; }

/** Gleiche Regel wie PollenEngine.warnLevel (Java). */
function warnLevel(sev) {
  let l = 4 - Math.max(1, Math.min(3, sev || 2));
  if (state.profile.asthma) l--;
  return Math.max(1, l);
}

function liveOf(id) { return state.report && state.report.allergens ? state.report.allergens[id] : null; }
function todayLevel(id) {
  const r = liveOf(id);
  if (!r) return -1;
  const t = r.levels && r.levels[0] != null ? r.levels[0] : -1;
  return Math.max(t, r.currentLevel != null ? r.currentLevel : -1);
}

// ---------- Hilfen ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function lvlChip(l, label) {
  if (l == null || l < 0) return `<span class="lvl lvl-na">${label || 'k. A.'}</span>`;
  return `<span class="lvl lvl-${l}">${esc(label || LEVELS[l])}</span>`;
}
function meter(v) { return `<span class="meter c${v}"><span></span><span></span><span></span></span>`; }
function fmtTime(ms) {
  const d = new Date(ms);
  const today = new Date();
  const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === today.toDateString() ? `heute ${hm}` : `${d.toLocaleDateString('de-DE')} ${hm}`;
}
function dayLabel(iso, i) {
  if (i === 0) return 'Heute';
  if (i === 1) return 'Morgen';
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? '+' + i : WEEKDAYS[d.getDay()] + ' ' + d.getDate() + '.';
}
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}
function aqiLabel(v) {
  if (v == null) return ['k. A.', -1];
  if (v < 20) return ['Sehr gut', 1];
  if (v < 40) return ['Gut', 1];
  if (v < 60) return ['Mäßig', 2];
  if (v < 80) return ['Schlecht', 3];
  return ['Sehr schlecht', 4];
}

// ---------- Daten laden ----------
async function refresh() {
  if (state.loading) return;
  state.loading = true;
  state.error = '';
  render();
  try {
    const p = state.profile;
    let loc;
    if (p.locMode === 'manual' && p.manual) {
      loc = Object.assign({ source: 'manual' }, p.manual);
    } else {
      try {
        loc = Object.assign({ source: 'gps' }, JSON.parse(await call('requestLocation')));
      } catch (e) {
        const last = parse(A.getLastLocation(), null);
        if (last) {
          loc = Object.assign({ source: 'gps' }, last);
          toast(e.message + ' Letzter Standort wird verwendet.');
        } else if (p.manual) {
          loc = Object.assign({ source: 'manual' }, p.manual);
        } else {
          throw e;
        }
      }
    }
    const json = await call('loadReport', loc.lat, loc.lon, loc.name || '', loc.source, p.dwdRegion || 0);
    state.report = JSON.parse(json);
  } catch (e) {
    state.error = e.message;
  }
  state.loading = false;
  render();
}

// ---------- Ansicht: Heute ----------
function viewHeute() {
  const p = state.profile;
  const r = state.report;
  const now = new Date();
  let h = `<h1>${p.name ? 'Hallo, ' + esc(p.name) : 'Heute'}</h1>
    <div class="sub">${now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>`;

  // Standort
  const loc = r && r.location;
  const place = loc ? (loc.name || `${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`) : 'Noch kein Standort';
  h += `<div class="card row" style="margin-top:16px">
      <div class="grow">
        <h3>📍 ${esc(place)}</h3>
        <div class="muted">${loc ? (loc.source === 'manual' ? 'Manuell gewählt' : 'Aktueller Standort') : 'Tippe auf ↻ zum Laden'}
        ${r && r.region ? ' · DWD-Region ' + esc(r.region.name) : ''}</div>
        ${r ? `<div class="muted">Stand: ${fmtTime(r.fetchedAt)}</div>` : ''}
      </div>
      <button class="icon-btn" data-act="refresh" aria-label="Aktualisieren">${state.loading ? '<span class="spin">↻</span>' : '↻'}</button>
    </div>`;
  if (state.error) h += `<div class="card warn"><b>Laden fehlgeschlagen</b><p class="sub">${esc(state.error)}</p>${r ? '<p class="muted">Es werden die zuletzt geladenen Daten angezeigt.</p>' : ''}</div>`;

  if (!hasProfile()) {
    h += `<div class="card empty">
        <div class="big">🌿</div>
        <h3>Richte deine Allergien ein</h3>
        <p class="sub">Dann siehst du hier deine persönliche Belastung und bekommst Warnungen für deinen Standort.</p>
        <p style="margin-top:12px"><button class="btn primary" data-tab="profil">Profil anlegen</button></p>
      </div>`;
  } else {
    h += warningBlock();
    h += `<h2>Deine Allergien</h2>`;
    myIds().forEach(id => { h += allergenCard(id); });
  }

  if (r) {
    h += envBlock();
    h += tipsBlock();
    const others = CAT.allergens.filter(a => !isMine(a.id) && liveOf(a.id));
    if (others.length) {
      others.sort((a, b) => todayLevel(b.id) - todayLevel(a.id));
      h += `<h2>Weitere Pollen am Standort</h2><div class="card">`;
      others.forEach(a => {
        h += `<div class="list-row tap" data-allergen="${a.id}"><div class="grow">${esc(a.name)}</div>${lvlChip(todayLevel(a.id))}</div>`;
      });
      h += `</div>`;
    }
    h += `<p class="muted" style="margin-top:12px">Daten: DWD Pollenflug-Gefahrenindex (Deutschland, regional) und Open-Meteo/CAMS (standortgenau, Europa). Angaben ohne Gewähr.</p>`;
  }
  return h;
}

function warningBlock() {
  if (!state.report) return '';
  const hits = myIds().map(id => {
    const sev = state.profile.allergies[id].sev;
    return { id, l: todayLevel(id), w: warnLevel(sev) };
  }).filter(x => x.l >= 0 && x.l >= x.w).sort((a, b) => b.l - a.l);
  const live = myIds().filter(id => liveOf(id));
  if (hits.length) {
    return `<div class="card warn" style="margin-top:8px">
      <h3>⚠ Warnung für dich</h3>
      ${hits.map(x => `<div class="row between" style="margin-top:8px"><span>${esc(BY_ID[x.id].name)}</span>${lvlChip(x.l)}</div>`).join('')}
      <p class="muted" style="margin-top:8px">Basierend auf deiner Empfindlichkeit${state.profile.asthma ? ' und Asthma' : ''}. Tipps unten beachten, ggf. Medikamente rechtzeitig nehmen.</p>
    </div>`;
  }
  if (live.length) return `<div class="card ok" style="margin-top:8px"><h3>✓ Heute keine kritische Belastung für dich</h3></div>`;
  return '';
}

function allergenCard(id) {
  const a = BY_ID[id];
  const r = liveOf(id);
  const sev = state.profile.allergies[id].sev;
  const m = new Date().getMonth();
  let h = `<div class="card tap mine" data-allergen="${id}">
    <div class="row between">
      <div class="grow"><h3>${esc(a.name)}</h3><div class="muted">${esc(a.latin)} · Empfindlichkeit ${SEV[sev]}</div></div>`;
  if (r) {
    const cur = r.currentLevel != null ? r.currentLevel : -1;
    h += lvlChip(cur) + `</div>`;
    if (r.omCurrent != null) h += `<div class="sub" style="margin-top:6px">Aktuell ${r.omCurrent} Pollen/m³</div>`;
    const days = state.report.days || [];
    h += `<div class="forecast">`;
    for (let i = 0; i < 4; i++) {
      const l = r.levels && r.levels[i] != null ? r.levels[i] : null;
      h += `<div class="day">${esc(dayLabel(days[i] || '', i))}<div class="bar bg-${l == null ? 'na' : l}"></div>${l == null ? '–' : LEVELS[l]}</div>`;
    }
    h += `</div>`;
    const src = [r.dwdLevels ? 'DWD' : '', r.omLevels ? 'Open-Meteo' : ''].filter(Boolean).join(' + ');
    h += `<div class="muted" style="margin-top:8px">Quelle: ${src}</div>`;
  } else {
    const c = a.cal[m];
    h += `<span class="lvl lvl-na">${CAT.calLevels[c]}</span></div>
      <div class="sub" style="margin-top:6px">${a.om || a.dwd ? 'Aktuell keine Messwerte für deinen Standort.' : 'Keine Messdaten verfügbar.'}
      Saisonale Erwartung im ${MONTHS[m]}: <b>${CAT.calLevels[c]}</b></div>`;
  }
  h += `</div>`;
  return h;
}

function envBlock() {
  const r = state.report;
  let h = '';
  const aqi = r.aqi || {};
  const [lab, l] = aqiLabel(aqi.current);
  const w = r.weather;
  let tip = '';
  if (w && w.precipitation_sum) {
    const rain = w.precipitation_sum[0];
    const prob = w.precipitation_probability_max ? w.precipitation_probability_max[0] : null;
    const wind = w.wind_speed_10m_max ? w.wind_speed_10m_max[0] : null;
    if (rain >= 2) tip = 'Regen wäscht Pollen aus der Luft – nach einem Schauer ist eine gute Zeit zum Lüften.';
    else if (wind != null && wind >= 25 && rain < 0.5) tip = 'Trocken und windig – Pollen werden weit verteilt.';
    else if (rain < 0.5) tip = 'Trockenes Wetter begünstigt den Pollenflug.';
    h += `<h2>Umwelt</h2><div class="card">
      <div class="row between"><span>Luftqualität (EAQI)</span>${lvlChip(l, aqi.current != null ? lab + ' · ' + aqi.current : lab)}</div>
      <div class="row between" style="margin-top:8px"><span>Regen heute</span><span class="sub">${rain != null ? rain.toFixed(1) + ' mm' : '–'}${prob != null ? ' · ' + prob + ' %' : ''}</span></div>
      <div class="row between" style="margin-top:8px"><span>Wind max.</span><span class="sub">${wind != null ? Math.round(wind) + ' km/h' : '–'}</span></div>
      ${w.temperature_2m_max ? `<div class="row between" style="margin-top:8px"><span>Temperatur max.</span><span class="sub">${Math.round(w.temperature_2m_max[0])} °C</span></div>` : ''}
      ${tip ? `<p class="sub" style="margin-top:10px">💡 ${tip}</p>` : ''}
      ${state.profile.asthma && aqi.current >= 60 ? '<p class="sub" style="margin-top:6px">⚠ Bei Asthma: Anstrengung im Freien heute möglichst vermeiden.</p>' : ''}
    </div>`;
  } else if (aqi.current != null) {
    h += `<h2>Umwelt</h2><div class="card row between"><span>Luftqualität (EAQI)</span>${lvlChip(l, lab + ' · ' + aqi.current)}</div>`;
  }
  return h;
}

function tipsBlock() {
  const kinds = hasProfile() ? myKinds() : ['pollen'];
  const day = Math.floor(Date.now() / 86400000);
  const tips = [];
  kinds.forEach(k => {
    const list = CAT.tips[k] || [];
    if (list.length) tips.push(list[day % list.length], list[(day + 1) % list.length]);
  });
  const uniq = [...new Set(tips)].slice(0, 4);
  if (!uniq.length) return '';
  return `<h2>Tipps für heute</h2><div class="card">${uniq.map(t => `<div class="list-row"><span>💡</span><span class="grow sub">${esc(t)}</span></div>`).join('')}</div>`;
}

// ---------- Ansicht: Kalender ----------
function viewKalender() {
  const m = state.calMonth;
  const nowM = new Date().getMonth();
  let h = `<h1>Pollenflugkalender</h1><div class="sub">Typischer Verlauf in Deutschland · Fokus ${MONTHS[m]}</div>`;
  h += `<div class="months" id="months" style="margin-top:12px">${MONTHS.map((n, i) =>
    `<button data-month="${i}" class="${i === m ? 'sel' : ''} ${i === nowM ? 'now' : ''}">${n.slice(0, 3)}</button>`).join('')}</div>`;

  const mine = myIds();
  const active = CAT.allergens.filter(a => a.cal[m] > 0).sort((a, b) =>
    (isMine(b.id) - isMine(a.id)) || (b.cal[m] - a.cal[m]));
  const myMax = mine.length ? Math.max(0, ...mine.map(id => BY_ID[id].cal[m])) : -1;

  h += `<div class="card ${myMax >= 3 ? 'warn' : myMax >= 2 ? 'note' : ''}">
    <div class="row between"><h3>${MONTHS[m]}${m === nowM ? ' · aktueller Monat' : ''}</h3>
    ${myMax >= 0 ? `<span class="lvl ${myMax >= 3 ? 'lvl-3' : myMax === 2 ? 'lvl-2' : myMax === 1 ? 'lvl-1' : 'lvl-0'}">Für dich: ${CAT.calLevels[myMax]}</span>` : ''}</div>
    <p class="sub" style="margin-top:6px">${active.length} Allergene typischerweise aktiv${mine.length ? `, davon ${active.filter(a => isMine(a.id)).length} deiner Allergien` : ''}.</p>
    ${m === nowM && state.report ? '<p class="muted">Die tatsächliche Belastung heute siehst du im Tab „Heute“.</p>' : ''}
  </div>`;

  if (active.length) {
    h += `<h2>Aktiv im ${MONTHS[m]}</h2><div class="card">`;
    active.forEach(a => {
      const next = a.cal[(m + 1) % 12];
      const trend = next > a.cal[m] ? '↗ steigt' : next < a.cal[m] ? (next === 0 ? '↘ endet' : '↘ fällt') : '→ gleich';
      h += `<div class="list-row tap" data-allergen="${a.id}">
        <div class="grow"><div>${isMine(a.id) ? '★ ' : ''}${esc(a.name)}</div><div class="muted">${CAT.calLevels[a.cal[m]]} · ${trend}</div></div>
        ${meter(a.cal[m])}</div>`;
    });
    h += `</div>`;
  }

  const upcoming = CAT.allergens.filter(a => a.cal[m] === 0 && a.cal[(m + 1) % 12] > 0);
  if (upcoming.length) {
    h += `<h2>Ab ${MONTHS[(m + 1) % 12]} neu</h2><div class="card">${upcoming.map(a =>
      `<div class="list-row tap" data-allergen="${a.id}"><div class="grow">${isMine(a.id) ? '★ ' : ''}${esc(a.name)}</div>${meter(a.cal[(m + 1) % 12])}</div>`).join('')}</div>`;
  }

  const rows = state.calMine && mine.length ? mine.map(id => BY_ID[id]) : CAT.allergens;
  h += `<div class="row between" style="margin-top:24px"><h2 style="margin:0">Jahresübersicht</h2>
    <div class="seg"><button data-calmine="0" class="${!state.calMine ? 'on' : ''}">Alle</button><button data-calmine="1" class="${state.calMine ? 'on' : ''}">Meine</button></div></div>
    <div class="card" style="margin-top:8px;padding:10px"><table class="heat"><tr><th></th>${MONTHS_SHORT.map((s, i) =>
      `<th class="${i === m ? 'cur' : ''}">${s}</th>`).join('')}</tr>
    ${rows.map(a => `<tr data-allergen="${a.id}"><td class="name">${isMine(a.id) ? '★ ' : ''}${esc(a.name)}</td>${a.cal.map((v, i) =>
      `<td class="c h${v} ${i === m ? 'cur' : ''}"></td>`).join('')}</tr>`).join('')}
    </table>
    <div class="row wrap" style="gap:12px;margin-top:10px">${CAT.calLevels.slice(1).map((n, i) =>
      `<span class="muted"><span class="chip h${i + 1}" style="padding:0 8px;margin-right:4px">&nbsp;</span>${n}</span>`).join('')}</div>
    </div>
    <p class="muted">Kalender zeigt Durchschnittswerte. Je nach Witterung und Region kann sich die Blüte um Wochen verschieben.</p>`;
  return h;
}

// ---------- Ansicht: Medikamente ----------
function medVerdict(med) {
  const p = state.profile;
  const age = p.age != null && p.age !== '' ? Number(p.age) : null;
  const weight = p.weight ? Number(p.weight) : null;
  if (age == null) return { dose: med.dose(18, weight), allowed: null };
  if (med.minAge != null && age < med.minAge) return { dose: null, allowed: false };
  const d = med.dose(age, weight);
  return { dose: d, allowed: d != null };
}

function viewMedis() {
  const p = state.profile;
  const kinds = myKinds();
  const age = p.age != null && p.age !== '' ? Number(p.age) : null;
  let h = `<h1>Antiallergika</h1><div class="sub">${age != null ? `Für dich: ${age} Jahre${p.weight ? ' · ' + p.weight + ' kg' : ''}` : 'Alter im Profil eintragen für passende Dosierungen'}</div>`;
  h += `<div class="card note" style="margin-top:16px"><p class="sub">ℹ Allgemeine Informationen nach Fachinformation, kein Ersatz für ärztlichen oder pharmazeutischen Rat. Packungsbeilage beachten.</p></div>`;
  if (p.pregnant) h += `<div class="card warn"><h3>Schwangerschaft/Stillzeit</h3><p class="sub">Medikamente nur nach Rücksprache. Gut untersuchte Mittel sind markiert (Quelle: Embryotox, Charité).</p></div>`;
  const m = new Date().getMonth();
  if (kinds.includes('pollen') && [8, 9, 10, 11, 0].includes(m)) {
    h += `<div class="card ok"><h3>Guter Zeitpunkt für eine Hyposensibilisierung</h3><p class="sub">Bei Pollenallergie beginnt die Therapie meist im Herbst/Winter, also außerhalb der Saison. Sprich deine Ärztin oder deinen Arzt an.</p></div>`;
  }
  h += `<div class="row" style="margin:16px 0 0"><div class="seg">
      <button data-medsmine="1" class="${state.medsMine ? 'on' : ''}">Passend für mich</button>
      <button data-medsmine="0" class="${!state.medsMine ? 'on' : ''}">Alle</button></div></div>`;

  MED_CATEGORIES.forEach(cat => {
    let meds = MEDS.filter(x => x.cat === cat.id);
    if (state.medsMine && hasProfile()) {
      meds = meds.filter(x => x.for.some(k => kinds.includes(k)) && (!x.asthma || p.asthma || kinds.includes('pollen')));
      meds.sort((a, b) => (medVerdict(b).allowed !== false) - (medVerdict(a).allowed !== false));
    }
    if (!meds.length) return;
    h += `<h2>${cat.name}</h2><p class="muted" style="margin:-4px 0 8px">${cat.hint}</p>`;
    meds.forEach(x => {
      const v = medVerdict(x);
      const badges = [`<span class="chip">${esc(x.rx)}</span>`];
      if (p.pregnant && x.pregnancy === 'preferred') badges.push('<span class="chip" style="color:var(--l1)">✓ Schwangerschaft: gut untersucht</span>');
      if (x.sedation && /müde|deutlich/.test(x.sedation)) badges.push('<span class="chip" style="color:var(--coral)">macht müde</span>');
      h += `<details class="card med"><summary>
        <div class="row between"><div class="grow"><h3>${esc(x.name)}</h3><div class="muted">${esc(x.klass)}</div></div><span class="chev">›</span></div>
        <div class="row wrap" style="margin-top:6px">${badges.join('')}</div>
        ${v.allowed === false ? `<div class="dose no">Nicht für dein Alter/Gewicht zugelassen${x.minAge ? ` (ab ${x.minAge} J.)` : ''}</div>`
          : `<div class="dose">${age != null ? 'Übliche Dosis für dich: ' : 'Erwachsene: '}${esc(v.dose)}</div>`}
      </summary>
      <div class="kv">
        <b>Wirkeintritt</b><span>${esc(x.onset)}</span>
        <b>Wirkdauer</b><span>${esc(x.duration)}</span>
        <b>Müdigkeit</b><span>${esc(x.sedation)}</span>
        <b>Zulassung</b><span>${x.minAge ? 'ab ' + x.minAge + ' Jahren' : 'siehe Packungsbeilage'}</span>
      </div>
      <ul class="notes">${x.notes.map(n => `<li>${esc(n)}</li>`).join('')}
        ${p.kidney && x.kidney ? '<li style="color:var(--coral)">Bei eingeschränkter Nierenfunktion ist eine Dosisanpassung nötig.</li>' : ''}
        ${p.pregnant && x.pregnancy !== 'preferred' ? '<li style="color:var(--coral)">In Schwangerschaft/Stillzeit nur nach ärztlicher Rücksprache.</li>' : ''}
      </ul></details>`;
    });
  });
  if (state.medsMine && !hasProfile()) h += `<p class="muted">Lege im Profil deine Allergien an, um die Liste zu filtern.</p>`;
  return h;
}

// ---------- Ansicht: Profil ----------
function viewProfil() {
  const p = state.profile;
  const bmi = p.weight && p.height ? (p.weight / Math.pow(p.height / 100, 2)).toFixed(1) : null;
  let h = `<h1>Profil</h1><div class="sub">Alles bleibt lokal auf deinem Gerät.</div>`;

  h += `<h2>Persönliche Daten</h2><div class="card">
    <label class="field"><span>Name</span><input type="text" data-field="name" value="${esc(p.name)}" placeholder="Vorname"></label>
    <div class="grid2">
      <label class="field"><span>Alter (Jahre)</span><input type="number" inputmode="numeric" min="0" max="120" data-field="age" data-num="1" value="${p.age ?? ''}"></label>
      <label class="field"><span>Geschlecht</span><select data-field="sex">
        ${[['', '–'], ['w', 'weiblich'], ['m', 'männlich'], ['d', 'divers']].map(([v, n]) => `<option value="${v}" ${p.sex === v ? 'selected' : ''}>${n}</option>`).join('')}
      </select></label>
      <label class="field"><span>Gewicht (kg)</span><input type="number" inputmode="decimal" min="0" max="300" data-field="weight" data-num="1" value="${p.weight ?? ''}"></label>
      <label class="field"><span>Größe (cm)</span><input type="number" inputmode="numeric" min="0" max="250" data-field="height" data-num="1" value="${p.height ?? ''}"></label>
    </div>
    ${bmi ? `<div class="muted" style="margin:-4px 0 8px">BMI ${bmi}</div>` : ''}
    ${toggleRow('asthma', 'Asthma', 'Warnungen eine Stufe früher, Luftqualität wird berücksichtigt')}
    ${p.sex !== 'm' ? toggleRow('pregnant', 'Schwanger oder stillend', 'Markiert gut untersuchte Medikamente') : ''}
    ${toggleRow('kidney', 'Eingeschränkte Nierenfunktion', 'Hinweise zur Dosisanpassung')}
  </div>`;

  h += `<h2>Meine Allergien</h2><p class="muted" style="margin:-4px 0 8px">Empfindlichkeit bestimmt, ab welcher Stufe gewarnt wird.</p>`;
  Object.entries(CAT.groups).forEach(([g, gname]) => {
    const list = CAT.allergens.filter(a => a.group === g);
    if (!list.length) return;
    h += `<div class="card"><div class="muted" style="margin-bottom:2px">${gname}</div>`;
    list.forEach(a => {
      const on = isMine(a.id);
      const sev = on ? p.allergies[a.id].sev : 2;
      h += `<div class="list-row wrap">
        <div class="grow"><div>${esc(a.name)}</div><div class="muted">${a.om || a.dwd ? 'Live-Daten' : 'Kalender & Infos'}${on && (a.om || a.dwd) ? ' · Warnung ab ' + LEVELS[warnLevel(sev)] : ''}</div></div>
        <label class="switch"><input type="checkbox" data-allergy="${a.id}" ${on ? 'checked' : ''}><i></i></label>
        ${on ? `<div style="width:100%"><div class="seg">${[1, 2, 3].map(s => `<button data-sev="${a.id}:${s}" class="${sev === s ? 'on' : ''}">${SEV[s]}</button>`).join('')}</div></div>` : ''}
      </div>`;
    });
    h += `</div>`;
  });

  h += `<h2>Standort</h2><div class="card">
    <div class="seg"><button data-locmode="gps" class="${p.locMode !== 'manual' ? 'on' : ''}">Automatisch (GPS)</button><button data-locmode="manual" class="${p.locMode === 'manual' ? 'on' : ''}">Manuell</button></div>`;
  if (p.locMode === 'manual') {
    h += `<p style="margin-top:12px">${p.manual ? '📍 <b>' + esc(p.manual.name) + '</b>' : '<span class="sub">Noch kein Ort gewählt</span>'}</p>
      <div class="row" style="margin-top:8px"><input type="search" id="placeQuery" placeholder="Ort suchen, z. B. Dortmund"><button class="btn small" data-act="search">Suchen</button></div>
      <div class="place-results">${(state.placeResults || []).map((r, i) =>
        `<div class="list-row" data-place="${i}"><div class="grow">${esc(r.name)}<div class="muted">${esc([r.admin1, r.country].filter(Boolean).join(', '))}</div></div><span class="chev">›</span></div>`).join('')}</div>`;
  } else {
    h += `<p class="muted" style="margin-top:10px">${A.hasLocationPermission() ? '✓ Standortberechtigung erteilt' : 'Beim nächsten Aktualisieren wird die Standortberechtigung abgefragt.'}</p>`;
  }
  h += `<label class="field" style="margin-top:12px"><span>DWD-Pollenregion</span><select data-field="dwdRegion" data-num="1">
      <option value="0">Automatisch (nächstgelegene)</option>
      ${CAT.dwdRegions.map(r => `<option value="${r.id}" ${Number(p.dwdRegion) === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
    </select></label></div>`;

  h += `<h2>Warnungen</h2><div class="card">
    ${toggleRow('notify', 'Pollenwarnungen', 'Prüft ca. alle 3 Stunden (6–22 Uhr) und meldet sich bei kritischer Belastung')}
    ${p.notify && !A.notificationsAllowed() ? `<p class="sub" style="margin-top:8px">Benachrichtigungen sind noch nicht erlaubt.</p><button class="btn primary small" data-act="notifyperm">Erlauben</button>` : ''}
    ${p.notify ? `<div class="row wrap" style="margin-top:10px"><button class="btn small" data-act="testnotify">Testbenachrichtigung</button><button class="btn small" data-act="checknow">Jetzt prüfen</button></div>` : ''}
  </div>`;

  h += `<h2>Über</h2><div class="card"><p class="sub">AllergiePilot ${esc(A.appVersion())}</p>
    <p class="muted">Pollendaten: Deutscher Wetterdienst (Pollenflug-Gefahrenindex, Open Data) und Open-Meteo (Copernicus CAMS). Wetter & Ortssuche: Open-Meteo. Medikamenten-Infos nach Fachinformation, ohne Gewähr.</p></div>`;
  return h;
}

function toggleRow(field, title, sub) {
  return `<div class="list-row"><div class="grow"><div>${title}</div><div class="muted">${sub}</div></div>
    <label class="switch"><input type="checkbox" data-bool="${field}" ${state.profile[field] ? 'checked' : ''}><i></i></label></div>`;
}

// ---------- Detail-Sheet ----------
function openAllergen(id) {
  const a = BY_ID[id];
  if (!a) return;
  const r = liveOf(id);
  const m = new Date().getMonth();
  let h = `<div class="grab"></div><div class="row between"><div><h1 style="margin-top:0">${esc(a.name)}</h1><div class="sub">${esc(a.latin)} · ${CAT.groups[a.group]}</div></div>
    ${r ? lvlChip(todayLevel(id)) : ''}</div>`;
  if (a.tip) h += `<p class="sub" style="margin-top:12px">${esc(a.tip)}</p>`;
  h += `<h2>Saison</h2><table class="heat"><tr>${MONTHS_SHORT.map((s, i) => `<th class="${i === m ? 'cur' : ''}">${s}</th>`).join('')}</tr>
    <tr>${a.cal.map((v, i) => `<td class="c h${v} ${i === m ? 'cur' : ''}"></td>`).join('')}</tr></table>`;
  if (r) {
    const days = state.report.days || [];
    h += `<h2>Messwerte & Prognose</h2><div class="card" style="background:var(--surface-2)">`;
    for (let i = 0; i < 4; i++) {
      const parts = [];
      if (r.omDaily && r.omDaily[i] != null) parts.push(`Ø ${r.omDaily[i]} /m³ (max ${r.omDailyMax[i]})`);
      if (r.dwdRaw && r.dwdRaw[i] != null && r.dwdRaw[i] !== '-1') parts.push(`DWD ${r.dwdRaw[i]}`);
      if (!parts.length && (r.levels[i] == null)) continue;
      h += `<div class="list-row"><div class="grow">${esc(dayLabel(days[i] || '', i))}<div class="muted">${parts.join(' · ') || '–'}</div></div>${lvlChip(r.levels[i])}</div>`;
    }
    h += `</div><p class="muted">DWD-Index 0–3 (keine bis hohe Belastung). Open-Meteo: Tagesmittel 6–20 Uhr in Pollen/m³.</p>`;
  }
  if (a.cross && a.cross.length) {
    h += `<h2>Mögliche Kreuzallergien</h2><div class="row wrap">${a.cross.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>
      <p class="muted" style="margin-top:6px">Nicht jede Person reagiert. Typisch sind Kribbeln oder Schwellung im Mund bei rohen Lebensmitteln.</p>`;
  }
  const tips = CAT.tips[kindOf(a)] || [];
  if (tips.length) h += `<h2>Tipps</h2>${tips.map(t => `<p class="sub">• ${esc(t)}</p>`).join('')}`;
  h += `<p style="margin-top:20px"><button class="btn" data-act="closesheet" style="width:100%">Schließen</button></p>`;
  document.getElementById('sheet-body').innerHTML = h;
  document.getElementById('sheet').classList.remove('hidden');
}
function closeSheet() { document.getElementById('sheet').classList.add('hidden'); }
window.onBack = () => {
  if (!document.getElementById('sheet').classList.contains('hidden')) { closeSheet(); return true; }
  if (state.tab !== 'heute') { setTab('heute'); return true; }
  return false;
};

// ---------- Rendering & Events ----------
function render() {
  const v = document.getElementById('view');
  const views = { heute: viewHeute, kalender: viewKalender, medis: viewMedis, profil: viewProfil };
  const focusId = document.activeElement && document.activeElement.id;
  v.innerHTML = views[state.tab]();
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  if (state.tab === 'kalender') {
    const sel = document.querySelector('#months .sel');
    if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) el.focus();
  }
}
function setTab(t) {
  state.tab = t;
  render();
  window.scrollTo(0, 0);
  if (t === 'heute' && hasProfile() && !state.report) refresh();
}

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tab],[data-act],[data-allergen],[data-month],[data-calmine],[data-medsmine],[data-sev],[data-locmode],[data-place]');
  if (!t) {
    if (e.target.id === 'sheet') closeSheet();
    return;
  }
  const d = t.dataset;
  if (d.tab) return setTab(d.tab);
  if (d.month != null) { state.calMonth = Number(d.month); return render(); }
  if (d.calmine != null) { state.calMine = d.calmine === '1'; return render(); }
  if (d.medsmine != null) { state.medsMine = d.medsmine === '1'; return render(); }
  if (d.allergen) return openAllergen(d.allergen);
  if (d.sev) {
    const [id, s] = d.sev.split(':');
    state.profile.allergies[id].sev = Number(s);
    saveProfile();
    return render();
  }
  if (d.locmode) {
    state.profile.locMode = d.locmode;
    saveProfile();
    render();
    if (d.locmode === 'gps') refresh();
    return;
  }
  if (d.place != null) {
    const r = state.placeResults[Number(d.place)];
    state.profile.manual = { name: r.name, lat: r.latitude, lon: r.longitude };
    state.placeResults = null;
    saveProfile();
    toast(r.name + ' gespeichert');
    render();
    refresh();
    return;
  }
  switch (d.act) {
    case 'refresh': return refresh();
    case 'closesheet': return closeSheet();
    case 'search': return searchPlace();
    case 'notifyperm': return A.requestNotificationPermission();
    case 'testnotify':
      if (!A.notificationsAllowed()) { A.requestNotificationPermission(); return; }
      A.testNotification();
      return toast('Testbenachrichtigung gesendet');
    case 'checknow':
      A.runBackgroundCheckNow();
      return toast('Prüfung läuft – bei kritischer Belastung kommt eine Benachrichtigung');
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  const p = state.profile;
  if (t.dataset.allergy) {
    if (t.checked) p.allergies[t.dataset.allergy] = { sev: 2 };
    else delete p.allergies[t.dataset.allergy];
    saveProfile();
    render();
    return;
  }
  if (t.dataset.bool) {
    p[t.dataset.bool] = t.checked;
    saveProfile();
    if (t.dataset.bool === 'notify' && t.checked && !A.notificationsAllowed()) A.requestNotificationPermission();
    render();
    return;
  }
  if (t.dataset.field) {
    const f = t.dataset.field;
    const val = t.dataset.num ? (t.value === '' ? null : Number(t.value)) : t.value;
    const regionChanged = f === 'dwdRegion' && val !== p.dwdRegion;
    p[f] = val;
    saveProfile();
    render();
    if (regionChanged && state.report) refresh();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'placeQuery') searchPlace();
});

async function searchPlace() {
  const q = (document.getElementById('placeQuery') || {}).value;
  if (!q || q.trim().length < 2) return toast('Bitte mindestens 2 Zeichen eingeben');
  try {
    state.placeResults = JSON.parse(await call('searchPlace', q.trim()));
    if (!state.placeResults.length) toast('Kein Ort gefunden');
  } catch (err) {
    toast('Suche fehlgeschlagen: ' + err.message);
  }
  render();
  const input = document.getElementById('placeQuery');
  if (input) input.value = q;
}

window.onNotifyPermission = () => render();

// ---------- Start ----------
if (!hasProfile()) state.tab = 'profil';
render();
if (hasProfile() && (!state.report || Date.now() - state.report.fetchedAt > 30 * 60 * 1000)) refresh();
