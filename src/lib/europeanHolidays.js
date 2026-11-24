// Osnovni evropski praznici (zahtev 11). Čiste funkcije: datumi se računaju u UTC kao "YYYY-MM-DD",
// da vremenska zona ne pomeri dan. Pokretni praznici zavise od zapadnog (gregorijanskog) Uskrsa.
// Isti spisak za 2026. i 2027. upisuje migracija 20261124130000_podrazumevani_sifarnici.sql.

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function assertYear(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1583 || y > 9999) throw new Error(`Neispravna godina: ${year}`);
  return y;
}

/** Zapadni Uskrs (anonimni gregorijanski algoritam, Meeus/Jones/Butcher) → "YYYY-MM-DD". */
export function westernEaster(year) {
  const y = assertYear(year);
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Osnovni evropski praznici za godinu, po datumu: [{ date: "YYYY-MM-DD", name }]. */
export function defaultEuropeanHolidays(year) {
  const y = assertYear(year);
  const easter = westernEaster(y);
  return [
    { date: iso(y, 1, 1), name: "New Year's Day" },
    { date: addDays(easter, -2), name: "Good Friday" },
    { date: addDays(easter, 1), name: "Easter Monday" },
    { date: iso(y, 5, 1), name: "Labour Day" },
    { date: addDays(easter, 39), name: "Ascension Day" },
    { date: addDays(easter, 50), name: "Whit Monday" },
    { date: iso(y, 12, 25), name: "Christmas Day" },
    { date: iso(y, 12, 26), name: "St. Stephen's Day" },
  ].sort((p, q) => p.date.localeCompare(q.date));
}

/** Podrazumevani praznici za godinu čiji datum još nije u listi (postojeći datum se ne dira, ni naziv). */
export function missingDefaultHolidays(year, existing) {
  const taken = new Set((existing || []).map((h) => String(typeof h === "string" ? h : h?.date || "").slice(0, 10)));
  return defaultEuropeanHolidays(year).filter((h) => !taken.has(h.date));
}
