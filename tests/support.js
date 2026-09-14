'use strict';

// Testituki: lataa data.js + app.js omaan VM-kontekstiinsa, jossa DOM ja fetch
// on korvattu tyngillä. Verkkoon ei mennä koskaan — kaikki vastaukset tulevat
// testin antamasta mock-määrittelystä.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function makeEl() {
  return {
    _html: '', textContent: '', dataset: {},
    classList: { add() {}, remove() {} },
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    addEventListener() {}, appendChild() {}
  };
}

// Railwayn /results-vastaus. rivit: [nimi, rating, heitot] — heitot null = DNF.
function railwayResults(rows, crv, completed = true) {
  return {
    completed, crv,
    players: rows.map(([name, rating, throws]) => ({
      name, rating: rating ?? null,
      throws: throws ?? null,
      dnf: throws == null
    }))
  };
}

// Metrixin live-vastaus. rivit: [nimi, summa, dnf] — summa 0 = ei vielä tulosta.
// weekly: [nimi, rating] — Metrix lisää rivin heti kun pelaajan kierros on kirjattu.
function metrixLive(rows, weekly = []) {
  return {
    Competition: {
      Results: rows.map(([Name, Sum, DNF = null]) => ({
        Name, Sum: String(Sum), DNF, PlayerResults: []
      })),
      WeeklyHC: weekly.map(([Name, Rating]) => ({ Name, Rating, HC: null }))
    }
  };
}

// Synteettiset testikilpailut: elävä COMPETITIONS-taulukko muuttuu aina kun
// osakilpailu suljetaan, uusi lisätään tai kausi vaihtuu, joten testit eivät voi
// nojata siihen mitä data.js:ssä sattuu juuri nyt olemaan. loadSite() korvaa
// KOKO COMPETITIONS-taulukon näillä neljällä: kaksi päättynyttä, yksi käynnissä
// ja yksi tulossa. Arkistotestit käyttävät COMPETITIONS_2026:ta, joka on
// jäädytettyä historiaa eikä muutu kausien mukana.
const TEST_ACTIVE = 9000001;
const TEST_NEXT = 9000002;
const TEST_OVER_1 = 9000010;
const TEST_OVER_2 = 9000011;

const TEST_ACTIVE_FIELD = [
  ['Jukka Vesa', 933, 72], ['Antti Karjakin', 861, 79], ['Erno Ekebom', 846, 84],
  ['Joonas Korpilaakso', 816, 86], ['Markus Kotiranta', 799, 89], ['Tomi S', 764, 92],
  ['Tuomas Kotiranta', 738, 95], ['Viljami Julkunen', 739, 96], ['JB Poupon', 755, 94],
  ['Petteri Stedt', 677, 101], ['Kari Tauriainen', 699, 99], ['Petri Haukka', 738, 97],
  ['Wili Vuorinen', 645, 104], ['Jukka Autio', null, 88]
];

const TEST_NEXT_FIELD = TEST_ACTIVE_FIELD.filter(([n]) => n !== 'Jukka Autio')
  .map(([n, r, t]) => [n, r, t - 20]);

// Päättynyt testikisa: tulokset lasketaan kentästä, jotta ratingien
// fallback-ketju (metrixData -> overComps.results -> PLAYER_RATINGS) on testattavissa.
function makeTestOverComp(id, name, date, crv, field) {
  return {
    state: 'over',
    id, name, fullName: `Testikausi – ${name}`,
    date, course: `${name} DiscGolfPark`, location: 'Testila',
    par: 60, holes: 18, courseRatingValue: crv,
    url: `https://discgolfmetrix.com/${id}`,
    results: field.map(([n, r, t]) => {
      if (r === null) return { name: n, rating: 0, throws: t, hc: 0, hcScore: t };
      const hc = (1000 - r) / crv;
      return { name: n, rating: r, throws: t, hc, hcScore: t - hc };
    })
  };
}

function makeTestComp(id, name, date, crv, registered) {
  return {
    state: name === 'Testikisa A' ? 'active' : 'next',
    id, name, fullName: `Testikausi – ${name}`,
    date, course: `${name} DiscGolfPark`, location: 'Testila',
    par: 60, holes: 18, courseRatingValue: crv,
    url: `https://discgolfmetrix.com/${id}`,
    registered
  };
}

/**
 * Rakentaa sivuston testikontekstin.
 * mocks = {
 *   results:    { [compId]: railwayResults(...) },   // Railway /api/competition/:id/results
 *   metrix:     { [compId]: metrixLive(...) },       // discgolfmetrix.com/api.php
 *   registered: { [compId]: ['nimi', ...] },         // Railway /api/competition/:id
 *   today:      'YYYY-MM-DD'                         // "tämä päivä" sulkemislogiikalle
 * }
 * today oletuksena 2026-08-15, eli ennen testikisojen päivämääriä: kisat ovat
 * kesken ellei testi toisin määrää.
 * Kilpailu jota ei ole mockattu → haku epäonnistuu (= backend alhaalla).
 */
function loadSite(mocks = {}) {
  const { results = {}, metrix = {}, registered = {}, today = '2026-08-15' } = mocks;

  const calls = [];
  const fetchStub = async (url) => {
    const u = String(url);
    calls.push(u);
    const id = (u.match(/(\d{6,})/) || [])[1];
    const hit = (table) => Object.prototype.hasOwnProperty.call(table, id);

    if (u.includes('discgolfmetrix.com/api.php')) {
      return hit(metrix)
        ? { ok: true, json: async () => metrix[id] }
        : { ok: true, json: async () => metrixLive([]) };
    }
    if (/\/results$/.test(u)) {
      return hit(results) ? { ok: true, json: async () => results[id] } : { ok: false };
    }
    return hit(registered)
      ? { ok: true, json: async () => ({ registered: registered[id] }) }
      : { ok: false };
  };

  const document = {
    _els: {},
    getElementById(id) { return this._els[id] || (this._els[id] = makeEl()); },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    addEventListener() {},
    body: makeEl(), documentElement: makeEl()
  };

  const ctx = {
    console, document, fetch: fetchStub,
    window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
    IntersectionObserver: function () { this.observe = () => {}; this.unobserve = () => {}; },
    Intl, Date, JSON, Math, parseInt, parseFloat, isNaN
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8'), ctx, { filename: 'js/data.js' });

  // Korvaa KOKO COMPETITIONS synteettisellä testikaudella, jotta testit eivät
  // riipu siitä mitä kilpailuja data.js:ssä sillä hetkellä on.
  const comps = [
    makeTestOverComp(TEST_OVER_1, 'Testikausi 1', '2026-06-01', 9.5, TEST_ACTIVE_FIELD),
    makeTestOverComp(TEST_OVER_2, 'Testikausi 2', '2026-07-01', 10.5, TEST_NEXT_FIELD),
    makeTestComp(TEST_ACTIVE, 'Testikisa A', '2026-09-01', 7.09,
      TEST_ACTIVE_FIELD.map(([n]) => n)),
    makeTestComp(TEST_NEXT, 'Testikisa B', '2026-09-02', 11,
      TEST_NEXT_FIELD.map(([n]) => n))
  ];
  vm.runInContext(
    `(() => {
      COMPETITIONS.length = 0;
      COMPETITIONS.push(...${JSON.stringify(comps)});
    })();`,
    ctx
  );

  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'), ctx, { filename: 'js/app.js' });
  // Kiinteä päivä: sulkemislogiikka ei saa riippua siitä milloin testit ajetaan.
  vm.runInContext(`todayISO = () => ${JSON.stringify(today)};`, ctx);

  // overComps/currentComp ovat let-sidoksia → näkyvät vain runInContextin kautta.
  const get = (expr) => vm.runInContext(expr, ctx);

  return {
    get,
    calls,
    run: (expr) => Promise.resolve(vm.runInContext(expr, ctx)),
    // Array.from → taulukko tähän realmiin, muuten deepEqual kaatuu prototyyppieroon
    compNames: () => Array.from(get('overComps.map(c => c.name)')),
    current: () => get('currentComp'),
    card: () => document.getElementById('next-event-container').innerHTML,
    comp: (id) => get(`COMPETITIONS.find(c => c.id === ${id})`)
  };
}

module.exports = {
  loadSite, railwayResults, metrixLive,
  TEST_ACTIVE, TEST_NEXT, TEST_OVER_1, TEST_OVER_2, TEST_ACTIVE_FIELD, TEST_NEXT_FIELD
};
