const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

// Allow GitHub Pages + local development
const allowedOrigins = [
  'https://jonezyyy.github.io',
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow non-browser requests
    const allowed = allowedOrigins.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    callback(allowed ? null : new Error('Not allowed by CORS'), allowed);
  }
}));

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

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`MP Pro Tour backend running on port ${PORT}`);
});
