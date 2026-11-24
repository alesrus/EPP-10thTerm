// Shared loader for EPPGroupMEPs.csv, used by index.html and seating.html.
// All MEP data (roles, orders, seats, presidential table) lives in the CSV.
const MEP_CSV_URL = 'EPPGroupMEPs.csv';

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') inQuotes = false;
      else field += char;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field); field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter(r => r.some(value => value.trim() !== ''));
  if (nonEmpty.length === 0) return [];
  const headers = nonEmpty[0].map(h => h.trim());
  return nonEmpty.slice(1).map(values => {
    const obj = {};
    headers.forEach((h, index) => { obj[h] = (values[index] || '').trim(); });
    return obj;
  });
}

function toOrder(value) {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : 999;
}

function isYes(value) {
  const v = String(value || '').toLowerCase();
  return v === 'yes' || v === 'true';
}

async function loadMEPs() {
  const res = await fetch(MEP_CSV_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseCSV(await res.text()).map(obj => ({
    id: parseInt(obj.id, 10),
    name: obj.name,
    role: obj.role,
    roleLabel: obj.roleLabel,
    group: obj.group,
    country: obj.country,
    flag: obj.flag,
    party: obj.party,
    isHead: isYes(obj.headOfDelegation),
    coordinator: (obj.coordinator && obj.coordinator !== 'nan') ? obj.coordinator : null,
    coordinatorOrder: toOrder(obj.coordinatorOrder),
    committeeChair: obj.committeeChair || null,
    committeeChairOrder: toOrder(obj.committeeChairOrder),
    hondOrder: toOrder(obj.hondOrder),
    groupVpOrder: toOrder(obj.groupVpOrder),
    strasbourg: obj.strasbourg || '',
    brussels: obj.brussels || '',
    strasbourgLocation: obj.strasbourgLocation === 'presidency' ? 'presidency' : 'room',
    brusselsLocation: obj.brusselsLocation === 'presidency' ? 'presidency' : 'room'
  })).filter(m => !isNaN(m.id) && m.name);
}
