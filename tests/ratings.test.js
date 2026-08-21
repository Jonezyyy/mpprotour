'use strict';

// Ratingin määräytyminen: viimeisin kilpailu ratkaisee, PLAYER_RATINGS on vain
// varalla, ja ilman ratingia pelataan scratchina.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadSite, railwayResults, metrixLive,
  KANTOLA, IITTALA, KANTOLA_FIELD, IITTALA_FIELD
} = require('./support');

const rating = (site, name) => site.get(`getPlayerRating(${JSON.stringify(name)})`);
const known  = (site, name) => site.get(`lookupPlayerRating(${JSON.stringify(name)})`);

test('rating tulee viimeisimmästä kilpailusta, ei PLAYER_RATINGS-taulukosta', async () => {
  // Kantola sulkeutuu ja antaa Tomi S:lle uuden ratingin 771.
  const kentta = KANTOLA_FIELD.map(([n, r, t]) => n === 'Tomi S' ? [n, 771, t] : [n, r, t]);
  const site = loadSite({ results: { [KANTOLA]: railwayResults(kentta, 7.2) } });

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

  const crv = site.comp(KANTOLA).courseRatingValue;
  assert.equal((1000 - rating(site, 'Tuntematon Pelaaja')) / crv, 0, 'handicap on nolla');
});

test('PLAYER_RATINGS antaa ratingin myös pelaajalle jolla ei ole tulosta yhdestäkään kisasta', async () => {
  // Jukka Autiolla on Metrix-rating, muttei tulosta yhdessäkään tourin kisassa.
  // Käsin syötetyn arvon pitää silti tuottaa oikea handicap.
  const site = loadSite();
  assert.equal(known(site, 'Jukka Autio'), 662, 'ei saa pudota scratchiin');

  const crv = site.comp(KANTOLA).courseRatingValue;
  assert.ok((1000 - rating(site, 'Jukka Autio')) / crv > 0, 'handicap on suurempi kuin nolla');

  site.get('renderCurrentComp()');
  assert.match(site.card(), /Rating 662/);
  assert.doesNotMatch(site.card(), /Ei ratingia/, 'kentässä ei ole ratingittomia');
});

test('kortti kertoo ratingittomasta pelaajasta suoraan', async () => {
  // Riippumaton nykyisestä pelaajaluettelosta: viedään yhdeltä pelaajalta rating pois.
  const site = loadSite();
  site.get("delete PLAYER_RATINGS['Jukka Autio']");
  site.get('renderCurrentComp()');

  assert.match(site.card(), /Jukka Autio/);
  assert.match(site.card(), /Ei ratingia/);
  assert.doesNotMatch(site.card(), /Rating 1000/, 'ei saa näyttää keksityltä ratingilta');
});

test('live-tulokset lasketaan kunkin kilpailun omalla crv:llä', async () => {
  // Sama pelaaja, sama heittomäärä, kaksi eri rataa: HC-tuloksen pitää erota,
  // koska Kantolan crv on 7.09 ja Iittalan 11.
  const heitot = 70;
  const nimi = 'Tomi S';

  const kantola = loadSite({ metrix: { [KANTOLA]: metrixLive([[nimi, heitot]]) } });
  await kantola.run('fetchCurrentCompLiveResults()');
  const hcKantola = kantola.get(`liveResultsByComp[${KANTOLA}][${JSON.stringify(nimi)}].hcScore`);

  const iittala = loadSite({
    results: { [KANTOLA]: railwayResults(KANTOLA_FIELD, 7.2) },
    metrix: { [IITTALA]: metrixLive([[nimi, heitot]]) }
  });
  await iittala.run('fetchAllCompetitionResults()');
  await iittala.run('fetchCurrentCompLiveResults()');
  const hcIittala = iittala.get(`liveResultsByComp[${IITTALA}][${JSON.stringify(nimi)}].hcScore`);

  assert.notEqual(hcKantola, hcIittala, 'radan crv:n pitää vaikuttaa');
  assert.ok(hcKantola < hcIittala, 'matalampi crv → suurempi HC → pienempi HC-tulos');
});

test('yhden kisan live-tulokset eivät vuoda toiseen kisaan', async () => {
  const site = loadSite({
    results: { [KANTOLA]: railwayResults(KANTOLA_FIELD, 7.2) },
    metrix: { [IITTALA]: metrixLive([['Tomi S', 71]]) }
  });
  await site.run('fetchAllCompetitionResults()');
  await site.run('fetchCurrentCompLiveResults()');

  const avaimet = Array.from(site.get('Object.keys(liveResultsByComp)'));
  assert.deepEqual(avaimet, [String(IITTALA)], 'vain esillä olevan kisan tulokset');
});

test('Metrixin DNF-merkintä ilman tulosta tulkitaan keskeytykseksi', async () => {
  const site = loadSite({ metrix: { [KANTOLA]: metrixLive([['Tomi S', 0, '1']]) } });
  await site.run('fetchCurrentCompLiveResults()');

  const rivi = site.get(`liveResultsByComp[${KANTOLA}]['Tomi S']`);
  assert.equal(rivi.dnf, true);
  assert.equal(rivi.throws, null);
  assert.equal(rivi.hcScore, null);
  assert.match(site.card(), /DNF/);
});

test('DNF-merkintä ei kumoa kelvollista tulosta', async () => {
  // Metrix merkitsee toisinaan DNF:n vaikka heitot on kirjattu — tulos ratkaisee.
  const site = loadSite({ metrix: { [KANTOLA]: metrixLive([['Tomi S', 92, '1']]) } });
  await site.run('fetchCurrentCompLiveResults()');

  const rivi = site.get(`liveResultsByComp[${KANTOLA}]['Tomi S']`);
  assert.equal(rivi.dnf, false, 'kirjattu tulos voittaa DNF-lipun');
  assert.equal(rivi.throws, 92);
  assert.ok(rivi.hcScore > 0, 'HC-tulos lasketaan normaalisti');
});
