# Copilot-ohjeet – Miesperhe Pro Tour

Tämä on Miesperhe Pro Tour -kiertueen verkkosivusto (mpprotour.fi).
Vastaa aina **suomeksi**, ellei käyttäjä pyydä toisin.

## Projektin yleiskuvaus

- **Frontend**: Staattinen sivusto ([index.html](index.html) = kausi 2026, [2025.html](2025.html) = arkisto).
  Ei build-työkaluja, ei frameworkeja — vanilla HTML/CSS/JS.
- **Backend**: [backend/server.js](backend/server.js) on Express-proxy Discgolf Metrix APIlle.
  Ajossa Railwayssa: `https://mpprotour-production.up.railway.app`.
  5 minuutin in-memory cache.
- **Data**: [js/data.js](js/data.js) sisältää manuaalisesti ylläpidetyt
  `PLAYER_RATINGS`, `POINTS_TABLE`, `COMPETITIONS` ja `TOTAL_EVENTS`.
- **Logiikka**: [js/app.js](js/app.js) renderöi kausitilanteen, osakilpailut ja
  live-tulokset. Ei moduuleja — globaalit funktiot `<script>`-tageissa.
- **Tyylit**: [css/style.css](css/style.css) — versio queryllä
  (`style.css?v=1.0.9`) cachen invalidointiin.

## Kilpailun tila (`state`)

Jokaisella `COMPETITIONS`-kohteella on yksi kolmesta tilasta:

- `'over'` — päättynyt, tulokset `comp.results[]`-taulussa, lasketaan kausipisteisiin
- `'active'` — käynnissä, tulokset haetaan livenä Metrixistä backendin kautta
- `'next'` — tulossa, näytetään vain mullit-ennakko

## Ydinkaavat — ÄLÄ MUUTA ilman lupaa

Nämä ovat kanonisia. Jos haluat muuttaa, varmista käyttäjältä ensin.

```js
// HC-tulos
hcScore = throws - (1000 - rating) / crv

// Mullit (ennen pelaamista)
mullit = Math.max(0, Math.ceil((1000 - rating) / crv / 6))

// Sijoitus kilpailussa (pyöristetty HC)
rounded = Math.round(hcScore)
place   = results.filter(r => Math.round(r.hcScore) < rounded).length + 1

// Kausipisteet — tasatilanteessa jaettu keskiarvo
POINTS_TABLE = [100, 90, 82, 74, 67, 60, 54, 48, 42, 36, 30, 24, 18, 12, 6]
// Sija 16+ = 0 pistettä

// Tarvittavat heitot lyödäkseen kärjen (live)
throwsNeeded = Math.ceil(bestHC + (1000 - rating) / crv) - 1
```

- `rating`: pelaajan Metrix-rating `PLAYER_RATINGS`-taulusta
- `crv`: `comp.courseRatingValue`
- `throws`: pelaajan bruttoheitot

## Voittajan haku — KRIITTINEN

Käytä **aina** `calcRoundedResults(comp)`-funktiota voittajan löytämiseen.
**ÄLÄ** käytä `comp.results[0]` tai `comp.results.find(r => r.place === 1)`.

Syy: Railway-API ylikirjoittaa `comp.results` ilman `place`-kenttää.
`calcRoundedResults` laskee sijoitukset aina uudelleen HC-tuloksista.

```js
const rounded = calcRoundedResults(comp);
const winner  = rounded.find(r => r.place === 1);
```

## Kilpailun sulkeminen — työnkulku

Kun kilpailu päättyy ja seuraava aktivoidaan, tee nämä vaiheet järjestyksessä:

**1. Hae tulokset backendistä:**
```
GET https://mpprotour-production.up.railway.app/api/competition/<id>/results
```
Varmista että vastauksessa `"completed": true` ennen kuin jatkat.

**2. Laske HC-tulokset ja sijoitukset** käyttäen `crv`-arvoa vastauksesta:
```
hcScore = throws - (1000 - rating) / crv   (2 desimaalia)
place   = pelaajat joiden Math.round(hcScore) < Math.round(oma hcScore), +1
```
Tasatilanne (sama pyöristetty HC) → sama sijoitusnumero.

**3. Päivitä `data.js`:**
- Sulje kilpailu: vaihda `state: 'active'` → `'over'`, poista `registered` ja `registrationEnd`, lisää `results: [...]`
- Aktivoi seuraava: vaihda `state: 'next'` → `'active'`
- **Pidä `COMPETITIONS`-taulukko kronologisessa järjestyksessä** (vanhin ensin).
  Trendipiilit (`▲▼`) perustuvat `overComps[overComps.length - 1]` eli viimeiseen — väärä järjestys rikkoo trendit.

**4. `results[]`-rivien muoto:**
```js
{ place: N, name: '...', rating: NNN, throws: NN, hc: NN.NN, hcScore: NN.NN }
```
DNF-pelaajalla `throws: null, hc: null, hcScore: null, place: null`.

## Työskentelytavat

- **Älä pushaa** (`git push`) ellei käyttäjä erikseen pyydä. Paikalliset
  commitit ovat ok, mutta odota ennen pushia.
- **Älä lisää** buildityökaluja, pakettien hallintaa frontendiin, frameworkeja
  tai TypeScriptiä ilman pyyntöä.
- **Älä luo dokumentaatiomarkdowneja** tehdyistä muutoksista ilman pyyntöä.
- **Ratingit päivitetään manuaalisesti** — kun lisäät pelaajan, muista
  sekä `PLAYER_RATINGS` että tarvittaessa `COMPETITIONS[].registered`.
- **`TOTAL_EVENTS = 8`** — jos muutat kilpailumäärää, päivitä myös hero-teksti.

## Backend-API

- `GET /api/competition/:id` → `{ registered: string[] }` (ilmoittautuneiden nimet)
- `GET /api/competition/:id/results` → kilpailun live-tulokset ja ratingit
- Validoi aina `:id` numeeriseksi ennen Metrix-kutsua.
- Cache-TTL 5 min; avainna `results_<id>` erikseen tulospäätepisteelle.

## Tyyli & saavutettavuus

- Fontit: Bebas Neue, Oswald, Orbitron, Rajdhani, Inter (Google Fonts).
- Responsiivinen nav, mobiili-hampurilainen (`#nav-toggle`).
- Säilytä `aria-*`-attribuutit navigaation painikkeissa.
- Suomenkieliset päiväykset: `toLocaleDateString('fi-FI', { day, month, year })`.
