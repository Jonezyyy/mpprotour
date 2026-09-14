# Copilot-ohjeet – Miesperhe Pro Tour

Tämä on Miesperhe Pro Tour -kiertueen verkkosivusto (mpprotour.fi).
Vastaa aina **suomeksi**, ellei käyttäjä pyydä toisin.

Sama sisältö englanniksi ja tarkemmin: [CLAUDE.md](../CLAUDE.md). Jos ohjeet
ovat ristiriidassa, päivitä molemmat.

## Projektin yleiskuvaus

- **Frontend**: staattinen sivusto, ei build-työkaluja eikä frameworkeja — vanilla HTML/CSS/JS,
  globaalit funktiot `<script>`-tageissa. [index.html](../index.html) = nykyinen kausi,
  [2026.html](../2026.html) ja [2025.html](../2025.html) = arkistot. Kaikki kolme sivua lataavat
  samat `css/style.css`-, `js/data.js`- ja `js/app.js`-tiedostot.
- **Backend**: [backend/server.js](../backend/server.js) on Express-proxy Disc Golf Metrix
  APIlle, ajossa Railwayssa (`https://mpprotour-production.up.railway.app`), 5 min cache.
- **Data**: [js/data.js](../js/data.js)
  - `COMPETITIONS` — vain nykyisen kauden kilpailut
  - `COMPETITIONS_2026` — kauden 2026 jäädytetyt lopputulokset (arkiston totuuslähde)
  - `STANDINGS_2025_FINAL` + `COMPETITIONS_2025` — kaudella 2025 oli eri pistejärjestelmä:
    tallennetut sijoitukset ovat oikeat, kisakohtaisia pisteitä ei näytetä
  - `PLAYER_RATINGS` — vain varalla (ks. Ratingit), `POINTS_TABLE`, `TOTAL_EVENTS`
- **Logiikka**: [js/app.js](../js/app.js) renderöi kausitilanteen, osakilpailut ja live-tulokset.
- **Julkaisu**: push `main`-haaraan julkaisee sivuston GitHub Pagesiin 1–3 minuutissa **ja** käynnistää
  backendin uudelleenjulkaisun Railwayssa (juuri `/backend`). Backendin muutosten pitää toimia myös
  sivuston edellisen version kanssa julkaisun ajan. Pages julkaisee kaikki versionhallinnan
  tiedostot pistekansioita lukuun ottamatta — älä committaa salaisuuksia.

## Ydinkaavat — ÄLÄ MUUTA ilman omistajan lupaa

```js
// HC-tulos
hc      = (1000 - rating) / crv
hcScore = throws - hc

// Sijoitus kilpailussa (pyöristetty HC)
place = results.filter(r => Math.round(r.hcScore) < Math.round(hcScore)).length + 1

// Kausipisteet — tasatilanteessa jaettujen sijojen pisteet jaetaan tasan
POINTS_TABLE = [100, 90, 82, 74, 67, 60, 54, 48, 42, 36, 30, 24, 18, 12, 6]
// Sija 16+ = 0 pistettä. Kaikki osakilpailut lasketaan, huonointa ei pudoteta.

// Live-kortti, ei vielä pelannut pelaaja
parHC        = Math.round(par + (1000 - rating) / crv)
throwsNeeded = Math.ceil(bestHC + (1000 - rating) / crv) - 1   // "Score to beat"
```

- `crv` = `courseCrv(comp)`: radan Metrix-ratinglinja, data.js:n `courseRatingValue` varalla (ks. Radan CRV)
- Pelaaja ilman ratingia pelaa scratchina: rating 1000, HC 0, näytetään "Ei ratingia".

## Voittajan haku — KRIITTINEN

Hae sijoitukset ja voittaja **aina** `calcRoundedResults(comp)`-funktiolla.
**ÄLÄ** käytä `comp.results[0]` tai `comp.results.find(r => r.place === 1)`:
Railwaysta haetuissa tuloksissa ei ole `place`-kenttää.

```js
const winner = calcRoundedResults(comp).find(r => r.place === 1);
```

## Kilpailun tila — sivusto hoitaa sulkemisen itse

`state` data.js:ssä on vain lähtötilanne; sivusto muuttaa sitä ajon aikana.

- **Näytettävä kilpailu** = päivämäärältään vanhin ei-päättynyt. Se näkyy "Käynnissä",
  jos tila on `'active'` tai Metrixissä on jo tuloksia.
- **Sulkeminen** (`isReadyToClose` app.js:ssä): kilpailu suljetaan kun kaikilla
  ilmoittautuneilla on tulos **tai** kilpailun `date` on ohi. Päättynyttä ei avata uudelleen.
- Backendin `completed: true` **ei** tarkoita että kisa on ohi: Metrix lisää WeeklyHC-rivin
  jokaiselle pelaajalle heti kun hänen kierroksensa on kirjattu. Osakilpailut ovat kuukauden auki.
- **Radan CRV** (`courseCrv`): live-handicapit ja live-kortti käyttävät radan Metrix-ratinglinjaa
  (`layout.ratingPerThrow`, haetaan automaattisesti); data.js:n `courseRatingValue` on vain varalla
  (rata ei vielä ratingoitu tai backend alhaalla). Sulkeutuessa Metrixin handicapeista laskettu `crv`
  voittaa; jos HC-kentät ovat tyhjiä (Kantola 2026), käytetään `courseCrv`-arvoa.
- "Kausi päättynyt" näytetään vasta kun `TOTAL_EVENTS` kilpailua on pelattu; sitä ennen
  kortti kertoo seuraavan osakilpailun julkaistavan pian.

**Kilpailua ei suljeta käsin** eikä sen `results`-taulukkoa kirjoiteta data.js:ään.

## Ratingit — päivittyvät itsestään

Rating haetaan tässä järjestyksessä (`lookupPlayerRating`):

1. käynnissä olevan kilpailun Metrix-WeeklyHC (`liveRatings`)
2. uusin päättynyt kilpailu, jossa pelaajalla on rating
3. `PLAYER_RATINGS`

Metrixin `Rating: 0` = ei ratingia, ei ylikirjoita tunnettua ratingia. Omistajan sääntö:
käytä aina viimeisimmän kilpailun antamaa ratingia.

## Uuden kilpailun lisääminen

1. Aja `node tools/add-competition.js <Metrix-linkki tai id>`. Se hakee kaiken Metrixin julkisista
   rajapinnoista (ei API-avainta) ja tulostaa `COMPETITIONS`-kohteen: nimi, päivä, rata, par,
   väylät, ilmoittautuneet, paikkakunta ja CRV.
2. Tarkista tuloste ennen liittämistä: lyhennä nimi tarvittaessa (työkalu antaa esim. "Sibbe Blue"),
   korjaa sijainti jos Metrixin `Area` ei ole maakunta (esim. Iittala). CRV on vain varalla-arvo —
   **kysy omistajalta CRV vain, jos työkalu kertoo ettei radalla ole Metrix-ratingia**.
3. Nosta cache-versio, aja testit, committaa, pushaa, tarkista live-sivu.

## Kauden vaihto

1. Jäädytä päättynyt kausi `COMPETITIONS_<vuosi>`-taulukoksi. **Tallenna `hc` ja `hcScore`
   täydellä tarkkuudella — älä pyöristä.** Kahden desimaalin pyöristys siirsi kerran tuloksen
   .5-rajan yli ja muutti kahden pelaajan kausipisteitä; `tests/archive.test.js` valvoo tätä.
2. Luo `<vuosi>.html` olemassa olevan arkistosivun pohjalta.
3. Poista päättyneet kilpailut `COMPETITIONS`-taulukosta.
4. Päivitä index.html: otsikko, meta, navigaatio, hero, vuosiväli, osioiden otsikot,
   footer ja ticker; lisää arkistolinkki kaikille sivuille.

## Työskentelytavat

- **Committaa ja pushaa vain pyynnöstä.** Commitit suoraan `main`-haaraan (se julkaisee).
- **Cache-versio**: nosta `?v=1.0.N` **jokaisella sivulla**, joka lataa muuttuneen tiedoston.
- **Testit**: `node --test` (Node 22, ei riippuvuuksia). Testit käyttävät synteettistä kautta
  ja kiinteää päivää (`loadSite({ today })`), eivät oikeaa dataa.
- **Kieli**: tunnisteet englanniksi, kommentit ja käyttöliittymä suomeksi.
- **Älä lisää** buildityökaluja, frontendin pakettienhallintaa, frameworkeja tai TypeScriptiä
  ilman pyyntöä.
- **Älä luo dokumentaatiomarkdowneja** tehdyistä muutoksista ilman pyyntöä.

## Backend-API

- `GET /api/competition/:id` → `{ registered: string[] }`
- `GET /api/competition/:id/results` → `{ completed, crv, players: [{ name, rating, throws, dnf }], layout }`
  — `layout` = radan Metrix-ratinglinja `{ courseId, layout1000Result, ratingPerThrow }` tai `null`,
  välimuistissa 24 h per rata. Radan puuttuminen ei koskaan kaada tulosvastausta.
- Validoi `:id` numeeriseksi ennen Metrix-kutsua. Tulospäätepisteen cache-avain on `results_<id>`.

## Tyyli & saavutettavuus

- Fontit: Bebas Neue, Rajdhani, Inter (Google Fonts).
- Responsiivinen navigaatio, mobiilin hampurilaisvalikko (`#nav-toggle`); säilytä `aria-*`-attribuutit.
- Päiväykset: `toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', year: 'numeric' })`.
