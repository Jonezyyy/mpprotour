'use strict';

// --- Kilpailunäkymät ---
// Kilpailujen tila johdetaan ajonaikaisesti: Metrix kertoo milloin osakilpailu on
// päättynyt, joten 'active' → 'over' -siirtymä tapahtuu automaattisesti
// (ks. fetchAllCompetitionResults). Järjestys päivämäärän mukaan, ei taulukon mukaan.
let overComps   = [];
let currentComp = null;   // vanhin vielä pelaamaton kilpailu = se joka näytetään

function recomputeCompStates() {
  const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || ''));
  overComps = COMPETITIONS.filter(c => c.state === 'over').sort(byDate);
  currentComp = COMPETITIONS.filter(c => c.state !== 'over').sort(byDate)[0] ?? null;
}
recomputeCompStates();

// --- Pisteytysfunktiot ---

/**
 * Laskee pelaajan pisteet yhdestä osakilpailusta.
 * Tasatilanteessa lasketaan kyseisten sijoitusten pisteet yhteen
 * ja jaetaan tasapelin pelaajien lukumäärällä — täsmälleen sama
 * logiikka kuin Excel-kaava: SUM(CHOOSEROWS(...)) / samePlace.
 * @param {number|null} place - Sijoitus (null = DNF)
 * @param {Array} allResults  - Kaikki tulokset samasta kilpailusta
 * @returns {number|null}
 */
function calcEventPoints(place, allResults) {
  if (place === null) return null;
  const tiedCount = allResults.filter(r => r.place === place).length;
  let sum = 0;
  for (let i = place - 1; i < place - 1 + tiedCount; i++) {
    sum += POINTS_TABLE[i] ?? 0;
  }
  return sum / tiedCount;
}

/**
 * Muotoilee HC-pisteet näyttöä varten (2 desimaalia).
 * @param {number|null} hcScore
 * @returns {string}
 */
function formatHC(hcScore) {
  if (hcScore === null) return 'DNF';
  return Math.round(hcScore);
}

/**
 * Muotoilee pisteluvun näyttöä varten.
 * Kokonaisluvut ilman desimaaleja, muut 2 desimaalilla.
 * @param {number|null|undefined} val
 * @returns {string}
 */
function fmtPts(val) {
  if (typeof val !== 'number') return '–';
  return String(Math.round(val));
}

/**
 * Muotoilee päivämäärän suomalaiseen muotoon.
 * @param {string} dateStr - ISO-muoto 'YYYY-MM-DD'
 * @returns {string}
 */
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fi-FI', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

// --- Sijoituslaskenta pyöristetyillä HC-tuloksilla ---

/**
 * Palauttaa kilpailun tulokset pyöristetyillä sijoituksilla.
 * hcScore pyöristetään kokonaisluvuksi ennen sijoitusten laskentaa,
 * joten x.xx ja x.yy voivat päätyä samalle sijalle.
 */
function calcRoundedResults(comp) {
  return comp.results.map(res => {
    if (res.hcScore === null) return { ...res, place: null };
    const rounded = Math.round(res.hcScore);
    const place = comp.results.filter(r => r.hcScore !== null && Math.round(r.hcScore) < rounded).length + 1;
    return { ...res, place };
  });
}

// --- Kausitilanne ---

/**
 * Kokoaa kaikki pelaajat ja laskee kausipisteytyksen.
 * DNF tai ei-osallistunut = null (ei lasketa mukaan kokonaispisteisiin).
 * @returns {Array} Lajiteltu pelaajataulukko
 */
function buildStandings(comps = overComps) {
  const players = {};

  comps.forEach(comp => {
    const resultsForCalc = calcRoundedResults(comp);

    resultsForCalc.forEach(res => {
      if (!players[res.name]) {
        players[res.name] = { name: res.name, events: {} };
      }
      players[res.name].events[comp.id] = calcEventPoints(res.place, resultsForCalc);
    });
  });

  return Object.values(players)
    .map(p => {
      const eventPts = Object.values(p.events).filter(v => typeof v === 'number');
      return {
        ...p,
        total: Math.round(eventPts.reduce((a, b) => a + b, 0)),
        eventsPlayed: eventPts.length
      };
    })
    .sort((a, b) => b.total - a.total || b.eventsPlayed - a.eventsPlayed);
}

// --- Renderöinti: Hero-tilastot ---

function renderHeroStats() {
  const container = document.getElementById('hero-stats');
  if (!container || overComps.length === 0) return;

  const standings = buildStandings();
  const leader = standings[0];

  const lastComp = overComps[overComps.length - 1];
  const lastRounded = calcRoundedResults(lastComp);
  const lastWinner = lastRounded.find(r => r.place === 1);

  // Best HC score ever across all events
  let bestHCScore = Infinity, bestHCPlayer = null, bestHCComp = null;
  overComps.forEach(comp => {
    comp.results.forEach(r => {
      if (r.hcScore !== null && r.hcScore < bestHCScore) {
        bestHCScore = r.hcScore;
        bestHCPlayer = r.name;
        bestHCComp = comp.name;
      }
    });
  });

  const totalPlayers = standings.length;
  const progress = `${overComps.length} / ${TOTAL_EVENTS}`;

  const cards = [
    {
      label: 'Johtaja',
      icon: '🥇',
      value: leader.name,
      sub: `${fmtPts(leader.total)} pistettä`,
      playerName: leader.name,
    },
    {
      label: `Voitti — ${lastComp.name}`,
      icon: '🏆',
      value: lastWinner ? lastWinner.name : '–',
      sub: lastWinner ? `HC ${Math.round(lastWinner.hcScore)}` : '',
      playerName: lastWinner ? lastWinner.name : null,
    },
    {
      label: 'Kauden paras HC',
      icon: '🎯',
      value: bestHCPlayer || '–',
      sub: bestHCPlayer ? `${Math.round(bestHCScore)} · ${bestHCComp}` : '',
      playerName: bestHCPlayer,
    },
    {
      label: 'Kausi / Pelaajia',
      icon: '📊',
      value: progress,
      sub: `${totalPlayers} pelaajaa`,
      playerName: null,
    },
  ];

  container.innerHTML = cards.map(c => {
    const nameHtml = c.playerName
      ? `<span class="hstat-value"><button class="player-btn hstat-btn" data-player="${c.playerName}">${c.value}</button></span>`
      : `<span class="hstat-value">${c.value}</span>`;
    return `
      <div class="hstat-card">
        <span class="hstat-label">${c.icon} ${c.label}</span>
        ${nameHtml}
        <span class="hstat-sub">${c.sub}</span>
      </div>`;
  }).join('');

  container.querySelectorAll('.player-btn').forEach(btn => {
    btn.addEventListener('click', () => openPlayerModal(btn.dataset.player));
  });
}

// --- Renderöinti: Kausitilanne ---

function renderStandings() {
  const container = document.getElementById('standings-container');
  if (!container) return;

  // Kauden alussa ei ole vielä yhtään pelattua osakilpailua — tyhjä taulukko
  // pelkkien otsikoiden kanssa näyttäisi rikkinäiseltä.
  if (overComps.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem 0">Kausi ei ole vielä alkanut — ei pelattuja osakilpailuja.</p>';
    const badge = document.getElementById('season-progress');
    if (badge) badge.textContent = `0 / ${TOTAL_EVENTS}`;
    const sub = document.getElementById('hero-subtitle');
    if (sub) sub.textContent = `0 / ${TOTAL_EVENTS} osakilpailua pelattu`;
    return;
  }
  // Otsikkorivi kilpailujen mukaan
  const compHeaders = overComps.map(c =>
    `<th class="pts-col">${c.name}</th>`
  ).join('');

  const standings = buildStandings();

  // Trend: compare against standings before the last event
  const prevRankOf = {};
  if (overComps.length > 1) {
    buildStandings(overComps.slice(0, -1)).forEach((p, idx) => {
      prevRankOf[p.name] = idx + 1;
    });
  }
  const showTrend = overComps.length > 1;

  const rows = standings.map((player, idx) => {
    const rank = idx + 1;
    const rowClass = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : '';
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

    let trendHtml = '<span class="trend-same">—</span>';
    if (showTrend) {
      if (!(player.name in prevRankOf)) {
        trendHtml = '<span class="trend-new">NEW</span>';
      } else {
        const diff = prevRankOf[player.name] - rank;
        if (diff > 0) trendHtml = `<span class="trend-up">▲${diff}</span>`;
        else if (diff < 0) trendHtml = `<span class="trend-down">▼${Math.abs(diff)}</span>`;
      }
    }

    const eventCells = overComps.map(comp => {
      const pts = player.events[comp.id];
      return `<td class="pts-cell">${fmtPts(pts)}</td>`;
    }).join('');

    return `
      <tr class="${rowClass}">
        <td class="rank-cell">${medal}<span class="rank-trend">${trendHtml}</span></td>
        <td class="name-cell"><button class="player-btn" data-player="${player.name}">${player.name}</button></td>
        ${eventCells}
        <td class="total-cell">${fmtPts(player.total)}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="standings-table">
        <thead>
          <tr>
            <th class="rank-col">#</th>
            <th>Pelaaja</th>
            ${compHeaders}
            <th class="total-col">Yht.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Update season progress badge
  const badge = document.getElementById('season-progress');
  if (badge) badge.textContent = `${overComps.length} / ${TOTAL_EVENTS}`;

  // Update hero subtitle
  const sub = document.getElementById('hero-subtitle');
  if (sub) sub.textContent = `${overComps.length} / ${TOTAL_EVENTS} osakilpailua pelattu`;

  container.querySelectorAll('.player-btn').forEach(btn => {
    btn.addEventListener('click', () => openPlayerModal(btn.dataset.player));
  });
}

// --- Renderöinti: Kausi 2025 (arkisto) ---

function renderStandings2025() {
  const container = document.getElementById('standings-2025-container');
  if (!container) return;

  const rows = STANDINGS_2025_FINAL.map(player => {
    const rank = player.rank;
    const rowClass = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : '';
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

    return `
      <tr class="${rowClass}">
        <td class="rank-cell">${medal}</td>
        <td class="name-cell">${player.name}</td>
        <td class="total-cell">${player.points}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="standings-table">
        <thead>
          <tr>
            <th class="rank-col">#</th>
            <th>Pelaaja</th>
            <th class="total-col">Pisteet</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// --- Renderöinti: Arkistokausien osakilpailut ---

/**
 * Renderöi päättyneen kauden osakilpailut allekkain, kaikki kerralla näkyviin.
 * @param {string} containerId
 * @param {Array}  comps
 * @param {Object} opts
 * @param {boolean} opts.showPoints      Näytä pistesarake (vain jos kausi käytti
 *                                       nykyistä POINTS_TABLE-pisteytystä).
 * @param {boolean} opts.recomputePlaces Laske sijoitukset HC-tuloksesta. Kaudella
 *                                       2025 oli eri järjestelmä, joten sen
 *                                       tallennetut sijoitukset käytetään sellaisenaan.
 */
function renderArchiveCompetitions(containerId, comps, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container || !Array.isArray(comps) || comps.length === 0) return;

  const { showPoints = false, recomputePlaces = true } = opts;

  const cards = comps.map((comp, idx) => {
    // Kun sijoitukset lasketaan HC-tuloksesta, järjestetään HC:n mukaan. Kaudella
    // 2025 sijoitus tuli eri järjestelmästä, joten järjestetään sen mukaan — muuten
    // rivit näyttäisivät sekoitetuilta (1, 2, 7, ...).
    const rows = (recomputePlaces ? calcRoundedResults(comp) : comp.results.slice())
      .sort((a, b) => {
        const [x, y] = recomputePlaces ? [a.hcScore, b.hcScore] : [a.place, b.place];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return x - y;
      });

    const cells = rows.map(res => {
      const pts = showPoints ? calcEventPoints(res.place, rows) : null;
      const hcClass = res.hcScore === null ? 'diff-dnf' : '';
      return `
        <tr>
          <td>${res.place != null ? res.place : '–'}</td>
          <td class="name-cell">${res.name}${hotRoundBadge(frozenRoundRatingInfo(res))}</td>
          <td class="rating-cell">${res.rating ?? '–'}</td>
          <td class="throws-cell">${res.throws != null ? res.throws : '–'}</td>
          <td class="hc-cell ${hcClass}">${formatHC(res.hcScore)}</td>
          ${showPoints ? `<td class="pts-cell">${fmtPts(pts)}</td>` : ''}
        </tr>`;
    }).join('');

    const parMeta = (comp.holes != null && comp.par != null)
      ? `<span>${comp.holes} reikää &nbsp;·&nbsp; Par ${comp.par}</span>`
      : '';

    return `
      <div class="comp-card comp-card--archive">
        <div class="comp-card-header">
          <div class="comp-card-title-row">
            <span class="comp-badge">Osakilpailu ${idx + 1}</span>
            <a class="btn btn-metrix" href="${comp.url}" target="_blank" rel="noopener">Metrix →</a>
          </div>
          <h3 class="comp-name">${comp.name}</h3>
          <div class="comp-meta">
            <span>${formatDate(comp.date)}</span>
            <span class="meta-sep">•</span>
            <span>${comp.location}</span>
          </div>
          <div class="comp-info">
            <span>${comp.course}</span>
            ${parMeta}
          </div>
        </div>
        <div class="comp-results-panel">
          <div class="table-wrapper">
            <table class="results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pelaaja</th>
                  <th class="rating-col" title="Metrix-rating">Rating</th>
                  <th class="throws-col">Heittoa</th>
                  <th title="Tasoitettu tulos (HC)">HC tulos</th>
                  ${showPoints ? '<th>Pisteet</th>' : ''}
                </tr>
              </thead>
              <tbody>${cells}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `<div class="archive-comps">${cards}</div>`;
}

// Kauden 2026 loppusijoitukset jäädytetystä datasta
function renderStandings2026Archive(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const standings = buildStandings(COMPETITIONS_2026);
  const compHeaders = COMPETITIONS_2026.map(c => `<th class="pts-col">${c.name}</th>`).join('');

  const rows = standings.map((player, idx) => {
    const rank = idx + 1;
    const rowClass = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : '';
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const eventCells = COMPETITIONS_2026
      .map(comp => `<td class="pts-cell">${fmtPts(player.events[comp.id])}</td>`).join('');

    return `
      <tr class="${rowClass}">
        <td class="rank-cell">${medal}</td>
        <td class="name-cell">${player.name}</td>
        ${eventCells}
        <td class="total-cell">${fmtPts(player.total)}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="standings-table">
        <thead>
          <tr>
            <th class="rank-col">#</th>
            <th>Pelaaja</th>
            ${compHeaders}
            <th class="total-col">Yht.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// --- Renderöinti: Osakilpailut ---

function buildResultsTable(comp) {
  const roundedResults = calcRoundedResults(comp)
    .sort((a, b) => {
      if (a.hcScore === null && b.hcScore === null) return 0;
      if (a.hcScore === null) return 1;
      if (b.hcScore === null) return -1;
      return a.hcScore - b.hcScore;
    });
  const rows = roundedResults.map(res => {
    const pts = calcEventPoints(res.place, roundedResults);
    const hcDisplay = formatHC(res.hcScore);
    const hcClass = res.hcScore === null ? 'diff-dnf' : '';
    const rawDisplay = res.throws !== null ? res.throws : '–';

    return `
      <tr>
        <td>${res.place !== null ? res.place : '–'}</td>
        <td class="name-cell"><button class="player-btn" data-player="${res.name}">${res.name}</button>${hotRoundBadge(roundRatingInfo(res.throws, res.rating, comp.layout))}</td>
        <td class="rating-cell">${res.rating ?? '–'}</td>
        <td class="throws-cell">${rawDisplay}</td>
        <td class="hc-cell ${hcClass}">${hcDisplay}</td>
        <td class="pts-cell">${fmtPts(pts)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="table-wrapper">
      <table class="results-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Pelaaja</th>
            <th class="rating-col" title="Metrix-rating">Rating</th>
            <th class="throws-col">Heittoa</th>
            <th title="Tasoitettu tulos (HC)">HC tulos</th>
            <th>Pisteet</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderCompetitions() {
  const container = document.getElementById('competitions-container');
  if (!container) return;

  const comps = overComps.slice(); // vanhin vasemmalla, uusin oikealla

  if (comps.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem 0">Ei vielä tuloksia.</p>';
    return;
  }

  const cards = comps.map(comp => {
    const badgeNum = overComps.indexOf(comp) + 1;
    const date = formatDate(comp.date);
    return `
      <div class="comp-card">
        <div class="comp-card-header">
          <div class="comp-card-title-row">
            <span class="comp-badge">Osakilpailu ${badgeNum}</span>
            <a class="btn btn-metrix" href="${comp.url}" target="_blank" rel="noopener">Metrix →</a>
          </div>
          <h3 class="comp-name">${comp.name}</h3>
          <div class="comp-meta">
            <span>${date}</span>
            <span class="meta-sep">•</span>
            <span>${comp.location}</span>
          </div>
          <div class="comp-info">
            <span>${comp.course}</span>
            <span>${comp.holes} reikää &nbsp;·&nbsp; Par ${comp.par}</span>
          </div>
        </div>
        <div class="comp-results-panel">
          ${buildResultsTable(comp)}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="comp-carousel-overflow" id="comp-overflow">
      <div class="comp-carousel-track" id="comp-track">${cards}</div>
    </div>`;

  const track    = document.getElementById('comp-track');
  const overflow = document.getElementById('comp-overflow');

  // Touch swipe
  let touchStartX = 0;
  let scrollStart = 0;
  overflow.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    scrollStart = overflow.scrollLeft;
  }, { passive: true });
  overflow.addEventListener('touchmove', e => {
    const dx = touchStartX - e.touches[0].clientX;
    overflow.scrollLeft = scrollStart + dx;
  }, { passive: true });

  // Mouse drag (desktop)
  let isDragging = false;
  let dragStartX = 0;
  let dragScrollStart = 0;
  overflow.addEventListener('mousedown', e => {
    isDragging = true;
    dragStartX = e.clientX;
    dragScrollStart = overflow.scrollLeft;
    overflow.style.cursor = 'grabbing';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    overflow.scrollLeft = dragScrollStart + (dragStartX - e.clientX);
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
    overflow.style.cursor = '';
  });

  // Pelaajaniminapit
  container.querySelectorAll('.player-btn').forEach(btn => {
    btn.addEventListener('click', () => openPlayerModal(btn.dataset.player));
  });
}

// --- Renderöinti: Nykyinen kilpailu ---

// Käynnissä olevan osakilpailun Metrix-ratingit. Metrix lisää WeeklyHC:hen rivin
// (Rating, HC) heti kun pelaajan kierros on kirjattu, joten nämä ovat tuoreimmat
// saatavilla olevat ratingit — uudempia kuin yksikään päättynyt kisa.
const liveRatings = {};

// Radan CRV: Metrixin julkaisema ratinglinja (backendin `layout`) ensin, data.js:n
// käsin syötetty courseRatingValue varalla — esim. uudella radalla, jota Metrix ei
// ole vielä ratingoinut, tai jos backend ei saanut ratinglinjaa haettua.
function courseCrv(comp) {
  if (!comp) return null;
  return (comp.layout && comp.layout.ratingPerThrow) || comp.courseRatingValue || null;
}

// --- Kuuma kierros ---

// Kierros on kuuma, kun se on pyöristettynä vähintään näin monta pistettä
// pelaajan kierrosta edeltävän ratingin yli. Kynnys riippuu ratingista: korkeammalla
// ratingilla on vähemmän tilaa ylittää oma ratingsa, joten kynnys on matalampi.
function hotRoundMinPoints(rating) {
  if (rating >= 900) return 30;
  if (rating >= 800) return 40;
  if (rating >= 700) return 50;
  return 60;
}

// Kierros voidaan arvioida vain pelaajalle, jolla on rating ja kirjattu tulos:
// ei scratch-pelaajia (rating 0) eikä DNF:iä.
function canJudgeRound(throws, rating) {
  return rating > 0 && throws > 0;
}

// Arvio kierroksesta: kierrosrating, sitä edeltänyt rating, pisteet ratingin yli ja
// onko kierros kuuma (pyöristetyistä pisteistä, jotta näytetty luku täsmää).
function hotRoundVerdict(roundRating, rating, pointsAbove) {
  return { roundRating, rating, pointsAbove, hot: Math.round(pointsAbove) >= hotRoundMinPoints(rating) };
}

// Kierroksen rating radan Metrix-ratinglinjasta: 1000-ratingin pelaajan tulos
// ja ratingpisteet per heitto (backendin `layout`). Palauttaa null, jos kierrosta
// ei voi arvioida: rata ilman ratinglinjaa, pelaaja ilman ratingia (scratch) tai DNF.
function roundRatingInfo(throws, rating, layout) {
  if (!layout || !canJudgeRound(throws, rating)) return null;
  const roundRating = 1000 - (throws - layout.layout1000Result) * layout.ratingPerThrow;
  return hotRoundVerdict(roundRating, rating, roundRating - rating);
}

// Arkistorivin jäädytetyt arvot (tallennettu kauden vaihdossa). Arkisto ei kutsu
// Metrixiä, joten rivit ilman näitä kenttiä (kaudet 2025 ja 2026) eivät ole kuumia.
function frozenRoundRatingInfo(row) {
  if (!row || row.roundRating == null || row.pointsAbove == null) return null;
  if (!canJudgeRound(row.throws, row.rating)) return null;
  return hotRoundVerdict(row.roundRating, row.rating, row.pointsAbove);
}

// 🔥-merkki kuumalle kierrokselle (tyhjä merkkijono muuten); tooltipissä kierrosrating
// ja rating, jota vasten kierrosta verrattiin.
function hotRoundBadge(info) {
  if (!info || !info.hot) return '';
  return `<span class="hot-round" title="Kierrosrating ${Math.round(info.roundRating)} (rating ${info.rating})">🔥 +${Math.round(info.pointsAbove)}</span>`;
}

// Palauttaa null jos ratingia ei löydy mistään — kutsuja päättää mitä tekee.
function lookupPlayerRating(name) {
  // Tuorein Metrix-rating voittaa: ensin käynnissä oleva kisa, sitten päättyneet
  // uusimmasta vanhimpaan. PLAYER_RATINGS on varalla niille joilta Metrix-rating puuttuu.
  if (liveRatings[name]) return liveRatings[name];
  const md = metrixData[name];
  if (md) {
    const latestId = overComps.slice().reverse().map(c => c.id).find(id => md[id]);
    if (latestId && md[latestId].rating) return md[latestId].rating;
  }
  for (let i = overComps.length - 1; i >= 0; i--) {
    const res = (overComps[i].results || []).find(r => r.name === name);
    if (res && res.rating) return res.rating;
  }
  if (PLAYER_RATINGS && PLAYER_RATINGS[name]) return PLAYER_RATINGS[name];
  return null;
}

function getPlayerRating(name) {
  return lookupPlayerRating(name) ?? 1000; // No rating found → play scratch (HC = 0)
}

// Live-tulokset kilpailun id:n mukaan: { [compId]: { [pelaaja]: {...} } }.
// Kilpailukohtainen avain estää sen että kahden saman päivän kisan tulokset
// sekoittuvat keskenään (HC lasketaan eri courseRatingValue-arvolla).
const liveResultsByComp = {};

function liveResultsFor(comp) {
  return (comp && liveResultsByComp[comp.id]) || null;
}

async function fetchCurrentCompLiveResults() {
  const comp = currentComp;
  if (!comp || !comp.id) return;
  try {
    const res = await fetch(`https://discgolfmetrix.com/api.php?content=result&id=${comp.id}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.Competition) return;
    const crv = courseCrv(comp);
    // Ratingit ensin, jotta tämän kisan HC-tulokset lasketaan niillä eikä vanhoilla.
    // Rating 0 = Metrixillä ei ole pelaajalle ratingia → ei ylikirjoiteta tunnettua.
    (data.Competition.WeeklyHC || []).forEach(e => {
      const rating = parseInt(e.Rating, 10);
      if (e.Name && rating > 0) liveRatings[e.Name] = rating;
    });
    const live = {};
    (data.Competition.Results || []).forEach(r => {
      const throws = parseInt(r.Sum, 10);
      if (r.DNF && !(throws > 0)) {
        // real DNF: Metrix flagged it and no valid score
        live[r.Name] = { throws: null, dnf: true, hcScore: null };
      } else if (throws > 0) {
        const rating = getPlayerRating(r.Name);
        const hcScore = (crv && rating != null)
          ? parseFloat((throws - (1000 - rating) / crv).toFixed(2))
          : null;
        live[r.Name] = { throws, dnf: false, hcScore };
      }
    });
    liveResultsByComp[comp.id] = live;
  } catch (e) {}
  renderCurrentComp();
}

const CURRENT_COMP_HEADING = 'Seuraava kilpailu';

function setCurrentCompHeading(text) {
  const el = document.querySelector('#seuraava .section-title');
  if (el) el.textContent = text || CURRENT_COMP_HEADING;
}

// Kaikki osakilpailut pelattu → ei "seuraavaa kilpailua" näytettäväksi.
function renderSeasonOver(container) {
  setCurrentCompHeading('Kausi päättynyt');
  const champion = buildStandings()[0] ?? null;
  const podium = champion
    ? `<div class="next-card-body">
        <div class="next-registered">
          <p class="next-registered-title">Mestari</p>
          <ul class="next-player-list">
            <li class="next-player-champion">
              <span class="next-player-num next-player-num--rank">🥇</span>
              <div class="next-player-info"><button class="player-btn" data-player="${champion.name}">${champion.name}</button></div>
              <span class="next-player-champion-points">${fmtPts(champion.total)} p</span>
            </li>
          </ul>
        </div>
      </div>`
    : '';

  container.innerHTML = `
    <div class="next-card">
      <div class="next-card-header">
        <span class="comp-badge">Kausi päättynyt</span>
        <h3 class="comp-name">MP Pro Tour 2026</h3>
        <div class="comp-meta">
          <span>${overComps.length} / ${TOTAL_EVENTS} osakilpailua pelattu</span>
        </div>
        <div class="comp-info">
          <span>Kaikki osakilpailut on pelattu. Kiitos kaudesta!</span>
        </div>
      </div>
      ${podium}
    </div>`;

  container.querySelectorAll('.player-btn').forEach(btn => {
    btn.addEventListener('click', () => openPlayerModal(btn.dataset.player));
  });
}

// Osakilpailu on pelattu mutta seuraavaa ei ole vielä lisätty — kausi jatkuu.
function renderAwaitingNextComp(container) {
  setCurrentCompHeading(null);
  container.innerHTML = `
    <div class="next-card">
      <div class="next-card-header">
        <span class="comp-badge">Seuraava osakilpailu</span>
        <h3 class="comp-name">Julkaistaan pian</h3>
        <div class="comp-meta">
          <span>${overComps.length} / ${TOTAL_EVENTS} osakilpailua pelattu</span>
        </div>
        <div class="comp-info">
          <span>Seuraava osakilpailu lisätään heti kun se on luotu Metrixiin.</span>
        </div>
      </div>
    </div>`;
}

function renderCurrentComp() {
  const container = document.getElementById('next-event-container');
  if (!container) return;

  const comp = currentComp;
  if (!comp) {
    if (overComps.length >= TOTAL_EVENTS) renderSeasonOver(container);
    else renderAwaitingNextComp(container);
    return;
  }
  setCurrentCompHeading(null);

  const crv = courseCrv(comp);
  // Kisa on "käynnissä" jos data.js sanoo niin TAI jos Metrixissä on jo tuloksia.
  // Jälkimmäinen nostaa seuraavan kisan liveksi ilman käsin tehtävää tilamuutosta.
  const live = liveResultsFor(comp);
  const isActive = comp.state === 'active' || (live !== null && Object.keys(live).length > 0);
  const regEnd = comp.registrationEnd
    ? new Date(comp.registrationEnd).toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const players = comp.registered.map(name => {
    const knownRating = lookupPlayerRating(name);
    const rating = knownRating ?? 1000;   // ei ratingia → scratch (HC 0)
    const res = live ? live[name] : null;
    const played = !!res;
    const dnf = res ? res.dnf : false;
    const throws = (res && !res.dnf) ? res.throws : null;
    const hcScore = (res && res.hcScore != null) ? res.hcScore : null;
    const parScore = (!played && rating && crv && comp.par != null)
      ? Math.round(comp.par + (1000 - rating) / crv)
      : null;
    const hotRound = (played && !dnf) ? roundRatingInfo(throws, liveRatings[name], comp.layout) : null;
    return { name, rating, rated: knownRating !== null, throws, dnf, played, hcScore, parScore, hotRound };
  });

  if (isActive) {
    players.sort((a, b) => {
      if (a.played !== b.played) return a.played ? -1 : 1;
      if (!a.played) return 0;
      if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
      return Math.round(a.hcScore) - Math.round(b.hcScore);
    });
  }

  // Paras HC pelatuista (ei DNF) — käytetään "tarvittava tulos" -laskentaan
  const bestHC = players.reduce((best, p) => {
    if (p.played && !p.dnf && p.hcScore !== null) {
      return best === null || p.hcScore < best ? p.hcScore : best;
    }
    return best;
  }, null);

  const badge = isActive ? 'Käynnissä' : 'Seuraava osakilpailu';

  const playedPlayers = players.filter(p => p.played);
  const waitingPlayers = players.filter(p => !p.played);

  // Assign ranks based on rounded HC (ties get the same rank)
  playedPlayers.forEach(p => {
    if (p.dnf || p.hcScore === null) {
      p.rank = null;
    } else {
      const rounded = Math.round(p.hcScore);
      p.rank = playedPlayers.filter(q => !q.dnf && q.hcScore !== null && Math.round(q.hcScore) < rounded).length + 1;
    }
  });

  const ratingCell = (p) => p.rated
    ? `<span class="next-player-rating">${p.rating}</span>`
    : `<span class="next-player-rating next-player-rating--unrated">Ei ratingia</span>`;

  const renderPlayedRow = (p) => {
    const nameBtn = `<button class="player-btn" data-player="${p.name}">${p.name}</button>`;
    if (p.dnf) {
      return `<li class="next-player next-player--played">
        <span class="next-player-num next-player-num--rank">${p.rank ?? '–'}</span>
        <div class="next-player-info">${nameBtn}</div>
        ${ratingCell(p)}
        <span class="next-player-dnf diff-dnf">DNF</span>
      </li>`;
    }
    const diff = p.throws - comp.par;
    const badge = hotRoundBadge(p.hotRound);
    // Kääre vain kuumalle riville, jotta muiden rivien rakenne pysyy ennallaan.
    const nameHtml = badge ? `<span class="next-player-name">${nameBtn}${badge}</span>` : nameBtn;
    const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? 'E' : `${diff}`;
    const diffCls = diff > 0 ? 'over-par' : diff < 0 ? 'under-par' : 'even-par';
    return `<li class="next-player next-player--played">
      <span class="next-player-num next-player-num--rank">${p.rank ?? '–'}</span>
      <div class="next-player-info">${nameHtml}</div>
      ${ratingCell(p)}
      <span class="next-player-score score-diff ${diffCls}">${diffStr}</span>
      <span class="next-player-hcscore">${Math.round(p.hcScore)}</span>
    </li>`;
  };

  const renderWaitingRow = (p) => {
    let targetHtml = '';
    if (isActive && bestHC !== null && p.rating && crv) {
      const throwsNeeded = Math.ceil(bestHC + (1000 - p.rating) / crv) - 1;
      const parDiff = throwsNeeded - comp.par;
      const parStr = parDiff > 0 ? `+${parDiff}` : parDiff === 0 ? 'E' : `${parDiff}`;
      targetHtml = `<span class="beat-leader" title="Tarvitset tämän tuloksen ollaksesi yksin ykkönen">≤${throwsNeeded} (${parStr})</span>`;
    }
    return `<li class="next-player next-player--waiting${p.parScore != null ? ' has-par-score' : ''}">
      <span class="next-player-waiting-dot"></span>
      <div class="next-player-info"><button class="player-btn" data-player="${p.name}">${p.name}</button></div>
      ${ratingCell(p)}
      ${p.parScore != null ? `<span class="next-player-par-score">${p.parScore}</span>` : ''}
      <span class="next-player-beat">${targetHtml}</span>
    </li>`;
  };

  let playerList = '';
  if (playedPlayers.length > 0) {
    playerList += `<li class="next-player-section-label">Pelannut</li>`;
    playerList += `<li class="next-player-col-header next-player-col-header--played"><span></span><span class="next-player-col-name"></span><span class="next-player-col-rating">Rating</span><span class="next-player-col-score">Score</span><span class="next-player-col-hcscore">HC Score</span></li>`;
    playerList += playedPlayers.map(p => renderPlayedRow(p)).join('');
  }
  if (waitingPlayers.length > 0) {
    if (playedPlayers.length > 0) {
      playerList += `<li class="next-player-divider"></li>`;
    }
    const waitingLabel = isActive && playedPlayers.length > 0 ? 'Ei vielä pelannut' : 'Ilmoittautuneet';
    const showParScore = waitingPlayers.some(p => p.parScore != null);
    playerList += `<li class="next-player-section-label">${waitingLabel}</li>`;
    playerList += `<li class="next-player-col-header${showParScore ? ' next-player-col-header--with-par' : ''}"><span></span><span class="next-player-col-name"></span><span class="next-player-col-rating">Rating</span>${showParScore ? '<span class="next-player-col-par-score">Score</span>' : ''}<span class="next-player-col-beat">Score to lead</span></li>`;
    playerList += waitingPlayers.map(p => renderWaitingRow(p)).join('');
  }

  const metrixBtn   = comp.id         ? `<a class="btn btn-ghost" href="${comp.url}" target="_blank" rel="noopener noreferrer">Metrix →</a>` : '';
  const registerBtn = comp.registerUrl ? `<a class="btn btn-primary" href="${comp.registerUrl}" target="_blank" rel="noopener noreferrer">Rekisteröidy</a>` : '';
  const regEndHtml  = regEnd           ? `<span>Ilmoittautuminen auki: ${regEnd} asti</span>` : '';

  container.innerHTML = `
    <div class="next-card">
      <div class="next-card-header">
        <span class="comp-badge ${isActive ? 'comp-badge-live' : ''}">${badge}</span>
        <h3 class="comp-name">${comp.name}</h3>
        <div class="comp-meta">
          <span>${comp.location}</span>
          <span class="meta-sep">•</span>
          <span>${comp.holes} reikää &nbsp;·&nbsp; Par ${comp.par}</span>
        </div>
        <div class="comp-info">
          <span>${comp.course}</span>
          ${regEndHtml}
        </div>
      </div>
      <div class="next-card-body">
        <div class="next-registered">
          <p class="next-registered-title">Ilmoittautuneet <span class="next-count">${comp.registered.length}</span></p>
          <ul class="next-player-list">${playerList}</ul>
        </div>
        <div class="next-actions">
          ${registerBtn}
          ${metrixBtn}
        </div>
      </div>
    </div>`;

  container.querySelectorAll('.player-btn').forEach(btn => {
    btn.addEventListener('click', () => openPlayerModal(btn.dataset.player));
  });
}

// --- Metrix API ---

const metrixData = {};

async function fetchMetrixData() {
  await Promise.all(overComps.map(comp =>
    fetch(`https://discgolfmetrix.com/api.php?content=result&id=${comp.id}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (!data.Competition) return;
        const holeMap = {};
        (data.Competition.Results || []).forEach(res => {
          if (!res.DNF) holeMap[res.Name] = res.PlayerResults || [];
        });
        (data.Competition.WeeklyHC || []).forEach(entry => {
          const name = entry.Name;
          if (!metrixData[name]) metrixData[name] = {};
          const holes = holeMap[name] || [];
          let birdies = 0, pars = 0, bogeys = 0, eagles = 0;
          holes.forEach(h => {
            const d = parseInt(h.Diff, 10);
            if (isNaN(d)) return;
            if (d <= -2) eagles++;
            else if (d === -1) birdies++;
            else if (d === 0) pars++;
            else bogeys++;
          });
          metrixData[name][comp.id] = { rating: entry.Rating, birdies, pars, bogeys, eagles };
        });
      })
      .catch(() => {})
  ));
  renderCurrentComp();
}

// --- Pelaajan profiili ---

function buildPlayerProfile(playerName) {
  const results = overComps.map(comp => {
    const roundedResults = calcRoundedResults(comp);
    const res = roundedResults.find(r => r.name === playerName);
    const pts = res ? calcEventPoints(res.place, roundedResults) : null;
    const api = (metrixData[playerName] || {})[comp.id] || null;
    return {
      compName: comp.name,
      compId:   comp.id,
      place:    res ? res.place   : null,
      hcScore:  res ? res.hcScore : null,
      throws:   res ? res.throws  : null,
      pts,
      rating:  (api && api.rating) || (res && res.rating) || null,
    };
  });

  const played     = results.filter(r => r.pts !== null);
  const totalPts   = Math.round(played.reduce((a, b) => a + b.pts, 0));
  const avgPts     = played.length ? totalPts / played.length : 0;
  const placements = played.map(r => r.place).filter(p => p !== null);
  const bestPlace  = placements.length ? Math.min(...placements) : null;
  const hcScores   = results.filter(r => r.hcScore !== null).map(r => r.hcScore);
  const bestHC     = hcScores.length ? Math.min(...hcScores) : null;
  const avgHC      = hcScores.length ? hcScores.reduce((a, b) => a + b, 0) / hcScores.length : null;
  const ratingPts  = results.filter(r => r.rating !== null);
  const currentRating = ratingPts.length ? ratingPts[ratingPts.length - 1].rating : null;
  const ratingDelta   = ratingPts.length >= 2 ? currentRating - ratingPts[0].rating : null;

  return { name: playerName, results, totalPts, avgPts, bestPlace, bestHC, avgHC,
           currentRating, ratingDelta, eventsPlayed: played.length };
}

// --- Modaali ---

function initModal() {
  const el = document.createElement('div');
  el.id = 'player-modal-overlay';
  el.className = 'modal-overlay';
  el.setAttribute('hidden', '');
  el.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-player-name" tabindex="-1">
      <button class="modal-close" id="modal-close-btn" aria-label="Sulje">&times;</button>
      <div class="modal-header">
        <div class="modal-name-row">
          <h2 class="modal-player-name" id="modal-player-name"></h2>
          <span class="modal-rating-badge" id="modal-rating-badge"></span>
        </div>
        <div class="modal-rating-delta" id="modal-rating-delta"></div>
      </div>
      <div class="modal-body" id="modal-body"></div>
    </div>`;
  document.body.appendChild(el);
  document.getElementById('modal-close-btn').addEventListener('click', closePlayerModal);
  el.addEventListener('click', e => { if (e.target === el) closePlayerModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePlayerModal(); });
}

function openPlayerModal(playerName) {
  const p = buildPlayerProfile(playerName);

  document.getElementById('modal-player-name').textContent = p.name;

  const ratingBadge = document.getElementById('modal-rating-badge');
  if (p.currentRating) {
    ratingBadge.textContent = `Rating ${p.currentRating}`;
    ratingBadge.hidden = false;
  } else {
    ratingBadge.hidden = true;
  }

  const deltaEl = document.getElementById('modal-rating-delta');
  if (p.ratingDelta !== null) {
    const sign = p.ratingDelta > 0 ? '+' : '';
    const cls  = p.ratingDelta > 0 ? 'delta-up' : p.ratingDelta < 0 ? 'delta-down' : 'delta-same';
    deltaEl.innerHTML = `<span class="modal-delta-label">Rating delta kaudella</span><span class="${cls} modal-delta-val">${sign}${p.ratingDelta}</span>`;
    deltaEl.hidden = false;
  } else {
    deltaEl.hidden = true;
  }

  const chips = [
    { label: 'Pisteet',     value: fmtPts(p.totalPts) },
    { label: 'Kilpailut',   value: `${p.eventsPlayed} / ${TOTAL_EVENTS}` },
    { label: 'Ka. pisteet', value: p.eventsPlayed ? fmtPts(Math.round(p.avgPts * 10) / 10) : '\u2013' },
    { label: 'Paras sija',  value: p.bestPlace !== null ? `${p.bestPlace}.` : '\u2013' },
    { label: 'Paras HC',    value: p.bestHC !== null ? p.bestHC.toFixed(2) : '\u2013' },
    { label: 'Ka. HC',      value: p.avgHC  !== null ? p.avgHC.toFixed(2)  : '\u2013' },
  ];
  const chipsHtml = chips.map(c =>
    `<div class="stat-chip"><span class="stat-chip-label">${c.label}</span><span class="stat-chip-value">${c.value}</span></div>`
  ).join('');

  const ratingEvents = p.results.filter(r => r.rating !== null);
  const ratingItems = ratingEvents.map((r, i) => {
    let dHtml = '';
    if (i > 0) {
      const d = r.rating - ratingEvents[i - 1].rating;
      dHtml = d > 0 ? `<span class="delta-up">+${d}</span>`
            : d < 0 ? `<span class="delta-down">${d}</span>`
            :         `<span class="delta-same">\u00b10</span>`;
    }
    return `<div class="rating-event-item"><span class="rating-event-name">${r.compName}</span><span class="rating-event-val">${r.rating}</span>${dHtml}</div>`;
  }).join('');
  const ratingsHtml = ratingEvents.length ? `
    <div class="modal-section">
      <p class="modal-section-title">Rating per kilpailu</p>
      <div class="rating-events-row">${ratingItems}</div>
    </div>` : '';

  const evtRows = p.results.map(r => {
    const throwsDisplay = r.throws !== null ? r.throws : '\u2013';
    return `<tr>
      <td>${r.compName}</td>
      <td class="modal-td-c">${r.place !== null ? r.place + '.' : '\u2013'}</td>
      <td class="modal-td-c">${throwsDisplay}</td>
      <td class="modal-td-c hc-cell">${r.hcScore !== null ? Math.round(r.hcScore) : '\u2013'}</td>
      <td class="modal-td-c">${fmtPts(r.pts)}</td>
    </tr>`;
  }).join('');

  const evtTable = `
    <div class="modal-section">
      <p class="modal-section-title">Tapahtumat</p>
      <div class="table-wrapper">
        <table class="modal-events-table">
          <thead><tr><th>Kilpailu</th><th>Sija</th><th>Heitot</th><th>HC</th><th>Pts</th></tr></thead>
          <tbody>${evtRows}</tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('modal-body').innerHTML = `
    <div class="stat-chips">${chipsHtml}</div>
    ${ratingsHtml}
    ${evtTable}`;

  const overlay = document.getElementById('player-modal-overlay');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  overlay.querySelector('.modal-card').focus();
}

function closePlayerModal() {
  const overlay = document.getElementById('player-modal-overlay');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.style.overflow = '';
}

// --- Nav: smooth scroll & mobile toggle ---

function initNav() {
  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Mobile hamburger
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('nav-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    // Sulje valikko linkkiä klikatessa
    menu.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => menu.classList.remove('open'));
    });
  }

  // Sticky nav background
  const nav = document.getElementById('main-nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }
}

// Scroll-reveal — .reveal-elementit fade-in scrollatessa
function initScrollReveal() {
  const targets = document.querySelectorAll('.reveal');
  if (!targets.length) return;

  // Fallback: jos IntersectionObserver ei tuettu, paljasta kaikki
  if (!('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  targets.forEach(el => io.observe(el));
}

// --- Käynnistys ---

// Metrix täyttää WeeklyHC:n pelaaja kerrallaan heti kun kierros kirjataan, joten
// backendin `completed` on tosi jo ensimmäisen tuloksen jälkeen (todettu Sibbessä
// 2026). Kuukauden mittainen osakilpailu suljetaan siksi vasta kun kaikki
// ilmoittautuneet ovat pelanneet tai kilpailun viimeinen päivä on ohi.
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isReadyToClose(comp, players) {
  const allPlayed = players.every(p => p.throws > 0);
  const datePassed = !!comp.date && todayISO() > comp.date;
  return allPlayed || datePassed;
}

async function fetchAllCompetitionResults() {
  // Käydään läpi kaikki kilpailut joilla on Metrix-id: päättyneiden tulokset
  // päivitetään ja käynnissä oleva suljetaan automaattisesti kun Metrix on valmis.
  const comps = COMPETITIONS.filter(c => c.id);
  await Promise.all(comps.map(async comp => {
    try {
      const res = await fetch(`${RAILWAY_API_URL}/api/competition/${comp.id}/results`);
      if (!res.ok) return;
      const data = await res.json();
      // Radan ratinglinja talteen jokaiselle kisalle, myös kesken olevalle:
      // live-kortti laskee handicapit sen CRV:llä.
      comp.layout = data.layout || null;
      if (!data.completed || !Array.isArray(data.players) || data.players.length === 0) return;

      // Ensisijaisesti Metrixin pelaajien handicapeista laskema CRV. Metrix ei aina
      // laske handicapeja (WeeklyHC:n HC-kentät tyhjiä, kuten Kantolassa 2026);
      // silloin radan ratinglinja ja viimeisenä data.js:n käsin syötetty arvo,
      // jottei kilpailu jää ikuisesti auki.
      const metrixCrv = data.crv;
      const crv = metrixCrv || courseCrv(comp);
      if (!crv) return;

      if (comp.state !== 'over' && !isReadyToClose(comp, data.players)) return;

      comp.results = data.players.map(p => {
        if (p.dnf || p.throws === null || !(p.throws > 0)) {
          return { name: p.name, rating: p.rating, throws: null, hc: null, hcScore: null };
        }
        if (p.rating === null) {
          // Ei ratingia → pelataan raakana (scratch): HC=0, hcScore = heitot
          return { name: p.name, rating: 0, throws: p.throws, hc: 0, hcScore: p.throws };
        }
        const hc = (1000 - p.rating) / crv;
        const hcScore = p.throws - hc;
        return { name: p.name, rating: p.rating, throws: p.throws, hc, hcScore };
      });
      // Metrixin laskema arvo korvaa data.js:n käsin syötetyn arvion — mutta
      // vain jos Metrix tosiaan antoi sellaisen.
      if (metrixCrv) comp.courseRatingValue = metrixCrv;
      comp.state = 'over';
    } catch (e) {
      // Pidetään data.js:n varmuuskopio
    }
  }));
  recomputeCompStates();
}

async function fetchRegisteredPlayers(id) {
  try {
    const res = await fetch(`${RAILWAY_API_URL}/api/competition/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.registered) && data.registered.length > 0 ? data.registered : null;
  } catch (err) {
    console.warn('Backend ei tavoitettavissa, käytetään staattista listaa:', err.message);
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initModal();
  initNav();
  initScrollReveal();

  // Hae tuoreet kisatulokset backendistä ennen renderöintiä
  await fetchAllCompetitionResults();

  renderHeroStats();
  renderStandings();
  renderStandings2025();
  // Arkistosivut: nämä eivät tee mitään jos konttia ei ole (esim. etusivulla)
  renderStandings2026Archive('standings-2026-container');
  renderArchiveCompetitions('competitions-2026-container', COMPETITIONS_2026, { showPoints: true });
  renderArchiveCompetitions('competitions-2025-container', COMPETITIONS_2025, { showPoints: false, recomputePlaces: false });
  renderCompetitions();
  fetchMetrixData(); // async: päivittää ratingit, kutsuu renderCurrentComp()

  // Renderöi nykyinen kilpailu heti staattisilla tiedoilla
  renderCurrentComp();

  // Hae ilmoittautuneet ja live-tulokset näytettävälle kilpailulle
  if (currentComp && currentComp.id) {
    const registered = await fetchRegisteredPlayers(currentComp.id);
    if (registered) currentComp.registered = registered;
    renderCurrentComp();
    // Haetaan aina: jos Metrixissä on jo tuloksia, kisa nousee liveksi itsestään.
    fetchCurrentCompLiveResults();
  }
});
