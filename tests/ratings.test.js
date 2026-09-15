'use strict';

// Ratingin määräytyminen: viimeisin kilpailu ratkaisee, PLAYER_RATINGS on vain
// varalla, ja ilman ratingia pelataan scratchina.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadSite, railwayResults, metrixLive,
  TEST_ACTIVE, TEST_NEXT, TEST_ACTIVE_FIELD, TEST_NEXT_FIELD
} = require('./support');

const rating = (site, name) => site.get(`getPlayerRating(${JSON.stringify(name)})`);
const known  = (site, name) => site.get(`lookupPlayerRating(${JSON.stringify(name)})`);

test('käynnissä olevan kisan Metrix-rating voittaa päättyneiden kisojen ratingin', async () => {
  // Metrix lisää WeeklyHC:hen ratingin heti kun kierros on kirjattu (Sibbe 2026:
  // Viljami 749, kun viimeisin päättynyt kisa ja taulukko sanoivat 739).
  const site = loadSite({
    metrix: { [TEST_ACTIVE]: metrixLive([['Viljami Julkunen', 78]], [['Viljami Julkunen', 749]]) }
  });
  assert.equal(rating(site, 'Viljami Julkunen'), 739, 'lähtötilanne: vanha rating');

  await site.run('fetchCurrentCompLiveResults()');
  assert.equal(rating(site, 'Viljami Julkunen'), 749);

  const live = site.get(`liveResultsByComp[${TEST_ACTIVE}]['Viljami Julkunen']`);
  assert.ok(Math.abs(live.hcScore - (78 - (1000 - 749) / 7.09)) < 0.01, 'HC lasketaan tuoreella ratingilla');
  assert.match(site.card(), /class="next-player-rating">749</);
});

test('Metrixin rating 0 ei ylikirjoita tunnettua ratingia', async () => {
  const site = loadSite({
    metrix: { [TEST_ACTIVE]: metrixLive([['Tomi S', 80]], [['Tomi S', 0]]) }
  });
  await site.run('fetchCurrentCompLiveResults()');
  assert.equal(rating(site, 'Tomi S'), 764);
});

test('rating tulee viimeisimmästä kilpailusta, ei PLAYER_RATINGS-taulukosta', async () => {
  // Testikisa A sulkeutuu ja antaa Tomi S:lle uuden ratingin 771.
  const kentta = TEST_ACTIVE_FIELD.map(([n, r, t]) => n === 'Tomi S' ? [n, 771, t] : [n, r, t]);
  const site = loadSite({ results: { [TEST_ACTIVE]: railwayResults(kentta, 7.2) } });

  assert.equal(site.get("PLAYER_RATINGS['Tomi S']"), 764, 'taulukossa vanha arvo');
  await site.run('fetchAllCompetitionResults()');
  assert.equal(rating(site, 'Tomi S'), 771, 'viimeisin kisa voittaa');
});

test('PLAYER_RATINGS kelpaa kun pelaajalta ei löydy tulosta mistään kisasta', async () => {
  const site = loadSite();   // backend alhaalla, käytössä data.js:n varadata
  // Otto Syvähuoko on taulukossa; hän ei ole mukana uusissa kisoissa.
  assert.equal(site.get("PLAYER_RATINGS['Otto Syvähuoko']"), 843);
  assert.equal(rating(site, 'Otto Syvähuoko'), 843);
});

test('tuntematon pelaaja pelaa scratchina eikä saa keksittyä ratingia', async () => {
  const site = loadSite();
  assert.equal(known(site, 'Tuntematon Pelaaja'), null, 'ratingia ei ole');
  assert.equal(rating(site, 'Tuntematon Pelaaja'), 1000, 'scratch → HC 0');

  const crv = site.comp(TEST_ACTIVE).courseRatingValue;
  assert.equal((1000 - rating(site, 'Tuntematon Pelaaja')) / crv, 0, 'handicap on nolla');
});

test('PLAYER_RATINGS antaa ratingin myös pelaajalle jolla ei ole tulosta yhdestäkään kisasta', async () => {
  // Jukka Autiolla on Metrix-rating, muttei tulosta yhdessäkään tourin kisassa.
  // Käsin syötetyn arvon pitää silti tuottaa oikea handicap.
  const site = loadSite();
  assert.equal(known(site, 'Jukka Autio'), 662, 'ei saa pudota scratchiin');

  const crv = site.comp(TEST_ACTIVE).courseRatingValue;
  assert.ok((1000 - rating(site, 'Jukka Autio')) / crv > 0, 'handicap on suurempi kuin nolla');

  site.get('renderCurrentComp()');
  assert.match(site.card(), /class="next-player-rating">662</);
  assert.doesNotMatch(site.card(), /Ei ratingia/, 'kentässä ei ole ratingittomia');
});

test('kortti kertoo ratingittomasta pelaajasta suoraan', async () => {
  // Keksitty pelaaja jolla ei ole rating-tietoa mistään lähteestä (ei
  // PLAYER_RATINGS:sta eikä yhdenkään päättyneen kisan tuloksista).
  const site = loadSite();
  const nimi = 'Testaaja Ilman Ratingia';
  site.get(`COMPETITIONS.find(c => c.id === ${TEST_ACTIVE}).registered.push(${JSON.stringify(nimi)})`);
  site.get('renderCurrentComp()');

  assert.match(site.card(), new RegExp(nimi));
  assert.match(site.card(), /Ei ratingia/);
  assert.doesNotMatch(site.card(), /Rating 1000/, 'ei saa näyttää keksityltä ratingilta');
});

test('live-tulokset lasketaan kunkin kilpailun omalla crv:llä', async () => {
  // Sama pelaaja, sama heittomäärä, kaksi eri rataa: HC-tuloksen pitää erota,
  // koska Testikisa A:n crv on 7.09 ja Testikisa B:n 11.
  const heitot = 70;
  const nimi = 'Tomi S';

  const active = loadSite({ metrix: { [TEST_ACTIVE]: metrixLive([[nimi, heitot]]) } });
  await active.run('fetchCurrentCompLiveResults()');
  const hcActive = active.get(`liveResultsByComp[${TEST_ACTIVE}][${JSON.stringify(nimi)}].hcScore`);

  const next = loadSite({
    results: { [TEST_ACTIVE]: railwayResults(TEST_ACTIVE_FIELD, 7.2) },
    metrix: { [TEST_NEXT]: metrixLive([[nimi, heitot]]) }
  });
  await next.run('fetchAllCompetitionResults()');
  await next.run('fetchCurrentCompLiveResults()');
  const hcNext = next.get(`liveResultsByComp[${TEST_NEXT}][${JSON.stringify(nimi)}].hcScore`);

  assert.notEqual(hcActive, hcNext, 'radan crv:n pitää vaikuttaa');
  assert.ok(hcActive < hcNext, 'matalampi crv → suurempi HC → pienempi HC-tulos');
});

test('yhden kisan live-tulokset eivät vuoda toiseen kisaan', async () => {
  const site = loadSite({
    results: { [TEST_ACTIVE]: railwayResults(TEST_ACTIVE_FIELD, 7.2) },
    metrix: { [TEST_NEXT]: metrixLive([['Tomi S', 71]]) }
  });
  await site.run('fetchAllCompetitionResults()');
  await site.run('fetchCurrentCompLiveResults()');

  const avaimet = Array.from(site.get('Object.keys(liveResultsByComp)'));
  assert.deepEqual(avaimet, [String(TEST_NEXT)], 'vain esillä olevan kisan tulokset');
});

test('Metrixin DNF-merkintä ilman tulosta tulkitaan keskeytykseksi', async () => {
  const site = loadSite({ metrix: { [TEST_ACTIVE]: metrixLive([['Tomi S', 0, '1']]) } });
  await site.run('fetchCurrentCompLiveResults()');

  const rivi = site.get(`liveResultsByComp[${TEST_ACTIVE}]['Tomi S']`);
  assert.equal(rivi.dnf, true);
  assert.equal(rivi.throws, null);
  assert.equal(rivi.hcScore, null);
  assert.match(site.card(), /DNF/);
});

test('DNF-merkintä ei kumoa kelvollista tulosta', async () => {
  // Metrix merkitsee toisinaan DNF:n vaikka heitot on kirjattu — tulos ratkaisee.
  const site = loadSite({ metrix: { [TEST_ACTIVE]: metrixLive([['Tomi S', 92, '1']]) } });
  await site.run('fetchCurrentCompLiveResults()');

  const rivi = site.get(`liveResultsByComp[${TEST_ACTIVE}]['Tomi S']`);
  assert.equal(rivi.dnf, false, 'kirjattu tulos voittaa DNF-lipun');
  assert.equal(rivi.throws, 92);
  assert.ok(rivi.hcScore > 0, 'HC-tulos lasketaan normaalisti');
});
