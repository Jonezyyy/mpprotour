'use strict';

// Kuuma kierros: pelaaja pelaa radalla paremmin kuin rating ennustaa.
// Säännöt: CLAUDE.md, osio "Hot rounds" (rating-porrastettu kynnys pyöristettynä,
// ratingittomat ja DNF:t eivät koskaan, merkki nimen perässä, arkistossa jäädytetyt arvot).

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

test('kuuma kierros ratkaistaan pyöristetyistä pisteistä, kynnys ratingin mukaan', () => {
  const site = loadSite();
  // Rata: 1000-ratingin pelaaja heittää 60.06, heitto = 10 pistettä → 80 heittoa = kierrosrating 800.6
  const layout = { courseId: 1, layout1000Result: 60.06, ratingPerThrow: 10 };
  const hot = (rating) => site.get(`roundRatingInfo(80, ${rating}, ${JSON.stringify(layout)})`).hot;

  // Ratingit 700-799: kynnys +50.
  assert.equal(hot(750), true, '+50.6 → kuuma');
  assert.equal(hot(751), true, '+49.6 näkyy +50:nä → kuuma');
  assert.equal(hot(752), false, '+48.6 näkyy +49:nä → ei kuuma');
});

test('kuuman kierroksen kynnys porrastuu ratingin mukaan: 900+:30, 800-899:40, 700-799:50, 0-699:60', () => {
  const site = loadSite();
  // Rata: 1000-ratingin pelaaja heittää 60, heitto = 10 pistettä.
  const layout = { courseId: 1, layout1000Result: 60, ratingPerThrow: 10 };
  const hot = (throws, rating) => site.get(`roundRatingInfo(${throws}, ${rating}, ${JSON.stringify(layout)})`).hot;

  // 900+: kynnys +30. rating 920, kierrosrating 950 → +30 (kuuma), kierrosrating 940 → +20 (ei).
  assert.equal(hot(65, 920), true, '900+ kynnys +30: +30 → kuuma');
  assert.equal(hot(66, 920), false, '900+ kynnys +30: +20 → ei kuuma');

  // 800-899: kynnys +40. rating 850, kierrosrating 890 → +40 (kuuma), kierrosrating 870 → +20 (ei).
  assert.equal(hot(71, 850), true, '800-899 kynnys +40: +40 → kuuma');
  assert.equal(hot(73, 850), false, '800-899 kynnys +40: +20 → ei kuuma');

  // 0-699: kynnys +60. rating 650, kierrosrating 710 → +60 (kuuma), kierrosrating 690 → +40 (ei).
  assert.equal(hot(89, 650), true, '0-699 kynnys +60: +60 → kuuma');
  assert.equal(hot(91, 650), false, '0-699 kynnys +60: +40 → ei kuuma');

  // Kynnys rajalla: sama kierrosrating 930, kaksi ratingia eri puolin 900-rajaa.
  // Rating 900 kuuluu tasoon 900+ (kynnys +30): +30 → kuuma.
  // Rating 899 kuuluu tasoon 800-899 (kynnys +40): +31 < +40 → ei kuuma.
  assert.equal(hot(67, 900), true, 'rating 900 kuuluu tasoon 900+ (+30 → kuuma)');
  assert.equal(hot(67, 899), false, 'rating 899 kuuluu tasoon 800-899 (+31 < +40 → ei kuuma)');
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
  // Tomi S 78 heittoa, rating 764 (tasoa 700-799, kynnys +50) → kierrosrating 820, +56.
  // Jukka Vesa 82 → 780, ei kuuma.
  const card = await liveCard(
    [['Tomi S', 78], ['Jukka Vesa', 82]],
    [['Tomi S', 764], ['Jukka Vesa', 933]]
  );

  assert.match(card, /🔥 \+56/);
  assert.match(card, /Kierrosrating 820 \(rating 764\)/);
  assert.equal((card.match(/🔥/g) || []).length, 1, 'vain kuuma kierros merkitään');
});

test('live-kortti ei merkitse kierrosta ilman kierroksen omaa ratingia tai radan ratinglinjaa', async () => {
  // Tomi S heittää 78 (olisi +56), mutta Metrix ei anna hänelle kierroksen ratingia:
  // aiemmista kisoista tunnettu rating ei kelpaa vertailukohdaksi.
  const noRoundRating = await liveCard([['Tomi S', 78]], []);
  assert.doesNotMatch(noRoundRating, /🔥/, 'ei kierroksen ratingia');

  // Sama kierros radalla, jolla ei ole Metrix-ratinglinjaa.
  const noLayout = await liveCard([['Tomi S', 78]], [['Tomi S', 764]], null);
  assert.doesNotMatch(noLayout, /🔥/, 'ei radan ratinglinjaa');
  assert.match(noLayout, /Tomi S/, 'kierros näkyy silti kortilla');
});

// --- Päättyneiden kisojen tulostaulukot ---

test('kauden aikana päättyneen kisan tulostaulukko merkitsee kuuman kierroksen', async () => {
  // Molemmat pelanneet → kisa sulkeutuu. Tomi S 78 (+56, kuuma), Jukka Vesa 82 (ei).
  const site = loadSite({
    results: { [TEST_ACTIVE]: railwayResults([['Tomi S', 764, 78], ['Jukka Vesa', 933, 82]], null, true, ROUND_LAYOUT) }
  });
  await site.run('fetchAllCompetitionResults()');
  assert.ok(site.compNames().includes('Testikisa A'), 'kisa on päättynyt');

  const table = site.get(`buildResultsTable(COMPETITIONS.find(c => c.id === ${TEST_ACTIVE}))`);
  assert.match(table, /🔥 \+56/);
  assert.match(table, /Kierrosrating 820 \(rating 764\)/);
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
      { name: 'Tomi S', rating: 764, throws: 78, hc: 23.6, hcScore: 55.4, roundRating: 820, pointsAbove: 56 },
      { name: 'Jukka Vesa', rating: 933, throws: 82, hc: 6.7, hcScore: 75.3, roundRating: 780, pointsAbove: -153 }
    ]
  };
  site.get(`renderArchiveCompetitions('arkisto-testi', [${JSON.stringify(frozen)}], { showPoints: true })`);
  const html = site.get(`document.getElementById('arkisto-testi').innerHTML`);
  assert.match(html, /🔥 \+56/);
  assert.match(html, /Kierrosrating 820 \(rating 764\)/);
  assert.equal((html.match(/🔥/g) || []).length, 1, 'vain kuuma kierros merkitään');

  // Kauden 2026 arkistorivit eivät sisällä jäädytettyjä arvoja → ei merkkejä.
  site.get(`renderArchiveCompetitions('arkisto-2026', COMPETITIONS_2026, { showPoints: true })`);
  assert.doesNotMatch(site.get(`document.getElementById('arkisto-2026').innerHTML`), /🔥/);
});

test('kausitilanne ei näytä kuumia kierroksia', async () => {
  // Kisa päättyy Tomi S:n kuumalla kierroksella (+56); kausitilanteessa ei silti merkkiä.
  const site = loadSite({
    results: { [TEST_ACTIVE]: railwayResults([['Tomi S', 764, 78], ['Jukka Vesa', 933, 82]], null, true, ROUND_LAYOUT) }
  });
  await site.run('fetchAllCompetitionResults()');
  assert.match(site.get(`buildResultsTable(COMPETITIONS.find(c => c.id === ${TEST_ACTIVE}))`), /🔥/,
    'lähtötilanne: kisan tuloksissa kuuma kierros');

  site.get('renderStandings()');
  const standings = site.get(`document.getElementById('standings-container').innerHTML`);
  assert.match(standings, /Tomi S/);
  assert.doesNotMatch(standings, /🔥/);
});
