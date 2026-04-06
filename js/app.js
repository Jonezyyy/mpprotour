'use strict';

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
  return hcScore.toFixed(2);
}

/**
 * Muotoilee pisteluvun näyttöä varten.
 * Kokonaisluvut ilman desimaaleja, muut 2 desimaalilla.
 * @param {number|null|undefined} val
 * @returns {string}
 */
function fmtPts(val) {
  if (typeof val !== 'number') return '–';
  return Number.isInteger(val) ? String(val) : val.toFixed(2);
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
function buildStandings(comps = COMPETITIONS) {
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
        total: eventPts.reduce((a, b) => a + b, 0),
        eventsPlayed: eventPts.length
      };
    })
    .sort((a, b) => b.total - a.total || b.eventsPlayed - a.eventsPlayed);
}

// --- Renderöinti: Hero-tilastot ---

function renderHeroStats() {
  const container = document.getElementById('hero-stats');
  if (!container || COMPETITIONS.length === 0) return;

  const standings = buildStandings();
  const leader = standings[0];

  const lastComp = COMPETITIONS[COMPETITIONS.length - 1];
  const lastWinner = lastComp.results.find(r => r.place === 1);

  // Best HC score ever across all events
  let bestHCScore = Infinity, bestHCPlayer = null, bestHCComp = null;
  COMPETITIONS.forEach(comp => {
    comp.results.forEach(r => {
      if (r.hcScore !== null && r.hcScore < bestHCScore) {
        bestHCScore = r.hcScore;
        bestHCPlayer = r.name;
        bestHCComp = comp.name;
      }
    });
  });

  const totalPlayers = standings.length;
  const progress = `${COMPETITIONS.length} / ${TOTAL_EVENTS}`;

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
      sub: lastWinner ? `HC ${lastWinner.hcScore.toFixed(2)}` : '',
      playerName: lastWinner ? lastWinner.name : null,
    },
    {
      label: 'Kauden paras HC',
      icon: '🎯',
      value: bestHCPlayer || '–',
      sub: bestHCPlayer ? `${bestHCScore.toFixed(2)} · ${bestHCComp}` : '',
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
  // Otsikkorivi kilpailujen mukaan
  const compHeaders = COMPETITIONS.map(c =>
    `<th class="pts-col">${c.name}</th>`
  ).join('');

  const standings = buildStandings();

  // Trend: compare against standings before the last event
  const prevRankOf = {};
  if (COMPETITIONS.length > 1) {
    buildStandings(COMPETITIONS.slice(0, -1)).forEach((p, idx) => {
      prevRankOf[p.name] = idx + 1;
    });
  }
  const showTrend = COMPETITIONS.length > 1;

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

    const eventCells = COMPETITIONS.map(comp => {
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
  if (badge) badge.textContent = `${COMPETITIONS.length} / ${TOTAL_EVENTS}`;

  // Update hero subtitle
  const sub = document.getElementById('hero-subtitle');
  if (sub) sub.textContent = `${COMPETITIONS.length} / ${TOTAL_EVENTS} osakilpailua pelattu`;

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

// --- Renderöinti: Osakilpailut ---

function buildResultsTable(comp) {
  const roundedResults = calcRoundedResults(comp);
  const rows = roundedResults.map(res => {
    const pts = calcEventPoints(res.place, roundedResults);
    const hcDisplay = formatHC(res.hcScore);
    const hcClass = res.hcScore === null ? 'diff-dnf' : '';
    const rawDisplay = res.throws !== null ? res.throws : '–';

    return `
      <tr>
        <td>${res.place !== null ? res.place : '–'}</td>
        <td class="name-cell"><button class="player-btn" data-player="${res.name}">${res.name}</button></td>
        <td class="rating-cell">${res.rating ?? '–'}</td>
        <td>${rawDisplay}</td>
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
            <th title="Metrix-rating">Rating</th>
            <th>Heittoa</th>
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
  const cards = COMPETITIONS.map((comp, i) => {
    const winner = comp.results[0];
    const winnerHC = winner.hcScore !== null ? winner.hcScore.toFixed(2) : 'DNF';
    const date = formatDate(comp.date);

    return `
      <div class="comp-card">
        <div class="comp-card-header">
          <span class="comp-badge">Osakilpailu ${i + 1}</span>
          <h3 class="comp-name">${comp.name}</h3>
          <div class="comp-meta">
            <span>📅 ${date}</span>
            <span>📍 ${comp.location}</span>
          </div>
          <div class="comp-info">
            <span>${comp.course}</span>
            <span>${comp.holes} reikää &nbsp;·&nbsp; Par ${comp.par}</span>
          </div>
        </div>
        <div class="comp-winner">
          <span class="winner-label">Voittaja</span>
          <span class="winner-name">🏆 <button class="player-btn" data-player="${winner.name}">${winner.name}</button></span>
          <span class="winner-score">HC ${winnerHC}</span>
        </div>
        <div class="comp-actions">
          <button class="btn-results" data-comp-id="${comp.id}">Näytä tulokset</button>
          <a class="btn-metrix" href="${comp.url}" target="_blank" rel="noopener">Metrix →</a>
        </div>
        <div class="comp-results-panel" id="results-panel-${comp.id}" hidden>
          ${buildResultsTable(comp)}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = cards;

  // Toggle-napit
  container.querySelectorAll('.btn-results').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(`results-panel-${btn.dataset.compId}`);
      const opening = panel.hidden;
      panel.hidden = !opening;
      btn.textContent = opening ? 'Piilota tulokset' : 'Näytä tulokset';
      if (opening) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  // Pelaajaniminapit
  container.querySelectorAll('.player-btn').forEach(btn => {
    btn.addEventListener('click', () => openPlayerModal(btn.dataset.player));
  });
}

// --- Renderöinti: Seuraava kilpailu ---

function getPlayerRating(name) {
  const md = metrixData[name];
  if (md) {
    const latestId = COMPETITIONS.slice().reverse().map(c => c.id).find(id => md[id]);
    if (latestId && md[latestId].rating) return md[latestId].rating;
  }
  for (let i = COMPETITIONS.length - 1; i >= 0; i--) {
    const res = COMPETITIONS[i].results.find(r => r.name === name);
    if (res && res.rating) return res.rating;
  }
  return null;
}

function renderNextEvent() {
  const container = document.getElementById('next-event-container');
  if (!container || !NEXT_COMPETITION) return;

  const regEnd = new Date(NEXT_COMPETITION.registrationEnd).toLocaleDateString('fi-FI', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  const playerList = NEXT_COMPETITION.registered.map((name, i) => {
    const rating = getPlayerRating(name);
    const crv = NEXT_COMPETITION.courseRatingValue;
    const mullit = (rating && crv) ? Math.max(0, Math.round((1000 - rating) / crv / 6)) : null;
    const ratingHtml = rating ? `<span class="next-player-rating">Rating ${rating}</span>` : '';
    const mullitHtml = mullit !== null
      ? `<span class="next-player-mullit" title="Rating ${rating}">${mullit > 0 ? mullit + ' mulli' + (mullit === 1 ? '' : 'a') : '—'}</span>`
      : '';
    return `<li class="next-player"><span class="next-player-num">${i + 1}</span><button class="player-btn" data-player="${name}">${name}</button>${ratingHtml}${mullitHtml}</li>`;
  }).join('');

  container.innerHTML = `
    <div class="next-card">
      <div class="next-card-header">
        <span class="comp-badge">Seuraava osakilpailu</span>
        <h3 class="comp-name">${NEXT_COMPETITION.name}</h3>
        <div class="comp-meta">
          <span>📍 ${NEXT_COMPETITION.location}</span>
          <span>🏁 ${NEXT_COMPETITION.holes} reikää &nbsp;·&nbsp; Par ${NEXT_COMPETITION.par}</span>
        </div>
        <div class="comp-info">
          <span>${NEXT_COMPETITION.course}</span>
          <span>Ilmoittautuminen auki: ${regEnd} asti</span>
        </div>
      </div>
      <div class="next-card-body">
        <div class="next-registered">
          <p class="next-registered-title">Ilmoittautuneet <span class="next-count">${NEXT_COMPETITION.registered.length}</span></p>
          <ul class="next-player-list">${playerList}</ul>
        </div>
        <div class="next-actions">
          <a class="btn btn-primary" href="${NEXT_COMPETITION.registerUrl}" target="_blank" rel="noopener noreferrer">Rekisteröidy</a>
          <a class="btn btn-ghost" href="${NEXT_COMPETITION.url}" target="_blank" rel="noopener noreferrer">Metrix →</a>
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
  await Promise.all(COMPETITIONS.map(comp =>
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
  renderNextEvent();
}

// --- Pelaajan profiili ---

function buildPlayerProfile(playerName) {
  const results = COMPETITIONS.map(comp => {
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
  const totalPts   = played.reduce((a, b) => a + b.pts, 0);
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
      <td class="modal-td-c hc-cell">${r.hcScore !== null ? r.hcScore.toFixed(2) : '\u2013'}</td>
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

// --- Käynnistys ---

document.addEventListener('DOMContentLoaded', () => {
  initModal();
  renderHeroStats();
  renderStandings();
  renderStandings2025();
  renderNextEvent();
  renderCompetitions();
  initNav();
  fetchMetrixData();
});
