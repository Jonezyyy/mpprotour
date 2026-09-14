'use strict';

// Kuuma kierros: pelaaja pelaa radalla paremmin kuin rating ennustaa.
// Säännöt: CLAUDE.md, osio "Hot rounds" (kynnys +40 pyöristettynä, ratingittomat ja
// DNF:t eivät koskaan, merkki nimen perässä, arkistossa jäädytetyt arvot).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadSite, railwayResults, metrixLive, TEST_ACTIVE, TEST_ACTIVE_FIELD
} = require('./support');

// Sibben Blue-layout 14.9.2026 (Metrixin ratinglinja)
const SIBBE = { courseId: 46940, layout1000Result: 55.24, ratingPerThrow: 9.812038014783525 };

test('kierroksen rating ja pisteet ratingin yli lasketaan radan ratinglinjasta', () => {
  const site = loadSite();
  // Viljami Julkunen, Sibbe: 78 heittoa, rating 749 → kierrosrating 777, +28 (ei kuuma)
  const info = site.get(`roundRatingInfo(78, 749, ${JSON.stringify(SIBBE)})`);

  assert.equal(Math.round(info.roundRating), 777);
  assert.equal(Math.round(info.pointsAbove), 28);
  assert.equal(info.hot, false);
});

test('kierrosta ei arvioida ilman radan ratinglinjaa, ratingia tai tulosta', () => {
  const site = loadSite();
  const info = (throws, rating, layout) =>
    site.get(`roundRatingInfo(${throws}, ${rating}, ${JSON.stringify(layout)})`);

  assert.equal(info(78, 749, null), null, 'rata ilman Metrix-ratingia');
  assert.equal(info(78, 0, SIBBE), null, 'pelaaja ilman ratingia (scratch)');
  assert.equal(info(78, null, SIBBE), null, 'rating puuttuu');
  assert.equal(info(null, 749, SIBBE), null, 'DNF: ei tulosta');
  assert.equal(info(0, 749, SIBBE), null, 'ei heittoja');
});

test('kuuma kierros ratkaistaan pyöristetyistä pisteistä, kynnys +40', () => {
  const site = loadSite();
  // Rata: 1000-ratingin pelaaja heittää 60.06, heitto = 10 pistettä → 80 heittoa = kierrosrating 800.6
  const layout = { courseId: 1, layout1000Result: 60.06, ratingPerThrow: 10 };
  const hot = (rating) => site.get(`roundRatingInfo(80, ${rating}, ${JSON.stringify(layout)})`).hot;

  assert.equal(hot(760), true, '+40.6 → kuuma');
  assert.equal(hot(761), true, '+39.6 näkyy +40:nä → kuuma');
  assert.equal(hot(762), false, '+38.6 näkyy +39:nä → ei kuuma');
});

// --- Live-kortti ---

// Pyöreä testirata: 1000-ratingin pelaaja heittää 60, heitto = 10 pistettä.
const ROUND_LAYOUT = { courseId: 2, layout1000Result: 60, ratingPerThrow: 10 };
// Kisa kesken (kolme pelannut) → pysyy auki ja näkyy live-korttina.
const openWithLayout = (layout) => railwayResults(
  TEST_ACTIVE_FIELD.map(([n, r, t], i) => [n, r, i < 3 ? t : null]), null, true, layout);

async function liveCard(metrixRows, weekly, layout = ROUND_LAYOUT) {
  const site = loadSite({
    results: { [TEST_ACTIVE]: openWithLayout(layout) },
    metrix: { [TEST_ACTIVE]: metrixLive(metrixRows, weekly) }
  });
  await site.run('fetchAllCompetitionResults()');
  await site.run('fetchCurrentCompLiveResults()');
  return site.card();
}

test('live-kortti merkitsee kuuman kierroksen liekillä ja pisteillä ratingin yli', async () => {
  // Tomi S 79 heittoa, rating 764 → kierrosrating 810, +46. Jukka Vesa 82 → 780, ei kuuma.
  const card = await liveCard(
    [['Tomi S', 79], ['Jukka Vesa', 82]],
    [['Tomi S', 764], ['Jukka Vesa', 933]]
  );

  assert.match(card, /🔥 \+46/);
  assert.match(card, /Kierrosrating 810 \(rating 764\)/);
  assert.equal((card.match(/🔥/g) || []).length, 1, 'vain kuuma kierros merkitään');
});

test('live-kortti ei merkitse kierrosta ilman kierroksen omaa ratingia tai radan ratinglinjaa', async () => {
  // Tomi S heittää 79 (olisi +46), mutta Metrix ei anna hänelle kierroksen ratingia:
  // aiemmista kisoista tunnettu rating ei kelpaa vertailukohdaksi.
  const noRoundRating = await liveCard([['Tomi S', 79]], []);
  assert.doesNotMatch(noRoundRating, /🔥/, 'ei kierroksen ratingia');

  // Sama kierros radalla, jolla ei ole Metrix-ratinglinjaa.
  const noLayout = await liveCard([['Tomi S', 79]], [['Tomi S', 764]], null);
  assert.doesNotMatch(noLayout, /🔥/, 'ei radan ratinglinjaa');
  assert.match(noLayout, /Tomi S/, 'kierros näkyy silti kortilla');
});

// --- Päättyneiden kisojen tulostaulukot ---

test('kauden aikana päättyneen kisan tulostaulukko merkitsee kuuman kierroksen', async () => {
  // Molemmat pelanneet → kisa sulkeutuu. Tomi S 79 (+46, kuuma), Jukka Vesa 82 (ei).
  const site = loadSite({
    results: { [TEST_ACTIVE]: railwayResults([['Tomi S', 764, 79], ['Jukka Vesa', 933, 82]], null, true, ROUND_LAYOUT) }
  });
  await site.run('fetchAllCompetitionResults()');
  assert.ok(site.compNames().includes('Testikisa A'), 'kisa on päättynyt');

  const table = site.get(`buildResultsTable(COMPETITIONS.find(c => c.id === ${TEST_ACTIVE}))`);
  assert.match(table, /🔥 \+46/);
  assert.match(table, /Kierrosrating 810 \(rating 764\)/);
  assert.equal((table.match(/🔥/g) || []).length, 1, 'vain kuuma kierros merkitään');
});

// --- Arkisto (jäädytetyt arvot) ---

test('arkisto näyttää kuuman kierroksen jäädytetyistä arvoista, ei ilman niitä', () => {
  const site = loadSite();
  // Kauden vaihdossa jäädytetyt rivit: roundRating ja pointsAbove tallessa.
  const frozen = {
    id: 9000099, name: 'Arkistokisa', date: '2027-05-01', location: 'Testila', course: 'Testirata',
    par: 60, holes: 18, courseRatingValue: 10, url: 'https://discgolfmetrix.com/9000099',
    results: [
      { name: 'Tomi S', rating: 764, throws: 79, hc: 23.6, hcScore: 55.4, roundRating: 810, pointsAbove: 46 },
      { name: 'Jukka Vesa', rating: 933, throws: 82, hc: 6.7, hcScore: 75.3, roundRating: 780, pointsAbove: -153 }
    ]
  };
  site.get(`renderArchiveCompetitions('arkisto-testi', [${JSON.stringify(frozen)}], { showPoints: true })`);
  const html = site.get(`document.getElementById('arkisto-testi').innerHTML`);
  assert.match(html, /🔥 \+46/);
  assert.match(html, /Kierrosrating 810 \(rating 764\)/);
  assert.equal((html.match(/🔥/g) || []).length, 1, 'vain kuuma kierros merkitään');

  // Kauden 2026 arkistorivit eivät sisällä jäädytettyjä arvoja → ei merkkejä.
  site.get(`renderArchiveCompetitions('arkisto-2026', COMPETITIONS_2026, { showPoints: true })`);
  assert.doesNotMatch(site.get(`document.getElementById('arkisto-2026').innerHTML`), /🔥/);
});

test('kausitilanne ei näytä kuumia kierroksia', async () => {
  // Kisa päättyy Tomi S:n kuumalla kierroksella (+46); kausitilanteessa ei silti merkkiä.
  const site = loadSite({
    results: { [TEST_ACTIVE]: railwayResults([['Tomi S', 764, 79], ['Jukka Vesa', 933, 82]], null, true, ROUND_LAYOUT) }
  });
  await site.run('fetchAllCompetitionResults()');
  assert.match(site.get(`buildResultsTable(COMPETITIONS.find(c => c.id === ${TEST_ACTIVE}))`), /🔥/,
    'lähtötilanne: kisan tuloksissa kuuma kierros');

  site.get('renderStandings()');
  const standings = site.get(`document.getElementById('standings-container').innerHTML`);
  assert.match(standings, /Tomi S/);
  assert.doesNotMatch(standings, /🔥/);
});
