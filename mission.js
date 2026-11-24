// External-meeting "mission": one at a time, shared with everyone through
// mission.json in the GitHub repository. Used by index.html and settings.html.
//
// Reading needs no login. Saving needs a GitHub fine-grained access token with
// "Contents: read and write" on this repository; it is kept only in the
// browser of the device where it was entered.

const MISSION_REPO = 'alesrus/EPP-10thTerm';
const MISSION_FILE = 'mission.json';
const MISSION_BRANCH = 'main';
const MISSION_RAW_URL = `https://raw.githubusercontent.com/${MISSION_REPO}/${MISSION_BRANCH}/${MISSION_FILE}`;
const MISSION_API_URL = `https://api.github.com/repos/${MISSION_REPO}/contents/${MISSION_FILE}`;
const MISSION_CACHE_KEY = 'eppMission';
const MISSION_TOKEN_KEY = 'eppMissionToken';

const MISSION_DEFAULT_ROWS = 10;
const MISSION_SEAT_PATTERN = /^([1-9]\d?)([LR])$/;

// "2l" -> "2L"; anything else -> ''
function normalizeMissionSeat(value) {
  const seat = String(value || '').trim().toUpperCase();
  return MISSION_SEAT_PATTERN.test(seat) ? seat : '';
}

// Order for sorting by location: 1L, 1R, 2L, 2R, ... then no location.
function missionSeatOrder(seat) {
  const match = MISSION_SEAT_PATTERN.exec(seat || '');
  return match ? Number(match[1]) * 2 + (match[2] === 'R' ? 1 : 0) : Infinity;
}

function normalizeMission(data) {
  const entries = Array.isArray(data && data.meps) ? data.meps : [];
  const meps = [];
  const seats = {};
  for (const entry of entries) {
    const id = Number(typeof entry === 'object' && entry ? entry.id : entry);
    if (!Number.isInteger(id)) continue;
    meps.push(id);
    const seat = normalizeMissionSeat(entry && entry.seat);
    if (seat) seats[id] = seat;
  }
  // Already-normalized missions keep seats in a separate { id: seat } object.
  if (data && data.seats && typeof data.seats === 'object') {
    for (const [id, value] of Object.entries(data.seats)) {
      const seat = normalizeMissionSeat(value);
      if (seat && meps.includes(Number(id))) seats[id] = seat;
    }
  }
  const rows = Number(data && data.rows);
  return {
    enabled: Boolean(data && data.enabled),
    name: String((data && data.name) || '').trim(),
    rows: Number.isInteger(rows) && rows > 0 && rows < 100 ? rows : MISSION_DEFAULT_ROWS,
    meps,
    seats, // MEP id -> approximate location, e.g. "2L"
    updated: (data && data.updated) || null
  };
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode: ignore */ }
}

function cachedMission() {
  try { return normalizeMission(JSON.parse(storageGet(MISSION_CACHE_KEY))); } catch { return null; }
}

const newer = (a, b) => (a && a.updated ? a.updated : '') > (b && b.updated ? b.updated : '');

// Latest mission: GitHub first (updates reach everyone within a few minutes),
// then the copy published with the site, then the last one seen on this device.
async function loadMission() {
  const cached = cachedMission();
  const token = missionToken();
  const sources = [
    // Editors read through the GitHub API, which always has the latest version.
    ...(token ? [[`${MISSION_API_URL}?ref=${MISSION_BRANCH}&t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store'
    }]] : []),
    [`${MISSION_RAW_URL}?t=${Date.now()}`, { cache: 'no-store' }],
    [`${MISSION_FILE}?t=${Date.now()}`, { cache: 'no-store' }]
  ];
  for (const [url, options] of sources) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) continue;
      const mission = normalizeMission(await res.json());
      // Right after saving, GitHub may still serve the previous version for a
      // few minutes: keep the newer copy saved on this device.
      if (cached && newer(cached, mission)) return cached;
      storageSet(MISSION_CACHE_KEY, JSON.stringify(mission));
      return mission;
    } catch { /* offline or blocked: try the next source */ }
  }
  return cached || normalizeMission({});
}

function missionToken() {
  return storageGet(MISSION_TOKEN_KEY) || '';
}

function setMissionToken(token) {
  storageSet(MISSION_TOKEN_KEY, token ? token.trim() : null);
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// Save the mission to GitHub for everyone. `allMeps` supplies names so the
// file stays readable on GitHub.
async function saveMission(mission, allMeps) {
  const token = missionToken();
  if (!token) throw new Error('No GitHub access token on this device.');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  const names = new Map(allMeps.map(m => [m.id, m.name]));
  const seats = mission.seats || {};
  const data = {
    enabled: Boolean(mission.enabled),
    name: mission.name.trim(),
    rows: mission.rows || MISSION_DEFAULT_ROWS,
    updated: new Date().toISOString(),
    meps: [...new Set(mission.meps)].map(id => {
      const seat = normalizeMissionSeat(seats[id]);
      return { id, name: names.get(id) || '', ...(seat ? { seat } : {}) };
    })
  };

  const current = await fetch(`${MISSION_API_URL}?ref=${MISSION_BRANCH}`, { headers, cache: 'no-store' });
  if (current.status === 401 || current.status === 403) throw new Error('GitHub refused the access token. Check that it is valid and can write to the repository.');
  const sha = current.ok ? (await current.json()).sha : undefined;

  const res = await fetch(MISSION_API_URL, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Mission: ${data.enabled ? 'ON' : 'OFF'} · ${data.name || 'unnamed'} · ${data.meps.length} MEPs`,
      content: toBase64(JSON.stringify(data, null, 2) + '\n'),
      branch: MISSION_BRANCH,
      ...(sha ? { sha } : {})
    })
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
    throw new Error(`GitHub could not save the mission (${res.status}${detail ? `: ${detail}` : ''}).`);
  }
  const saved = normalizeMission(data);
  storageSet(MISSION_CACHE_KEY, JSON.stringify(saved));
  return saved;
}
