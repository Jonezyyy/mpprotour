const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// In-memory cache: { [id]: { data, expiresAt } }
const cache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

    // Build rating map from WeeklyHC (only present for completed events)
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

    const data = { completed, crv, players };
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
