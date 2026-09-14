const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// In-memory cache: { [id]: { data, expiresAt } }
const cache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Radan (layoutin) ratinglinja muuttuu korkeintaan kerran vuorokaudessa:
// Metrix laskee ratingit uudelleen öisin klo 3.
const LAYOUT_TTL_MS = 24 * 60 * 60 * 1000;

// Hakee radan ratinglinjan Metrixistä: tulos jonka 1000-ratingin pelaaja heittää
// ja ratingpisteet per heitto (= radan CRV). Palauttaa null jos rataa ei ole
// ratingoitu tai haku epäonnistuu — ei koskaan heitä virhettä, jottei radan
// puuttuminen kaada kilpailun tuloksia.
async function getLayout(courseId) {
  if (!/^\d+$/.test(String(courseId || ''))) return null;

  const key = `layout_${courseId}`;
  const now = Date.now();
  if (cache[key] && cache[key].expiresAt > now) return cache[key].data;

  try {
    const response = await fetch(
      `https://discgolfmetrix.com/course_rating_server.php?course_id=${courseId}`,
      { timeout: 8000 }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();

    // Ratingoidulle radalle Metrix palauttaa taulukon: [1] = [[ka.rating, ka.tulos], [1000, tulos]],
    // [2] = ratinglinja [rating, tulos] -pareina. Ilman ratingia vastaus on objekti.
    let data = null;
    if (Array.isArray(json) && Array.isArray(json[1]) && Array.isArray(json[2]) && json[2].length >= 2) {
      const layout1000Result = Number(json[1][1]?.[1]);
      const [a, b] = json[2];
      const ratingPerThrow = Math.abs((a[0] - b[0]) / (a[1] - b[1]));
      if (Number.isFinite(layout1000Result) && Number.isFinite(ratingPerThrow) && ratingPerThrow > 0) {
        data = { courseId: Number(courseId), layout1000Result, ratingPerThrow };
      }
    }

    cache[key] = { data, expiresAt: now + LAYOUT_TTL_MS };
    return data;
  } catch (err) {
    // Ei välimuistiin: seuraava tuloshaku yrittää uudelleen.
    console.error(`Failed to fetch layout ${courseId}:`, err.message);
    return null;
  }
}

app.get('/api/competition/:id', async (req, res) => {
  const { id } = req.params;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid competition ID' });
  }

  const now = Date.now();
  if (cache[id] && cache[id].expiresAt > now) {
    return res.json(cache[id].data);
  }

  try {
    const metrixUrl = `https://discgolfmetrix.com/api.php?content=result&id=${id}`;
    const response = await fetch(metrixUrl, { timeout: 8000 });

    if (!response.ok) {
      return res.status(502).json({ error: 'Metrix API error' });
    }

    const json = await response.json();
    const results = json?.Competition?.Results ?? [];
    const registered = results.map(r => r.Name).filter(Boolean);

    const data = { registered };
    cache[id] = { data, expiresAt: now + CACHE_TTL_MS };

    return res.json(data);
  } catch (err) {
    console.error(`Failed to fetch competition ${id}:`, err.message);
    return res.status(502).json({ error: 'Failed to fetch from Metrix' });
  }
});

app.get('/api/competition/:id/results', async (req, res) => {
  const { id } = req.params;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid competition ID' });
  }

  const cacheKey = `results_${id}`;
  const now = Date.now();
  if (cache[cacheKey] && cache[cacheKey].expiresAt > now) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const response = await fetch(
      `https://discgolfmetrix.com/api.php?content=result&id=${id}`,
      { timeout: 8000 }
    );

    if (!response.ok) {
      return res.status(502).json({ error: 'Metrix API error' });
    }

    const json = await response.json();
    const comp = json?.Competition;
    if (!comp) return res.status(502).json({ error: 'Invalid Metrix response' });

    // Build rating map from WeeklyHC (a row appears as soon as a player's round is scored)
    const ratingMap = {};
    (comp.WeeklyHC || []).forEach(e => {
      if (e.Name) ratingMap[e.Name] = parseInt(e.Rating, 10) || null;
    });

    const weeklyHC = comp.WeeklyHC || [];
    const completed = weeklyHC.length > 0;

    // Calculate CRV as average of (1000 - Rating) / HC across all valid entries
    const crvValues = weeklyHC
      .filter(e => e.Rating && e.HC && parseFloat(e.HC) > 0)
      .map(e => (1000 - parseFloat(e.Rating)) / parseFloat(e.HC));
    const crv = crvValues.length > 0
      ? crvValues.reduce((a, b) => a + b, 0) / crvValues.length
      : null;

    const players = (comp.Results || [])
      .filter(r => r.Name)
      .map(r => {
        const throws = parseInt(r.Sum, 10) || null;
        const dnf = r.DNF !== null || throws === null || throws === 0;
        const rating = ratingMap[r.Name] || null;
        return {
          name: r.Name,
          rating,
          throws: dnf ? null : throws,
          dnf
        };
      });

    // Radan ratinglinja (CRV ja 1000-ratingin tulos); null jos ei saatavilla.
    const layout = await getLayout(comp.CourseID);

    const data = { completed, crv, players, layout };
    cache[cacheKey] = { data, expiresAt: now + CACHE_TTL_MS };
    return res.json(data);
  } catch (err) {
    console.error(`Failed to fetch results for ${id}:`, err.message);
    return res.status(502).json({ error: 'Failed to fetch from Metrix' });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`MP Pro Tour backend running on port ${PORT}`);
});
