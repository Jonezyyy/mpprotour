'use strict';

// Rakentaa COMPETITIONS-taulukon kohteen pelkästä Metrix-linkistä tai -id:stä.
// Kaikki haetaan Metrixin julkisista rajapinnoista (ei API-avainta):
//   - api.php?content=result      nimi, päivä, rata, par, väylät, ilmoittautuneet, CourseID
//   - course_rating_server.php    radan CRV (ratingpisteet per heitto)
//   - api.php?content=courses_list  paikkakunta ja alue
//
// Käyttö:  node tools/add-competition.js https://discgolfmetrix.com/3779894
// Tulostaa data.js:ään liitettävän objektin. Tarkista nimi, sijainti ja CRV ennen liittämistä.

const input = process.argv[2] || '';
const id = (input.match(/(\d{6,})/) || [])[1];
if (!id) {
  console.error('Anna Metrix-kilpailun linkki tai id, esim. node tools/add-competition.js 3779894');
  process.exit(1);
}

const decode = (s) => String(s ?? '')
  .replace(/&rarr;/g, '→').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s{2,}/g, ' ').trim();

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'mpprotour-add-competition' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

// Sama poiminta kuin backendissä (backend/server.js, getLayout).
function crvFromRatingLine(json) {
  if (!Array.isArray(json) || !Array.isArray(json[2]) || json[2].length < 2) return null;
  const [a, b] = json[2];
  const v = Math.abs((a[0] - b[0]) / (a[1] - b[1]));
  return Number.isFinite(v) && v > 0 ? v : null;
}

async function main() {
  const warnings = [];
  const comp = (await getJson(`https://discgolfmetrix.com/api.php?content=result&id=${id}`)).Competition;
  if (!comp) throw new Error(`Kilpailua ${id} ei löytynyt Metrixistä`);

  const fullNameRaw = decode(comp.Name);
  const name = fullNameRaw.replace(/^MP Pro Tour \d{4}\s*[-–]\s*/i, '') || fullNameRaw;
  const fullName = fullNameRaw.replace(/\s-\s/, ' – ');
  const tracks = comp.Tracks || [];
  const par = tracks.reduce((sum, t) => sum + (parseInt(t.Par, 10) || 0), 0);
  const registered = (comp.Results || []).map(r => r.Name).filter(Boolean);

  let crv = null;
  try {
    crv = crvFromRatingLine(await getJson(`https://discgolfmetrix.com/course_rating_server.php?course_id=${comp.CourseID}`));
  } catch (e) { /* käsitellään alla */ }
  if (crv === null) warnings.push('Radalla ei ole Metrix-ratingia: kysy CRV omistajalta ja kirjoita se courseRatingValue-kenttään.');
  else crv = Math.round(crv * 100) / 100; // varalla-arvo; sivusto käyttää live-arvoa täydellä tarkkuudella

  let location = null;
  try {
    const courses = (await getJson('https://discgolfmetrix.com/api.php?content=courses_list&country_code=FI')).courses || [];
    const layout = courses.find(c => String(c.ID) === String(comp.CourseID));
    if (layout) location = [decode(layout.City), decode(layout.Area)].filter(Boolean).join(', ');
  } catch (e) { /* käsitellään alla */ }
  if (!location) warnings.push('Paikkakuntaa ei löytynyt Metrixin rataluettelosta: kysy omistajalta.');
  else warnings.push(`Tarkista sijainti "${location}": Metrixin Area-kenttä ei aina ole maakunta (esim. Iittala).`);

  const q = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "\\'")}'`);
  const entry = [
    '  {',
    `    state: 'next',`,
    `    id: ${comp.ID},`,
    `    name: ${q(name)},`,
    `    fullName: ${q(fullName)},`,
    `    date: ${q(comp.Date)},`,
    `    course: ${q(decode(comp.CourseName))},`,
    `    location: ${q(location)},`,
    `    par: ${par},`,
    `    holes: ${tracks.length},`,
    `    courseRatingValue: ${crv === null ? 'null' : crv},`,
    `    registrationEnd: ${q(comp.Date)},`,
    `    url: 'https://discgolfmetrix.com/${comp.ID}',`,
    `    registerUrl: 'https://discgolfmetrix.com/?u=register_add&ID=${comp.ID}',`,
    `    registered: [`,
    registered.map(n => `      ${q(n)}`).join(',\n'),
    `    ]`,
    '  },'
  ].join('\n');

  console.log(entry);
  if (warnings.length) console.error('\n' + warnings.map(w => `HUOM: ${w}`).join('\n'));
}

main().catch(err => { console.error(`Virhe: ${err.message}`); process.exit(1); });
