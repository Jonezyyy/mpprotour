'use strict';

// Radan CRV haetaan automaattisesti Metrixin ratinglinjasta (backendin `layout`).
// data.js:n käsin syötetty courseRatingValue on vain varalla.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadSite, railwayResults, metrixLive, TEST_ACTIVE, TEST_ACTIVE_FIELD
} = require('./support');

const LAYOUT = { courseId: 46940, layout1000Result: 55.24, ratingPerThrow: 9 };
const HAND_CRV = 7.09; // Testikisa A:n käsin syötetty arvo (support.js)
const TOMI = 764;      // Tomi S:n rating testikentässä

// Kolme ensimmäistä pelannut → kisa pysyy auki.
const kesken = (crv, layout) => railwayResults(
  TEST_ACTIVE_FIELD.map(([n, r, t], i) => [n, r, i < 3 ? t : null]), crv, true, layout);
const liveHc = (site, name) =>
  site.get(`liveResultsByComp[${TEST_ACTIVE}][${JSON.stringify(name)}].hcScore`);
const closedRow = (site, name) =>
  site.get(`COMPETITIONS.find(c => c.id === ${TEST_ACTIVE})`).results.find(r => r.name === name);

test('live-handicapit lasketaan Metrixin radan CRV:llä eikä käsin syötetyllä', async () => {
  const site = loadSite({
    results: { [TEST_ACTIVE]: kesken(null, LAYOUT) },
    metrix: { [TEST_ACTIVE]: metrixLive([['Tomi S', 80]], [['Tomi S', TOMI]]) }
  });
  await site.run('fetchAllCompetitionResults()');
  await site.run('fetchCurrentCompLiveResults()');

  assert.equal(site.current().name, 'Testikisa A', 'kisa on yhä auki');
  assert.equal(site.get(`courseCrv(COMPETITIONS.find(c => c.id === ${TEST_ACTIVE}))`), 9);
  assert.ok(Math.abs(liveHc(site, 'Tomi S') - (80 - (1000 - TOMI) / 9)) < 0.01);
});

test('ilman radan ratinglinjaa käytetään data.js:n käsin syötettyä CRV:tä', async () => {
  const site = loadSite({
    results: { [TEST_ACTIVE]: kesken(null, null) },
    metrix: { [TEST_ACTIVE]: metrixLive([['Tomi S', 80]], [['Tomi S', TOMI]]) }
  });
  await site.run('fetchAllCompetitionResults()');
  await site.run('fetchCurrentCompLiveResults()');

  assert.ok(Math.abs(liveHc(site, 'Tomi S') - (80 - (1000 - TOMI) / HAND_CRV)) < 0.01);
});

test('backendin ollessa alhaalla live-handicapit lasketaan käsin syötetyllä CRV:llä', async () => {
  const site = loadSite({ metrix: { [TEST_ACTIVE]: metrixLive([['Tomi S', 80]], [['Tomi S', TOMI]]) } });
  await site.run('fetchAllCompetitionResults()');
  await site.run('fetchCurrentCompLiveResults()');

  assert.ok(Math.abs(liveHc(site, 'Tomi S') - (80 - (1000 - TOMI) / HAND_CRV)) < 0.01);
});

test('sulkeutuessa Metrixin handicapeista laskettu CRV voittaa radan CRV:n', async () => {
  const site = loadSite({ results: { [TEST_ACTIVE]: railwayResults(TEST_ACTIVE_FIELD, 7.2, true, LAYOUT) } });
  await site.run('fetchAllCompetitionResults()');

  assert.ok(Math.abs(closedRow(site, 'Tomi S').hc - (1000 - TOMI) / 7.2) < 1e-9);
});

test('sulkeutuessa ilman handicapeja käytetään radan CRV:tä ennen käsin syötettyä', async () => {
  // Kantola 2026 -tapaus: WeeklyHC:n HC-kentät tyhjiä → backendin crv on null.
  const site = loadSite({ results: { [TEST_ACTIVE]: railwayResults(TEST_ACTIVE_FIELD, null, true, LAYOUT) } });
  await site.run('fetchAllCompetitionResults()');

  assert.ok(site.compNames().includes('Testikisa A'), 'kisa sulkeutuu');
  assert.ok(Math.abs(closedRow(site, 'Tomi S').hc - (1000 - TOMI) / 9) < 1e-9);
});
