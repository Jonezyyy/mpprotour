'use strict';

// Arkistokaudet: jäädytetyn datan pitää tuottaa samat sijoitukset kuin
// live-sivusto tuotti, eikä historia saa muuttua myöhempien muokkausten myötä.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSite } = require('./support');

const site = loadSite();
const comps2026 = () => site.get('JSON.parse(JSON.stringify(COMPETITIONS_2026))');
const comps2025 = () => site.get('JSON.parse(JSON.stringify(COMPETITIONS_2025))');

test('kausi 2026 on arkistoitu kokonaisuudessaan', () => {
  const comps = comps2026();
  assert.equal(comps.length, 8);
  assert.equal(comps.length, site.get('TOTAL_EVENTS'));
  for (const c of comps) {
    assert.ok(c.results.length > 0, `${c.name}: ei tuloksia`);
    assert.ok(c.courseRatingValue > 0, `${c.name}: crv puuttuu`);
    assert.ok(c.url && c.date && c.location, `${c.name}: metatiedot puutteelliset`);
  }
});

test('jäädytetty hcScore vastaa heittoja ja ratingia — ei pyöristyshävikkiä', () => {
  // hcScore = heitot - (1000 - rating) / crv. Jos arvo tallennetaan liian
  // karkeasti, Math.round voi siirtyä .5-rajan yli ja sijoitus muuttuu.
  for (const c of comps2026()) {
    for (const r of c.results) {
      if (r.hcScore === null || r.rating === 0) continue;
      const odotettu = r.throws - (1000 - r.rating) / c.courseRatingValue;
      assert.ok(
        Math.abs(r.hcScore - odotettu) < 1e-9,
        `${c.name} / ${r.name}: hcScore ${r.hcScore} ≠ ${odotettu}`
      );
      assert.equal(Math.round(r.hcScore), Math.round(odotettu), `${c.name} / ${r.name}: sija muuttuisi`);
    }
  }
});

test('kauden 2026 loppusijoitukset on lyöty lukkoon', () => {
  const standings = site.get('JSON.parse(JSON.stringify(buildStandings(COMPETITIONS_2026)))');
  assert.deepEqual(
    standings.slice(0, 3).map(p => `${p.name} ${p.total}`),
    ['Tomi S 639', 'Tuomas Kotiranta 605', 'Joonas Korpilaakso 528']
  );
  assert.equal(standings.length, 16);
});

test('kausi 2025 säilyttää oman pistejärjestelmänsä sijoitukset', () => {
  const comps = comps2025();
  assert.equal(comps.length, 8);
  // Loviisa 21: sijoitus seuraa heittoja, ei HC-tulosta — sitä ei saa laskea uudelleen
  const loviisa = comps.find(c => c.name === 'Loviisa 21');
  const kolmas = loviisa.results.find(r => r.name === 'Antti Karjakin');
  assert.equal(kolmas.place, 3);
  assert.ok(kolmas.hcScore > loviisa.results.find(r => r.name === 'Markus Kotiranta').hcScore,
    'HC-tuloksesta laskettuna sija olisi eri — siksi tallennettua sijaa käytetään');
});

test('arkistorenderöijät eivät tee mitään ilman konttia', () => {
  // Etusivulla näitä kontteja ei ole; kutsun pitää olla vaaraton.
  assert.doesNotThrow(() => {
    site.get("renderStandings2026Archive('ei-olemassa')");
    site.get("renderArchiveCompetitions('ei-olemassa', COMPETITIONS_2026, { showPoints: true })");
    site.get("renderArchiveCompetitions('ei-olemassa', [], {})");
  });
});
