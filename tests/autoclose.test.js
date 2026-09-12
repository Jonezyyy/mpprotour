'use strict';

// Osakilpailun automaattinen sulkeminen: Metrix kertoo milloin kisa on ohi,
// sivusto siirtää sen tuloksiin ja nostaa seuraavan kisan esiin ilman käsityötä.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadSite, railwayResults, metrixLive,
  TEST_ACTIVE, TEST_NEXT, TEST_OVER_2, TEST_ACTIVE_FIELD, TEST_NEXT_FIELD
} = require('./support');

// loadSite() korvaa KOKO COMPETITIONS-taulukon synteettisellä testikaudella
// (ks. support.js): kaksi päättynyttä, yksi käynnissä, yksi tulossa.
const PLAYED = ['Testikausi 1', 'Testikausi 2'];

const activeOhi = () => railwayResults(TEST_ACTIVE_FIELD, 7.2);
const nextOhi = () => railwayResults(TEST_NEXT_FIELD, 11.4);

test('kesken oleva kilpailu pysyy esillä kun Metrix ei ilmoita sitä valmiiksi', async () => {
  const site = loadSite({ results: { [TEST_ACTIVE]: railwayResults([], null, false) } });
  await site.run('fetchAllCompetitionResults()');

  assert.deepEqual(site.compNames(), PLAYED);
  assert.equal(site.current().name, 'Testikisa A');
});

test('kilpailu ei sulkeudu kesken kierroksen vaikka Metrix ilmoittaisi sen valmiiksi', async () => {
  // Varmistus sen varalta että WeeklyHC ilmestyy ennen kuin kaikki ovat maalissa:
  // 3/14 tulosta ei riitä sulkemiseen (AUTOCLOSE_MIN_PLAYED_RATIO).
  const kesken = TEST_ACTIVE_FIELD.map(([n, r, t], i) => [n, r, i < 3 ? t : null]);
  const site = loadSite({ results: { [TEST_ACTIVE]: railwayResults(kesken, 7.2) } });
  await site.run('fetchAllCompetitionResults()');

  assert.equal(site.current().name, 'Testikisa A', 'kisan pitää yhä olla esillä');
  assert.ok(!site.compNames().includes('Testikisa A'), 'kisa ei saa vielä olla tuloksissa');
});

test('valmis kilpailu siirtyy tuloksiin ja seuraava nousee esiin', async () => {
  const site = loadSite({ results: { [TEST_ACTIVE]: activeOhi() } });
  await site.run('fetchAllCompetitionResults()');

  assert.deepEqual(site.compNames(), [...PLAYED, 'Testikisa A'], 'päivämääräjärjestyksessä viimeisenä');
  assert.equal(site.comp(TEST_ACTIVE).state, 'over');
  assert.equal(site.current().name, 'Testikisa B');
});

test('Metrixin laskema crv korvaa data.js:n käsin syötetyn arvion', async () => {
  const site = loadSite({ results: { [TEST_ACTIVE]: activeOhi() } });
  assert.equal(site.comp(TEST_ACTIVE).courseRatingValue, 7.09, 'lähtöarvo data.js:stä');

  await site.run('fetchAllCompetitionResults()');
  assert.equal(site.comp(TEST_ACTIVE).courseRatingValue, 7.2);
});

test('kilpailu sulkeutuu käsin syötetyllä crv:llä kun Metrix ei laske handicapeja', async () => {
  // Metrix palauttaa WeeklyHC:n ratingeineen mutta HC-kentät tyhjinä, jolloin
  // backend ei saa laskettua crv:tä (näin kävi Kantolassa 2026).
  const site = loadSite({ results: { [TEST_ACTIVE]: railwayResults(TEST_ACTIVE_FIELD, null) } });
  await site.run('fetchAllCompetitionResults()');

  assert.ok(site.compNames().includes('Testikisa A'), 'kisa ei saa jäädä auki');
  assert.equal(site.comp(TEST_ACTIVE).courseRatingValue, 7.09, 'käsin syötetty arvo säilyy');

  // HC-tulokset lasketaan arviolla: Tomi S, 92 heittoa, rating 764
  const tomi = site.get(`COMPETITIONS.find(c => c.id === ${TEST_ACTIVE})`)
    .results.find(r => r.name === 'Tomi S');
  assert.ok(Math.abs(tomi.hc - (1000 - tomi.rating) / 7.09) < 0.01);
});

test('kilpailu jää auki jos crv:tä ei ole mistään saatavilla', async () => {
  const site = loadSite({ results: { [TEST_ACTIVE]: railwayResults(TEST_ACTIVE_FIELD, null) } });
  site.get(`COMPETITIONS.find(c => c.id === ${TEST_ACTIVE}).courseRatingValue = null`);
  await site.run('fetchAllCompetitionResults()');

  assert.ok(!site.compNames().includes('Testikisa A'), 'ilman crv:tä ei voi laskea tuloksia');
  assert.equal(site.current().name, 'Testikisa A');
});

test('kilpailut sulkeutuvat toisistaan riippumatta', async () => {
  // Testikisa B ehtii maaliin ensin, Testikisa A on yhä kesken.
  const kesken = TEST_ACTIVE_FIELD.map(([n, r, t], i) => [n, r, i < 2 ? t : null]);
  const site = loadSite({
    results: { [TEST_ACTIVE]: railwayResults(kesken, 7.09), [TEST_NEXT]: nextOhi() }
  });
  await site.run('fetchAllCompetitionResults()');

  assert.deepEqual(site.compNames(), [...PLAYED, 'Testikisa B']);
  assert.equal(site.current().name, 'Testikisa A', 'kesken oleva pysyy esillä');
});

test('päättynyttä kilpailua ei avata uudelleen', async () => {
  // Testikausi 2 on jo 'over'. Vaikka backend vastaisi "ei valmis",
  // sitä ei saa palauttaa käynnissä olevaksi.
  const site = loadSite({ results: { [TEST_OVER_2]: railwayResults([], null, false) } });
  await site.run('fetchAllCompetitionResults()');

  assert.ok(site.compNames().includes('Testikausi 2'));
  assert.equal(site.current().name, 'Testikisa A');
});

test('backendin ollessa alhaalla tila pysyy data.js:n mukaisena', async () => {
  const site = loadSite();   // yksikään haku ei onnistu
  await site.run('fetchAllCompetitionResults()');

  assert.deepEqual(site.compNames(), PLAYED);
  assert.equal(site.current().name, 'Testikisa A');
  assert.equal(site.comp(TEST_ACTIVE).courseRatingValue, 7.09, 'arvio säilyy');
});

test('kauden viimeisen kisan jälkeen näytetään kausi päättyneeksi', async () => {
  const site = loadSite({ results: { [TEST_ACTIVE]: activeOhi(), [TEST_NEXT]: nextOhi() } });
  await site.run('fetchAllCompetitionResults()');

  assert.equal(site.current(), null, 'ei enää näytettävää kilpailua');
  // Kaikki (2 aiemmin päättynyttä + 2 juuri sulkeutunutta) ovat nyt overComps:ssa.
  assert.equal(site.get('overComps.length'), PLAYED.length + 2);

  site.get('renderCurrentComp()');
  assert.match(site.card(), /Kausi päättynyt/);
});

test('kesken oleva kisa merkitään käynnissä olevaksi heti kun tuloksia ilmestyy', async () => {
  // Testikisa A kiinni → Testikisa B esiin. data.js:ssä se on 'next', mutta
  // Metrixissä on jo tuloksia, joten kortin pitää näyttää se käynnissä olevana.
  const site = loadSite({
    results: { [TEST_ACTIVE]: activeOhi() },
    metrix: { [TEST_NEXT]: metrixLive([['Tomi S', 71], ['Jukka Vesa', 58]]) }
  });
  await site.run('fetchAllCompetitionResults()');
  await site.run('fetchCurrentCompLiveResults()');

  assert.equal(site.current().name, 'Testikisa B');
  assert.equal(site.current().state, 'next', 'data.js:n tilaa ei muuteta');
  assert.match(site.card(), /Käynnissä/);
});

test('ilman tuloksia seuraava kisa näkyy tulossa olevana', async () => {
  const site = loadSite({
    results: { [TEST_ACTIVE]: activeOhi() },
    metrix: { [TEST_NEXT]: metrixLive([['Tomi S', 0], ['Jukka Vesa', 0]]) }
  });
  await site.run('fetchAllCompetitionResults()');
  await site.run('fetchCurrentCompLiveResults()');

  assert.match(site.card(), /Seuraava osakilpailu/);
  assert.doesNotMatch(site.card(), /Käynnissä/);
});
