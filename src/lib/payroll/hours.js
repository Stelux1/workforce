// Vrste sati iz nedeljne satnice i iznosi po vrsti (D5). Čiste funkcije: praznici, prag, koeficijenti i tarife
// stižu kao ulaz (holidays, work_rules, hour_types, employee_private, resolveRates) — ništa se ne čita iz baze.
//
// Razvrstavanje po danu — svaki sat ima tačno jednu konačnu vrstu (spec §5):
//   praznik koji padne u subotu/nedelju → „praznik vikendom" (praznik_vikend)
//   → praznik radnim danom → vikend (subota, nedelja)
//   → radni dan: do dnevnog praga redovno, preko praga prekovremeno.
// Sati praznika i vikenda se ne dele na prekovremeno — ceo dan je ta vrsta.
//
// Iznos jedne vrste = sati × tarifa × koeficijent, zaokruženo na cent po vrsti, pa se vrste sabiraju.
// Radnik: posebna satnica iz profila (prekovremeni/vikend/praznik) ima prednost nad tarifom × koeficijent.
// Klijent: uvek tarifa klijenta × koeficijent klijenta. Koeficijent koji fali → greška, nikad tiho 1,00 (D5/D11).
//
// „Praznik vikendom" nema svoj koeficijent: dan potpada i pod praznik i pod vikend, pa se primenjuje VEĆI od ta dva,
// posebno za svaku stranu, bez sabiranja i bez dvostrukog množenja. Radnik: veća satnica od
// (posebna satnica praznika ili tarifa × koef. praznika) i (posebna satnica vikenda ili tarifa × koef. vikenda);
// klijent: tarifa klijenta × veći od koef. praznika i vikenda za klijenta. Jednake → praznik. Obe strane moraju biti
// upisane (prazan koeficijent i dalje blokira, i kad je drugi upisan). Isto pravilo je u bazi (timesheet_amounts).

import { round2, sum2 } from "./money.js";
import { MissingRateError } from "./monthly.js";
import { validRate } from "./timesheet.js";

export const HOUR_TYPES = Object.freeze({
  REGULAR: "redovni",
  OVERTIME: "prekovremeni",
  WEEKEND: "vikend",
  HOLIDAY: "praznik",
  HOLIDAY_WEEKEND: "praznik_vikend", // praznik u subotu/nedelju: veći od koeficijenata praznika i vikenda
});

/** Sve vrste sati u redosledu prikaza (satnica, obračun, platni listić). */
export const HOUR_TYPE_ORDER = Object.freeze([
  HOUR_TYPES.REGULAR, HOUR_TYPES.OVERTIME, HOUR_TYPES.WEEKEND, HOUR_TYPES.HOLIDAY, HOUR_TYPES.HOLIDAY_WEEKEND,
]);
const CODES = HOUR_TYPE_ORDER;

/** Vrste čiji se koeficijent (i posebna satnica) upoređuju za „praznik vikendom"; pri jednakosti pobeđuje prva. */
const HOLIDAY_WEEKEND_FROM = Object.freeze([HOUR_TYPES.HOLIDAY, HOUR_TYPES.WEEKEND]);

// Posebna satnica radnika iz profila (employee_private) po vrsti sati. Redovni nema posebnu satnicu.
const SPECIAL_RATE_FIELD = Object.freeze({
  [HOUR_TYPES.OVERTIME]: "overtime_rate",
  [HOUR_TYPES.WEEKEND]: "weekend_rate",
  [HOUR_TYPES.HOLIDAY]: "holiday_rate",
});

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DAILY_THRESHOLD = 8; // isto kao work_rules.daily_regular_hours default

/** Koeficijent vrste sati koji je prazan, a vrsta ima sate > 0. `missing` = [{ code, side }] (side: "worker" | "client"). */
export class MissingCoefficientError extends MissingRateError {
  constructor(missing) {
    super(missing.map((m) => ({ field: `${m.side}_coef`, key: m.code })));
    this.name = "MissingCoefficientError";
    this.message =
      "Nedostaje koeficijent za vrstu sati: " +
      missing.map((m) => `${m.code} (${m.side === "worker" ? "radnik" : "klijent"})`).join(", ") +
      " — admin mora da ga upiše u Vrste sati pre obračuna";
    this.codes = [...new Set(missing.map((m) => m.code))];
    this.coefficients = missing;
  }
}

/** Sati u centima sata (ceo broj) — da razvrstavanje i zbir ne gomilaju float grešku. */
function toCents(value, label, max = Infinity) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`Neispravni sati za ${label}: ${value}`);
  return Math.round(round2(n) * 100);
}

/** "YYYY-MM-DD" + n dana, računato u UTC da vremenska zona ne pomeri dan. */
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sati po danima pon–ned: niz od 7 brojeva ili red satnice (mon_hours … sun_hours). */
function dayValues(dayHours) {
  if (Array.isArray(dayHours)) {
    if (dayHours.length !== 7) throw new Error(`Satnica mora imati 7 dana (pon–ned), a ima ${dayHours.length}`);
    return dayHours;
  }
  return DAYS.map((d) => dayHours?.[`${d}_hours`]);
}

function holidaySet(holidays) {
  return new Set((holidays || []).map((h) => String(typeof h === "string" ? h : h?.date || "").slice(0, 10)).filter(Boolean));
}

/**
 * Razvrstaj sate jedne nedeljne satnice po vrsti.
 * @param {object} input
 * @param {string} input.weekStart          ponedeljak nedelje, "YYYY-MM-DD"
 * @param {Array|object} input.dayHours     [pon, uto, sre, čet, pet, sub, ned] ili red satnice (mon_hours … sun_hours)
 * @param {Array} [input.holidays]          datumi praznika ("YYYY-MM-DD") ili redovi holidays ({ date })
 * @param {number} [input.dailyThreshold=8] work_rules.daily_regular_hours — preko toga je prekovremeno (samo radnim danom)
 * @param {boolean} [input.holidayWeekend=true] false = staro pravilo (pre 24.11.2026): praznik vikendom je „praznik".
 *   Koristi se samo za snimke odobrene po starom pravilu (D10) — vidi timesheetMonthLines.
 * @returns {{ redovni: number, prekovremeni: number, vikend: number, praznik: number, praznik_vikend: number }}
 */
export function classifyWeek({ weekStart, dayHours, holidays, dailyThreshold = DEFAULT_DAILY_THRESHOLD, holidayWeekend = true }) {
  const start = String(weekStart || "").slice(0, 10);
  if (!DATE_RE.test(start) || Number.isNaN(Date.parse(`${start}T00:00:00Z`))) {
    throw new Error(`Neispravan početak nedelje: ${weekStart}`);
  }
  if (new Date(`${start}T00:00:00Z`).getUTCDay() !== 1) throw new Error(`Nedelja satnice mora počinjati ponedeljkom: ${start}`);
  const threshold = Number(dailyThreshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 24) throw new Error(`Neispravan dnevni prag: ${dailyThreshold}`);
  const thresholdCents = Math.round(round2(threshold) * 100);

  const isHoliday = holidaySet(holidays);
  const values = dayValues(dayHours);
  const cents = Object.fromEntries(CODES.map((c) => [c, 0]));

  values.forEach((value, i) => {
    const date = addDays(start, i);
    const h = toCents(value, date, 24); // dan ima najviše 24h (isto kao check u bazi)
    if (h === 0) return;
    if (isHoliday.has(date) && i >= 5 && holidayWeekend) cents.praznik_vikend += h; // praznik u subotu/nedelju
    else if (isHoliday.has(date)) cents.praznik += h; // praznik radnim danom (staro pravilo: i vikendom)
    else if (i >= 5) cents.vikend += h; // subota, nedelja
    else {
      cents.redovni += Math.min(h, thresholdCents);
      cents.prekovremeni += Math.max(0, h - thresholdCents);
    }
  });

  return Object.fromEntries(CODES.map((c) => [c, cents[c] / 100]));
}

/** hour_types kao niz redova ili objekat po šifri → mapa šifra → red. */
function hourTypeMap(hourTypes) {
  if (Array.isArray(hourTypes)) return new Map(hourTypes.filter(Boolean).map((t) => [t.code, t]));
  return new Map(Object.entries(hourTypes || {}));
}

/** Koeficijent > 0 ili null (prazan koeficijent NIJE 1,00). */
function validCoef(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Tarifa kao broj ili kao strana iz resolveRates ({ rate }). */
const rateOf = (r) => validRate(r !== null && typeof r === "object" ? r.rate : r);

/**
 * Strana radnika za jednu konfigurisanu vrstu (prekovremeni/vikend/praznik/redovni): posebna satnica iz profila ili
 * tarifa × koeficijent radnika. `perHour` = satnica po satu za poređenje (null kad nešto fali).
 */
function workerTerms(code, types, employeePrivate, baseWorker) {
  const special = SPECIAL_RATE_FIELD[code] ? validRate(employeePrivate?.[SPECIAL_RATE_FIELD[code]]) : null;
  const coef = special === null ? validCoef(types.get(code)?.worker_coef) : null;
  const perHour = special !== null ? special : coef !== null && baseWorker !== null ? baseWorker * coef : null;
  return { code, special, coef, perHour };
}

/**
 * Tarifa × koeficijent ima najviše 6 decimala (tarifa 2, koeficijent 4) — poređenje u celim milionitim delovima je
 * tačno i isto kao poređenje numeric vrednosti u bazi (float greška se ne prenosi u izbor).
 */
const micro = (n) => Math.round(n * 1e6);

/** Veći kandidat; pri jednakosti prvi (praznik). */
const higher = (list, value) => list.reduce((best, x) => (micro(value(x)) > micro(value(best)) ? x : best));

/**
 * Iznosi satnice po vrsti sati.
 * @param {object} input
 * @param {object} input.hoursByType        { redovni, prekovremeni, vikend, praznik, praznik_vikend } (npr. iz classifyWeek)
 * @param {number|{rate:number}} input.workerRate  osnovna tarifa radnika (resolveRates().worker)
 * @param {number|{rate:number}} input.clientRate  osnovna tarifa klijenta (resolveRates().client)
 * @param {Array|object} input.hourTypes    redovi hour_types ({ code, worker_coef, client_coef }) ili objekat po šifri
 * @param {object} [input.employeePrivate]  { overtime_rate, weekend_rate, holiday_rate } — posebne satnice radnika
 * @returns {{ lines: Array<{ code, hours, worker_rate, worker_coef, worker_source, worker_from, client_rate,
 *             client_coef, client_from, worker_cost, client_revenue, profit }>, worker_cost: number,
 *             client_revenue: number, profit: number }}
 *   `lines` sadrži samo vrste sa satima > 0; worker_source je "special" (posebna satnica) ili "coef" (tarifa × koeficijent);
 *   worker_from / client_from = vrsta čiji je koeficijent (ili posebna satnica) primenjen — za „praznik vikendom"
 *   praznik ili vikend, za ostale ista vrsta.
 * @throws {MissingCoefficientError} koeficijent koji fali za vrstu sa satima > 0 (za „praznik vikendom": praznik i vikend)
 * @throws {MissingRateError} osnovna tarifa koja fali, a potrebna je
 */
export function timesheetAmountsByType({ hoursByType, workerRate, clientRate, hourTypes, employeePrivate }) {
  const unknown = Object.keys(hoursByType || {}).filter((k) => !CODES.includes(k));
  if (unknown.length) throw new Error(`Nepoznata vrsta sati: ${unknown.join(", ")}`);

  const types = hourTypeMap(hourTypes);
  const baseWorker = rateOf(workerRate);
  const baseClient = rateOf(clientRate);
  const missingCoefs = [];
  const missingRates = [];
  const plans = [];
  const noteCoef = (code, side) => {
    if (!missingCoefs.some((m) => m.code === code && m.side === side)) missingCoefs.push({ code, side });
  };

  for (const code of CODES) {
    const hours = toCents(hoursByType?.[code], code) / 100;
    if (hours === 0) continue; // vrsta bez sati ne traži ni koeficijent ni tarifu

    // „Praznik vikendom" se računa po vrstama praznik i vikend (veća pobeđuje); ostale po sebi.
    const from = code === HOUR_TYPES.HOLIDAY_WEEKEND ? HOLIDAY_WEEKEND_FROM : [code];
    const worker = from.map((c) => workerTerms(c, types, employeePrivate, baseWorker));
    const client = from.map((c) => ({ code: c, coef: validCoef(types.get(c)?.client_coef) }));

    // Isti redosled poruke kao u bazi: po vrsti, prvo radnik pa klijent.
    worker.forEach((w, i) => {
      if (w.special === null && w.coef === null) noteCoef(w.code, "worker");
      if (w.special === null && baseWorker === null) missingRates.push("workerRate");
      if (client[i].coef === null) noteCoef(client[i].code, "client");
    });
    if (baseClient === null) missingRates.push("clientRate");

    plans.push({ code, hours, worker, client });
  }

  if (missingCoefs.length) throw new MissingCoefficientError(missingCoefs);
  if (missingRates.length) {
    throw new MissingRateError([...new Set(missingRates)].map((field) => ({ field, key: "satnica" })));
  }

  const lines = plans.map(({ code, hours, worker, client }) => {
    const w = higher(worker, (x) => x.perHour);
    const c = higher(client, (x) => x.coef);
    const worker_cost = w.special !== null ? round2(hours * w.special) : round2(hours * baseWorker * w.coef);
    const client_revenue = round2(hours * baseClient * c.coef);
    return {
      code,
      hours,
      worker_rate: w.special ?? baseWorker,
      worker_coef: w.coef,
      worker_source: w.special !== null ? "special" : "coef",
      worker_from: w.code,
      client_rate: baseClient,
      client_coef: c.coef,
      client_from: c.code,
      worker_cost,
      client_revenue,
      profit: round2(client_revenue - worker_cost),
    };
  });

  const worker_cost = sum2(lines.map((l) => l.worker_cost));
  const client_revenue = sum2(lines.map((l) => l.client_revenue));
  return { lines, worker_cost, client_revenue, profit: round2(client_revenue - worker_cost) };
}
