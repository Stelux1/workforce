import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  startOfISOWeek,
  startOfMonth,
} from "date-fns";

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const WEEKDAY_LABELS = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  rs: ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"], sk: ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"],
};

export const MONTH_LABELS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  rs: ["Januar", "Februar", "Mart", "April", "Maj", "Jun", "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar"], sk: ["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"],
};

export const dateKey = (d) => format(d, "yyyy-MM-dd");

export const weekKey = (isoYear, isoWeek) => `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;

// Monday of the given ISO week / year
export function isoWeekMonday(year, week) {
  return addDays(startOfISOWeek(new Date(year, 0, 4)), (week - 1) * 7);
}

export function isoWeeksInYear(year) {
  return getISOWeek(new Date(year, 11, 28));
}

export function resolveRange({ periodType, year, weekFrom, weekTo, month, dateFrom, dateTo }) {
  if (periodType === "custom") {
    // Prazan ili nepotpun datum (brisanje u polju) ne sme da obori stranicu (QA §9.3 #10):
    // koristi se drugi datum, a ako fale oba — tekući mesec.
    const ok = (d) => d instanceof Date && !Number.isNaN(d.getTime());
    let a = dateFrom ? parseISO(dateFrom) : null;
    let b = dateTo ? parseISO(dateTo) : null;
    if (!ok(a) && !ok(b)) return { start: startOfMonth(new Date()), end: endOfMonth(new Date()) };
    if (!ok(a)) a = b;
    if (!ok(b)) b = a;
    return a <= b ? { start: a, end: b } : { start: b, end: a };
  }
  if (periodType === "month") {
    const d = new Date(year, month, 1);
    return { start: startOfMonth(d), end: endOfMonth(d) };
  }
  const maxWeek = isoWeeksInYear(year);
  const from = Math.min(Math.max(1, Math.min(weekFrom, weekTo)), maxWeek);
  const to = Math.min(Math.max(1, Math.max(weekFrom, weekTo)), maxWeek);
  return { start: isoWeekMonday(year, from), end: addDays(isoWeekMonday(year, to), 6) };
}

export function buildDateColumns(start, end) {
  return eachDayOfInterval({ start, end }).map((date) => {
    const dow = (date.getDay() + 6) % 7; // 0 = Monday
    return {
      key: dateKey(date),
      date,
      dow,
      isoWeek: getISOWeek(date),
      isoYear: getISOWeekYear(date),
      isWeekend: dow >= 5,
    };
  });
}

export function buildWeekColumns(dateColumns) {
  const map = new Map();
  dateColumns.forEach((c) => {
    const key = weekKey(c.isoYear, c.isoWeek);
    if (!map.has(key)) map.set(key, { key, isoWeek: c.isoWeek, isoYear: c.isoYear, dates: [] });
    map.get(key).dates.push(c);
  });
  return [...map.values()];
}

/**
 * Historical vendor attribution: rows recorded after the vendor model was introduced
 * carry a vendor_name snapshot; legacy rows fall back to the client name they were
 * saved with, which is the only company recorded at the time.
 */
export const vendorOf = (ts) => ts.vendor_name || ts.client_name || "";

/**
 * Aggregates timesheet rows into one entry per employee + vendor.
 * `null` cells = no recorded data, `0` = a zero was actually recorded.
 */
export function computeEntries({ timesheets, employees, dateColumns, vendorFilter, projectFilter, search }) {
  const empById = new Map((employees || []).map((e) => [e.id, e]));
  const inRange = new Set(dateColumns.map((c) => c.key));
  const q = (search || "").trim().toLowerCase();
  const map = new Map();

  (timesheets || []).forEach((ts) => {
    if (vendorFilter !== "all" && vendorOf(ts) !== vendorFilter) return;
    if (projectFilter !== "all" && (ts.project || "") !== projectFilter) return;
    if (!ts.week_start) return;

    const emp = empById.get(ts.employee_id);
    const number = emp?.employee_id || "";
    const name = emp
      ? `${emp.last_name || ""} ${emp.first_name || ""}`.trim()
      : ts.employee_name || "—";

    if (q && !`${name} ${number}`.toLowerCase().includes(q)) return;

    const vendor = vendorOf(ts);
    const employeeKey = ts.employee_id || `name:${ts.employee_name || "unknown"}`;
    const groupKey = `${vendor}||${employeeKey}`;

    let entry = map.get(groupKey);
    if (!entry) {
      entry = { vendor, employeeKey, number, name, daily: {}, weekly: {} };
      map.set(groupKey, entry);
    }
    if (!entry.number && number) entry.number = number;

    const weekStart = parseISO(ts.week_start);
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const dk = dateKey(d);
      if (!inRange.has(dk)) continue;
      const raw = ts[`${WEEKDAY_KEYS[i]}_hours`];
      if (raw === undefined || raw === null || raw === "") continue;
      const v = Number(raw);
      if (Number.isNaN(v)) continue;
      entry.daily[dk] = (entry.daily[dk] ?? 0) + v;
      const wk = weekKey(getISOWeekYear(d), getISOWeek(d));
      entry.weekly[wk] = (entry.weekly[wk] ?? 0) + v;
    }
  });

  return [...map.values()];
}

const sumOrNull = (values) => {
  const present = values.filter((v) => v !== null && v !== undefined);
  return present.length ? present.reduce((s, v) => s + v, 0) : null;
};

const SORTERS = {
  name_asc: (a, b) => a.name.localeCompare(b.name, "sr"),
  name_desc: (a, b) => b.name.localeCompare(a.name, "sr"),
  number_asc: (a, b) => (a.number || "zzz").localeCompare(b.number || "zzz", undefined, { numeric: true }),
  total_desc: (a, b) => b.total - a.total,
  total_asc: (a, b) => a.total - b.total,
};

export function buildView({ entries, columns, viewMode, sort }) {
  const field = viewMode === "daily" ? "daily" : "weekly";
  const rows = entries.map((e) => {
    const cells = columns.map((c) => (e[field][c.key] ?? null));
    const total = cells.reduce((s, v) => s + (v ?? 0), 0);
    return { ...e, cells, total };
  });

  const cmp = SORTERS[sort] || SORTERS.name_asc;

  const byVendor = new Map();
  rows.forEach((r) => {
    if (!byVendor.has(r.vendor)) byVendor.set(r.vendor, []);
    byVendor.get(r.vendor).push(r);
  });

  const vendorGroups = [...byVendor.entries()]
    .map(([vendor, list]) => {
      list.sort(cmp);
      return {
        vendor,
        rows: list,
        employeeCount: list.length,
        columnTotals: columns.map((_, i) => sumOrNull(list.map((r) => r.cells[i]))),
        total: list.reduce((s, r) => s + r.total, 0),
      };
    })
    .sort((a, b) => (a.vendor || "~").localeCompare(b.vendor || "~", "sr"));

  return {
    vendorGroups,
    columnTotals: columns.map((_, i) => sumOrNull(rows.map((r) => r.cells[i]))),
    grandTotal: rows.reduce((s, r) => s + r.total, 0),
    employeeCount: new Set(rows.map((r) => r.employeeKey)).size,
    vendorCount: vendorGroups.length,
  };
}

export const formatHours = (v) => {
  if (v === null || v === undefined) return "";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};