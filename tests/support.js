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
function metrixLive(rows) {
  return {
    Competition: {
      Results: rows.map(([Name, Sum, DNF = null]) => ({
        Name, Sum: String(Sum), DNF, PlayerResults: []
      })),
      WeeklyHC: []
    }
  };
}

/**
 * Rakentaa sivuston testikontekstin.
 * mocks = {
 *   results:    { [compId]: railwayResults(...) },   // Railway /api/competition/:id/results
 *   metrix:     { [compId]: metrixLive(...) },       // discgolfmetrix.com/api.php
 *   registered: { [compId]: ['nimi', ...] }          // Railway /api/competition/:id
 * }
 * Kilpailu jota ei ole mockattu → haku epäonnistuu (= backend alhaalla).
 */
function loadSite(mocks = {}) {
  const { results = {}, metrix = {}, registered = {} } = mocks;

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

  for (const file of ['js/data.js', 'js/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  }

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

// Kauden 2026 kaksi viimeistä osakilpailua
const KANTOLA = 3743534;
const IITTALA = 3743540;

const KANTOLA_FIELD = [
  ['Jukka Vesa', 933, 72], ['Antti Karjakin', 861, 79], ['Erno Ekebom', 846, 84],
  ['Joonas Korpilaakso', 816, 86], ['Markus Kotiranta', 799, 89], ['Tomi S', 764, 92],
  ['Tuomas Kotiranta', 738, 95], ['Viljami Julkunen', 739, 96], ['JB Poupon', 755, 94],
  ['Petteri Stedt', 677, 101], ['Kari Tauriainen', 699, 99], ['Petri Haukka', 738, 97],
  ['Wili Vuorinen', 645, 104], ['Jukka Autio', null, 88]
];

const IITTALA_FIELD = KANTOLA_FIELD.filter(([n]) => n !== 'Jukka Autio')
  .map(([n, r, t]) => [n, r, t - 20]);

module.exports = {
  loadSite, railwayResults, metrixLive,
  KANTOLA, IITTALA, KANTOLA_FIELD, IITTALA_FIELD
};
