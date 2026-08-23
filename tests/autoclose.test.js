'use strict';

// Osakilpailun automaattinen sulkeminen: Metrix kertoo milloin kisa on ohi,
// sivusto siirtää sen tuloksiin ja nostaa seuraavan kisan esiin ilman käsityötä.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadSite, railwayResults, metrixLive,
  KANTOLA, IITTALA, KANTOLA_FIELD, IITTALA_FIELD
} = require('./support');

const PLAYED = ['Talma', 'Nummelanharju', 'Meilahti', 'Röyläntupa x2', 'Nummenmäki', 'Ford SIN'];

const kantolaOhi = () => railwayResults(KANTOLA_FIELD, 7.2);
const iittalaOhi = () => railwayResults(IITTALA_FIELD, 11.4);

test('kesken oleva kilpailu pysyy esillä kun Metrix ei ilmoita sitä valmiiksi', async () => {
  const site = loadSite({ results: { [KANTOLA]: railwayResults([], null, false) } });
  await site.run('fetchAllCompetitionResults()');

  assert.deepEqual(site.compNames(), PLAYED);
  assert.equal(site.current().name, 'Kantola');
});

test('kilpailu ei sulkeudu kesken kierroksen vaikka Metrix ilmoittaisi sen valmiiksi', async () => {
  // Varmistus sen varalta että WeeklyHC ilmestyy ennen kuin kaikki ovat maalissa:
  // 3/14 tulosta ei riitä sulkemiseen (AUTOCLOSE_MIN_PLAYED_RATIO).
  const kesken = KANTOLA_FIELD.map(([n, r, t], i) => [n, r, i < 3 ? t : null]);
  const site = loadSite({ results: { [KANTOLA]: railwayResults(kesken, 7.2) } });
  await site.run('fetchAllCompetitionResults()');

  assert.equal(site.current().name, 'Kantola', 'kisan pitää yhä olla esillä');
  assert.ok(!site.compNames().includes('Kantola'), 'kisa ei saa vielä olla tuloksissa');
});

test('valmis kilpailu siirtyy tuloksiin ja seuraava nousee esiin', async () => {
  const site = loadSite({ results: { [KANTOLA]: kantolaOhi() } });
  await site.run('fetchAllCompetitionResults()');

  assert.deepEqual(site.compNames(), [...PLAYED, 'Kantola'], 'päivämääräjärjestyksessä viimeisenä');
  assert.equal(site.comp(KANTOLA).state, 'over');
  assert.equal(site.current().name, 'Iittala');
});

test('Metrixin laskema crv korvaa data.js:n käsin syötetyn arvion', async () => {
  const site = loadSite({ results: { [KANTOLA]: kantolaOhi() } });
  assert.equal(site.comp(KANTOLA).courseRatingValue, 7.09, 'lähtöarvo data.js:stä');

  await site.run('fetchAllCompetitionResults()');
  assert.equal(site.comp(KANTOLA).courseRatingValue, 7.2);
});

test('kilpailu sulkeutuu käsin syötetyllä crv:llä kun Metrix ei laske handicapeja', async () => {
  // Metrix palauttaa WeeklyHC:n ratingeineen mutta HC-kentät tyhjinä, jolloin
  // backend ei saa laskettua crv:tä (näin kävi Kantolassa 2026).
  const site = loadSite({ results: { [KANTOLA]: railwayResults(KANTOLA_FIELD, null) } });
  await site.run('fetchAllCompetitionResults()');

  assert.ok(site.compNames().includes('Kantola'), 'kisa ei saa jäädä auki');
  assert.equal(site.comp(KANTOLA).courseRatingValue, 7.09, 'käsin syötetty arvo säilyy');

  // HC-tulokset lasketaan arviolla: Tomi S, 83 heittoa, rating 768
  const tomi = site.get(`COMPETITIONS.find(c => c.id === ${KANTOLA})`)
    .results.find(r => r.name === 'Tomi S');
  assert.ok(Math.abs(tomi.hc - (1000 - tomi.rating) / 7.09) < 0.01);
});

test('kilpailu jää auki jos crv:tä ei ole mistään saatavilla', async () => {
  const site = loadSite({ results: { [KANTOLA]: railwayResults(KANTOLA_FIELD, null) } });
  site.get(`COMPETITIONS.find(c => c.id === ${KANTOLA}).courseRatingValue = null`);
  await site.run('fetchAllCompetitionResults()');

  assert.ok(!site.compNames().includes('Kantola'), 'ilman crv:tä ei voi laskea tuloksia');
  assert.equal(site.current().name, 'Kantola');
});

test('kilpailut sulkeutuvat toisistaan riippumatta', async () => {
  // Iittala ehtii maaliin ensin, Kantola on yhä kesken.
  const kesken = KANTOLA_FIELD.map(([n, r, t], i) => [n, r, i < 2 ? t : null]);
  const site = loadSite({
    results: { [KANTOLA]: railwayResults(kesken, 7.09), [IITTALA]: iittalaOhi() }
  });
  await site.run('fetchAllCompetitionResults()');

  assert.deepEqual(site.compNames(), [...PLAYED, 'Iittala']);
  assert.equal(site.current().name, 'Kantola', 'kesken oleva pysyy esillä');
});

test('päättynyttä kilpailua ei avata uudelleen', async () => {
  // Ford SIN on data.js:ssä 'over'. Vaikka backend vastaisi "ei valmis",
  // sitä ei saa palauttaa käynnissä olevaksi.
  const site = loadSite({ results: { 3683940: railwayResults([], null, false) } });
  await site.run('fetchAllCompetitionResults()');

  assert.ok(site.compNames().includes('Ford SIN'));
  assert.equal(site.current().name, 'Kantola');
});

test('backendin ollessa alhaalla tila pysyy data.js:n mukaisena', async () => {
  const site = loadSite();   // yksikään haku ei onnistu
  await site.run('fetchAllCompetitionResults()');

  assert.deepEqual(site.compNames(), PLAYED);
  assert.equal(site.current().name, 'Kantola');
  assert.equal(site.comp(KANTOLA).courseRatingValue, 7.09, 'arvio säilyy');
});

test('kauden viimeisen kisan jälkeen näytetään kausi päättyneeksi', async () => {
  const site = loadSite({ results: { [KANTOLA]: kantolaOhi(), [IITTALA]: iittalaOhi() } });
  await site.run('fetchAllCompetitionResults()');

  assert.equal(site.current(), null, 'ei enää näytettävää kilpailua');
  assert.equal(site.get('overComps.length'), site.get('TOTAL_EVENTS'));

  site.get('renderCurrentComp()');
  assert.match(site.card(), /Kausi päättynyt/);
  assert.match(site.card(), /8 \/ 8 osakilpailua pelattu/);
});

test('kesken oleva kisa merkitään käynnissä olevaksi heti kun tuloksia ilmestyy', async () => {
  // Kantola kiinni → Iittala esiin. data.js:ssä se on 'next', mutta Metrixissä
  // on jo tuloksia, joten kortin pitää näyttää se käynnissä olevana.
  const site = loadSite({
    results: { [KANTOLA]: kantolaOhi() },
    metrix: { [IITTALA]: metrixLive([['Tomi S', 71], ['Jukka Vesa', 58]]) }
  });
  await site.run('fetchAllCompetitionResults()');
  await site.run('fetchCurrentCompLiveResults()');

  assert.equal(site.current().name, 'Iittala');
  assert.equal(site.current().state, 'next', 'data.js:n tilaa ei muuteta');
  assert.match(site.card(), /Käynnissä/);
});

test('ilman tuloksia seuraava kisa näkyy tulossa olevana', async () => {
  const site = loadSite({
    results: { [KANTOLA]: kantolaOhi() },
    metrix: { [IITTALA]: metrixLive([['Tomi S', 0], ['Jukka Vesa', 0]]) }
  });
  await site.run('fetchAllCompetitionResults()');
  await site.run('fetchCurrentCompLiveResults()');

  assert.match(site.card(), /Seuraava osakilpailu/);
  assert.doesNotMatch(site.card(), /Käynnissä/);
});
