// Satnica po danu (Phase 7, T-A2, docs/TEAMORA-DATA-MODEL.md §2.6). Čiste funkcije — ništa se ne čita iz baze.
//
// Nedeljni red (radnik × projekat × dodela × nedelja) ostaje jedinica unosa i odobravanja, ali novac se računa PO
// DATUMU RADA (K12, spec T07): svaki dan ima svoju vrstu sati, tarifu koja važi tog dana i koeficijent. To je jedan
// izvor dnevnih linija za mesečni obračun (payrollMonth.js), finansijsko jezgro (src/lib/finance, T-E) i izveštaje.
//
// Snimak odobrene satnice (rate_snapshot):
//  * v2 (`version: 2`, upisuje baza od migracije 20261125040000) — `days` su gotove dnevne linije
//    { date, code, hours, worker: { rate, currency, source, ref, coef, from? }, client: {…}, worker_cost, client_revenue };
//  * v1 (bez `version`, odobreno ranije) — tarife i koeficijenti po vrsti sati u `lines`, a dan se razvrstava po pragu
//    i praznicima iz snimka (classifyWeek). v1 snimci se ne menjaju (D10) i daju iste iznose kao pre.
// Isto pravilo je u bazi (labor_day_lines / labor_day_problems).

import { round2 } from "./money.js";
import { classifyWeek, HOUR_TYPE_ORDER, HOUR_TYPES } from "./hours.js";
import { validRate } from "./timesheet.js";

export const DAY_FIELDS = Object.freeze(["mon_hours", "tue_hours", "wed_hours", "thu_hours", "fri_hours", "sat_hours", "sun_hours"]);

/** Problemi dnevnih linija — iste šifre kao PROBLEM u payrollMonth.js (poruke su tamo). */
export const DAY_PROBLEM = Object.freeze({
  NO_SNAPSHOT: "no_snapshot",
  SNAPSHOT_MISMATCH: "snapshot_mismatch",
  MISSING_RATE: "missing_rate",
  MISSING_COEF: "missing_coef",
  NO_PROJECT: "no_project",
  BAD_HOURS: "bad_hours",
  NO_ESTIMATE: "no_estimate",
});

const day = (v) => (v ? String(v).slice(0, 10) : "");

/** "YYYY-MM-DD" + n dana, u UTC da vremenska zona ne pomeri dan. */
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sati po danu pon–ned kao brojevi (prazno = 0). */
function dayHoursOf(row) {
  return DAY_FIELDS.map((f) => {
    const n = Number.parseFloat(row?.[f]);
    return Number.isFinite(n) ? round2(n) : 0;
  });
}

function coefOf(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null; // prazan koeficijent NIJE 1,00 (D5)
}

const currencyOf = (v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);

/** Da li je datum u opsegu [from, to] (oba opciona, "YYYY-MM-DD"). */
const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

/** Verzija snimka: 2 za nov oblik, 1 za stari (bez `version`), null kad snimka nema. */
export function snapshotVersion(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  return Number(snapshot.version) === 2 ? 2 : 1;
}

// ───────────────────────── v1: dan iz `lines` po vrsti sati ─────────────────────────
/** Strana radnika iz v1 linije: posebna satnica iz profila zamenjuje tarifu × koeficijent (D5), pa je množilac 1. */
function v1Worker(line) {
  if (line?.worker_source === "special") return { rate: validRate(line.special_rate ?? line.worker_rate), coef: 1 };
  return { rate: validRate(line?.worker_rate), coef: coefOf(line?.worker_coef) };
}
const v1Client = (line) => ({ rate: validRate(line?.client_rate), coef: coefOf(line?.client_coef) });

function v1Lines(row, snap, dayHours, wanted, out) {
  const weekStart = day(row.week_start);
  const threshold = Number(snap.daily_regular_hours);
  if (!Array.isArray(snap.lines) || !(threshold > 0)) {
    out.problems.push({ code: DAY_PROBLEM.NO_SNAPSHOT });
    return;
  }
  const holidays = Array.isArray(snap.holidays) ? snap.holidays : [];
  const byCode = new Map(snap.lines.filter(Boolean).map((l) => [l.code, l]));
  // Snimak bez linije „praznik vikendom" je odobren po starom pravilu (praznik vikendom = praznik) ili nema takvih
  // sati — u oba slučaja dan se deli kao praznik, pa odobrene satnice i obračuni ostaju isti (D10).
  const holidayWeekend = byCode.has(HOUR_TYPES.HOLIDAY_WEEKEND);

  // Cela nedelja po pravilima iz snimka mora da da iste sate po vrsti kao pri odobravanju.
  let week;
  try {
    week = classifyWeek({ weekStart, dayHours, holidays, dailyThreshold: threshold, holidayWeekend });
  } catch (e) {
    out.problems.push({ code: DAY_PROBLEM.BAD_HOURS, detail: e.message });
    return;
  }
  if (HOUR_TYPE_ORDER.some((code) => round2(week[code]) !== round2(Number(byCode.get(code)?.hours ?? 0)))) {
    out.problems.push({ code: DAY_PROBLEM.SNAPSHOT_MISMATCH });
    return;
  }

  const missingRates = [];
  const missingCoefs = [];
  const note = (list, code, side) => {
    if (!list.some((m) => m.code === code && m.side === side)) list.push({ code, side });
  };

  for (const d of wanted) {
    const one = [0, 0, 0, 0, 0, 0, 0];
    one[d.i] = d.hours;
    const types = classifyWeek({ weekStart, dayHours: one, holidays, dailyThreshold: threshold, holidayWeekend });
    for (const code of HOUR_TYPE_ORDER) {
      const hours = types[code];
      if (!(hours > 0)) continue;
      const line = byCode.get(code);
      const w = v1Worker(line);
      const c = v1Client(line);
      if (w.rate === null) note(missingRates, code, "worker");
      if (w.coef === null) note(missingCoefs, code, "worker");
      if (c.rate === null) note(missingRates, code, "client");
      if (c.coef === null) note(missingCoefs, code, "client");
      out.lines.push(lineOf(row, d.date, code, hours, {
        workerRate: w.rate, workerCoef: w.coef, workerCurrency: "EUR", workerSource: line?.worker_source === "special" ? "special" : "v1",
        clientRate: c.rate, clientCoef: c.coef, clientCurrency: "EUR", clientSource: "v1", projectRoleId: null,
      }));
    }
  }
  if (missingRates.length) out.problems.push({ code: DAY_PROBLEM.MISSING_RATE, missing: missingRates });
  if (missingCoefs.length) out.problems.push({ code: DAY_PROBLEM.MISSING_COEF, missing: missingCoefs });
}

// ───────────────────────── v2 (i procena): gotove dnevne linije ─────────────────────────
function v2Lines(row, days, dayHours, wanted, out, { checkHours }) {
  if (!Array.isArray(days)) {
    out.problems.push({ code: DAY_PROBLEM.NO_SNAPSHOT });
    return;
  }
  const weekStart = day(row.week_start);
  // Sati po danu u snimku moraju biti sati reda (kao provera v1 snimka).
  if (checkHours) {
    const byDate = new Map();
    for (const d of days) byDate.set(day(d?.date), round2((byDate.get(day(d?.date)) || 0) + Number(d?.hours || 0)));
    const mismatch = dayHours.some((h, i) => round2(byDate.get(addDays(weekStart, i)) || 0) !== h)
      || [...byDate.keys()].some((date) => date < weekStart || date > addDays(weekStart, 6));
    if (mismatch) {
      out.problems.push({ code: DAY_PROBLEM.SNAPSHOT_MISMATCH });
      return;
    }
  }
  const wantedDates = new Set(wanted.map((d) => d.date));
  const missingRates = [];
  const missingCoefs = [];
  const note = (list, code, side) => {
    if (!list.some((m) => m.code === code && m.side === side)) list.push({ code, side });
  };
  for (const d of days) {
    const date = day(d?.date);
    const hours = round2(Number(d?.hours || 0));
    if (!wantedDates.has(date) || !(hours > 0)) continue;
    const w = d.worker || {};
    const c = d.client || {};
    const workerRate = validRate(w.rate);
    const clientRate = validRate(c.rate);
    const workerCoef = coefOf(w.coef);
    const clientCoef = coefOf(c.coef);
    if (workerRate === null) note(missingRates, d.code, "worker");
    if (workerCoef === null) note(missingCoefs, d.code, "worker");
    if (clientRate === null) note(missingRates, d.code, "client");
    if (clientCoef === null) note(missingCoefs, d.code, "client");
    out.lines.push(lineOf(row, date, d.code, hours, {
      workerRate, workerCoef, workerCurrency: currencyOf(w.currency), workerSource: w.source ?? null,
      clientRate, clientCoef, clientCurrency: currencyOf(c.currency), clientSource: c.source ?? null,
      projectRoleId: d.project_role_id ?? null,
    }));
  }
  if (missingRates.length) out.problems.push({ code: DAY_PROBLEM.MISSING_RATE, missing: missingRates });
  if (missingCoefs.length) out.problems.push({ code: DAY_PROBLEM.MISSING_COEF, missing: missingCoefs });
}

function lineOf(row, date, hourType, hours, side) {
  return {
    date,
    projectId: row.project_id,
    employeeId: row.employee_id,
    assignmentId: row.assignment_id ?? null,
    projectRoleId: side.projectRoleId,
    hourType,
    hours,
    workerRate: side.workerRate,
    workerCoef: side.workerCoef,
    workerCurrency: side.workerCurrency,
    workerSource: side.workerSource,
    clientRate: side.clientRate,
    clientCoef: side.clientCoef,
    clientCurrency: side.clientCurrency,
    clientSource: side.clientSource,
    timesheetId: row.id,
    weekStart: day(row.week_start),
  };
}

/**
 * Dnevne linije jedne satnice: sati po datumu i vrsti, sa tarifom, koeficijentom i valutom svake strane.
 * Odobren red čita snimak (v1 ili v2). Neodobren red nema konačne linije; uz `estimate: true` daje procenu iz
 * `estimate_days` (spec §6.04 — uvek odvojeno, nikad u konačnim KPI-jevima).
 * @param {object} row  red timesheets (approval_status, week_start, mon_hours … sun_hours, project_id, employee_id,
 *                      assignment_id, rate_snapshot, estimate_days)
 * @param {object} [opts]
 * @param {string} [opts.from]     prvi datum ("YYYY-MM-DD"), uključivo
 * @param {string} [opts.to]       poslednji datum, uključivo
 * @param {boolean} [opts.estimate] procena za neodobren red (iz estimate_days)
 * @returns {{ lines: Array<{ date, projectId, employeeId, assignmentId, projectRoleId, hourType, hours, workerRate,
 *   workerCoef, workerCurrency, workerSource, clientRate, clientCoef, clientCurrency, clientSource, timesheetId,
 *   weekStart }>, problems: Array<{ code, missing?, detail? }>, days: string[] }}
 *   `days` su datumi u opsegu sa satima > 0 (i kad satnica ima problem). Problem u opsegu → `lines` je prazan
 *   (nikad delimičan iznos, D11).
 */
export function timesheetDayLines(row, { from, to, estimate = false } = {}) {
  const out = { lines: [], problems: [], days: [] };
  const weekStart = day(row?.week_start);
  const dayHours = dayHoursOf(row);
  const wanted = dayHours
    .map((hours, i) => ({ i, hours, date: weekStart ? addDays(weekStart, i) : "" }))
    .filter((d) => d.hours > 0 && d.date && inRange(d.date, from, to));
  out.days = wanted.map((d) => d.date);
  if (!wanted.length) return out;

  const approved = row.approval_status === "approved";
  if (!approved && !estimate) return out; // samo odobreni sati su konačni (T09)

  if (!row.project_id) {
    out.problems.push({ code: DAY_PROBLEM.NO_PROJECT });
    return out;
  }

  if (approved) {
    const snap = row.rate_snapshot;
    const version = snapshotVersion(snap);
    if (version === null) out.problems.push({ code: DAY_PROBLEM.NO_SNAPSHOT });
    else if (version === 2) v2Lines(row, snap.days, dayHours, wanted, out, { checkHours: true });
    else v1Lines(row, snap, dayHours, wanted, out);
  } else if (!Array.isArray(row.estimate_days)) {
    out.problems.push({ code: DAY_PROBLEM.NO_ESTIMATE });
  } else {
    v2Lines(row, row.estimate_days, dayHours, wanted, out, { checkHours: false });
  }

  if (out.problems.length) out.lines = [];
  return out;
}

// ───────────────────────── intervali rada (timesheet_entries, spec §6, T10) ─────────────────────────
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** "HH:MM[:SS]" → minuti od ponoći, ili null. */
export function timeMinutes(value) {
  const m = TIME_RE.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Interval jednog unosa kao [start, end) u minutima od 1.1.1970 (UTC, bez vremenske zone — isto kao tsrange u bazi).
 * Kraj ≤ početak znači da rad prelazi ponoć (noćna smena). Bez početka ili kraja → null (samo broj sati).
 * @param {{ work_date: string, start_time?: string, end_time?: string }} entry
 * @returns {{ start: number, end: number } | null}
 */
export function dayInterval(entry) {
  const date = day(entry?.work_date);
  const s = timeMinutes(entry?.start_time);
  const e = timeMinutes(entry?.end_time);
  if (!date || s === null || e === null) return null;
  const base = Date.parse(`${date}T00:00:00Z`) / 60000;
  if (!Number.isFinite(base)) return null;
  return { start: base + s, end: base + e + (e <= s ? 24 * 60 : 0) };
}

/** Sati unosa iz vremena: trajanje − pauza, zaokruženo na cent sata; bez vremena → upisani sati. */
export function entryHours(entry) {
  const iv = dayInterval(entry);
  if (!iv) {
    const n = Number(entry?.hours);
    return Number.isFinite(n) ? round2(n) : null;
  }
  const pause = Number(entry?.break_minutes) || 0;
  return round2((iv.end - iv.start - pause) / 60);
}

const asInterval = (x) => (x && Number.isFinite(x.start) && Number.isFinite(x.end) ? x : dayInterval(x));

/** Da li se dva unosa (ili intervala) preklapaju; [a, b) — kraj jednog = početak drugog nije preklapanje. */
export function overlaps(a, b) {
  const x = asInterval(a);
  const y = asInterval(b);
  if (!x || !y) return false;
  return x.start < y.end && y.start < x.end;
}

/**
 * Dnevni zbir sati po radniku i datumu, preko svih projekata (spec §6: bez neprihvatljivog zbira). Odbijene satnice
 * se ne broje (isto kao u bazi).
 * @param {Array} rows redovi timesheets
 * @returns {Array<{ employeeId, date, hours, projectIds: string[], timesheetIds: string[] }>} sortirano po radniku i datumu
 */
export function dailyTotals(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row || row.approval_status === "rejected") continue;
    const weekStart = day(row.week_start);
    if (!weekStart) continue;
    dayHoursOf(row).forEach((h, i) => {
      if (!(h > 0)) return;
      const date = addDays(weekStart, i);
      const key = `${row.employee_id}|${date}`;
      const t = map.get(key) || { employeeId: row.employee_id, date, hours: 0, projectIds: [], timesheetIds: [] };
      t.hours = round2(t.hours + h);
      if (row.project_id && !t.projectIds.includes(row.project_id)) t.projectIds.push(row.project_id);
      if (row.id) t.timesheetIds.push(row.id);
      map.set(key, t);
    });
  }
  return [...map.values()].sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId)) || a.date.localeCompare(b.date));
}

/** Dani na kojima zbir prelazi dozvoljeni maksimum (work_rules.max_daily_hours, podrazumevano 24). */
export function dailyLimitViolations(rows, maxDailyHours = 24) {
  const max = Number(maxDailyHours) > 0 ? Number(maxDailyHours) : 24;
  return dailyTotals(rows).filter((t) => t.hours > max);
}

/** Parovi unosa istog radnika koji se preklapaju (odbijene satnice ne učestvuju — `counts === false`). */
export function overlappingEntries(entries) {
  const list = (entries || []).filter((e) => e && e.counts !== false && dayInterval(e));
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (list[i].employee_id === list[j].employee_id && overlaps(list[i], list[j])) out.push([list[i], list[j]]);
    }
  }
  return out;
}
