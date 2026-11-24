// Mesečni obračun iz odobrenih nedeljnih satnica (Faza 3, D17). Čiste funkcije — ništa se ne čita iz baze.
//
// Satnica je nedeljna (pon–ned, D5/D12), a obračun mesečni: nedelja koja prelazi u drugi mesec deli se PO DANU
// (datum rada), pa svaki mesec dobija tačno svoje dane — i sate i iznose. Svaki dan se razvrstava istim pravilom
// kao pri odobravanju (classifyWeek: praznik vikendom → praznik → vikend → preko praga prekovremeno → redovno), ali sa pragom
// i praznicima iz snimka odobrene satnice (rate_snapshot), a tarife, koeficijenti i posebne satnice po vrsti sati
// takođe iz snimka — nikad trenutne tarife (D10). Kasnija promena tarife, koeficijenta, praga ili praznika zato ne
// menja obračun.
//
// Samo ODOBRENE satnice ulaze u obračun. Satnica bez snimka (odobrena pre Faze 2), tarifa ili koeficijent koji fali
// u snimku, satnica čiji sati ne odgovaraju snimku i radnik bez angažmana (zaposlen / preko podizvođača) su problemi
// sa jasnom porukom (radnik, nedelja, projekat) — nikad tiho 0 ili 1,00 (D5, D11). Problem je i isplata manja od nule
// i bruto satnica ispod najniže osnovice (payoutProblems — dok knjigovođa ne potvrdi pravilo za deo meseca). Radnik sa
// problemom nema platni listić; baza ne dozvoljava odobravanje obračuna dok svaki radnik sa odobrenim satima nema listić.
//
// Iznos: computeWorkerMonth (monthly.js) sabira sate po (projekat, vrsta, tarife, koeficijenti) pa množi i zaokružuje
// po grupi; neto/bruto po serbianPayroll.js; trošak (bruto 2 za zaposlenog, iznos sati za podizvođača) se raspodeljuje
// po projektima srazmerno zaradi na projektu (allocate — zbir tačan na cent, ostatak ide po stabilnom redosledu).

import { round2, sum2 } from "./money.js";
import { computeWorkerMonth, ENGAGEMENT, MissingRateError, RATE_BASIS } from "./monthly.js";
import { HOUR_TYPE_ORDER } from "./hours.js";
import { paramsInEur } from "./params.js";
import { DAY_PROBLEM, timesheetDayLines } from "./timesheetDays.js";

const TYPE_ORDER = HOUR_TYPE_ORDER;
const TYPE_LABEL = Object.freeze({
  rs: { redovni: "redovni", prekovremeni: "prekovremeni", vikend: "vikend", praznik: "praznik", praznik_vikend: "praznik vikendom" },
  sk: { redovni: "bežné", prekovremeni: "nadčas", vikend: "víkend", praznik: "sviatok", praznik_vikend: "sviatok cez víkend" },
  en: { redovni: "regular", prekovremeni: "overtime", vikend: "weekend", praznik: "holiday", praznik_vikend: "holiday on weekend" },
});

/** Angažman iz employment_history → engagement za computeWorkerMonth. */
export const ENGAGEMENT_OF = Object.freeze({
  direct_employee: ENGAGEMENT.EMPLOYEE,
  subcontractor_worker: ENGAGEMENT.SUBCONTRACTOR,
});

/** Upozorenja na platnom listiću (payslips.warnings) — šifre, tekst daje warningLabel. */
export const PAYSLIP_WARNINGS = Object.freeze({
  BELOW_MIN_BASE: "ispod_najnize_osnovice",
  ABOVE_MAX_BASE: "iznad_najvise_osnovice",
  NEGATIVE_NET: "negativan_neto",
  NET_NOT_EXACT: "neto_nije_tacan",
});

const WARNING_TEXT = {
  rs: {
    [PAYSLIP_WARNINGS.BELOW_MIN_BASE]: "zarada ispod najniže osnovice — doprinosi na najnižu osnovicu",
    [PAYSLIP_WARNINGS.ABOVE_MAX_BASE]: "zarada iznad najviše osnovice — doprinosi na najvišu osnovicu",
    [PAYSLIP_WARNINGS.NEGATIVE_NET]: "neto je negativan",
    [PAYSLIP_WARNINGS.NET_NOT_EXACT]: "neto se zbog zaokruživanja razlikuje za 1 cent",
  },
  sk: {
    [PAYSLIP_WARNINGS.BELOW_MIN_BASE]: "mzda pod minimálnym vymeriavacím základom — odvody z minimálneho základu",
    [PAYSLIP_WARNINGS.ABOVE_MAX_BASE]: "mzda nad maximálnym vymeriavacím základom — odvody z maximálneho základu",
    [PAYSLIP_WARNINGS.NEGATIVE_NET]: "čistá mzda je záporná",
    [PAYSLIP_WARNINGS.NET_NOT_EXACT]: "čistá mzda sa kvôli zaokrúhleniu líši o 1 cent",
  },
  en: {
    [PAYSLIP_WARNINGS.BELOW_MIN_BASE]: "pay below the minimum base — contributions on the minimum base",
    [PAYSLIP_WARNINGS.ABOVE_MAX_BASE]: "pay above the maximum base — contributions on the maximum base",
    [PAYSLIP_WARNINGS.NEGATIVE_NET]: "net pay is negative",
    [PAYSLIP_WARNINGS.NET_NOT_EXACT]: "net differs by 1 cent due to rounding",
  },
};

export const warningLabel = (code, lang = "rs") => (WARNING_TEXT[lang] || WARNING_TEXT.rs)[code] || code;

// ───────────────────────── datumi ─────────────────────────
const day = (v) => (v ? String(v).slice(0, 10) : "");

/** "YYYY-MM-DD" + n dana, u UTC da vremenska zona ne pomeri dan (isto kao hours.js). */
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Prvi dan meseca "YYYY-MM-01" iz "YYYY-MM" ili bilo kog datuma u mesecu. */
export function monthStart(value) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(value ?? ""));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`Neispravan mesec obračuna: ${value}`);
  return `${m[1]}-${m[2]}-01`;
}

/** Prvi dan sledećeg meseca. */
export function nextMonthStart(month) {
  const s = monthStart(month);
  const y = Number(s.slice(0, 4));
  const mo = Number(s.slice(5, 7));
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
}

/** Poslednji dan meseca. */
export const monthEnd = (month) => addDays(nextMonthStart(month), -1);

/**
 * Opseg `week_start` satnica koje zalaze u mesec: nedelja koja počne do 6 dana pre prvog dana meseca ima dane u
 * mesecu, a poslednja je ona koja počne najkasnije poslednjeg dana meseca.
 */
export function timesheetWeekRange(month) {
  const start = monthStart(month);
  return { from: addDays(start, -6), to: monthEnd(start) };
}

/** "DD.MM.YYYY" za poruke. */
export const formatDay = (iso) => {
  const d = day(iso);
  return d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "";
};

// ───────────────────────── problemi ─────────────────────────
export const PROBLEM = Object.freeze({
  ...DAY_PROBLEM, // no_snapshot, snapshot_mismatch, missing_rate, missing_coef, no_project, bad_hours, no_estimate
  RATE_NOT_EUR: "rate_not_eur", // srpski obračun prima samo EUR tarife (D7, K3)
  NO_ENGAGEMENT: "no_engagement",
  ENGAGEMENT_CHANGES: "engagement_changes",
  CALC_ERROR: "calc_error",
  // Isplata koja se ne pravi (QA 14.11.2026, P1) — ista pravila proverava baza (payroll_run_problems).
  NEGATIVE_PAYOUT: "negative_payout",
  GROSS_BELOW_MIN_BASE: "gross_below_min_base",
});

const SIDE_LABEL = { rs: { worker: "radnika", client: "klijenta" },
  sk: { worker: "zamestnanca", client: "klienta" }, en: { worker: "worker", client: "client" } };

/** Iznos u poruci: „192,00 €" (srpski) / „€192.00" (engleski). */
const eurText = (n, lang = "rs") => {
  const s = round2(n).toFixed(2);
  return lang === "en" ? `€${s}` : `${s.replace(".", ",")} €`;
};

const PROBLEM_TEXT = {
  rs: {
    [PROBLEM.NO_SNAPSHOT]: () =>
      "satnica je odobrena bez snimka tarifa i koeficijenata (pre razvrstavanja po vrstama sati) — vratite je u nacrt i odobrite ponovo",
    [PROBLEM.SNAPSHOT_MISMATCH]: () => "sati u satnici ne odgovaraju snimku iz odobravanja — vratite je u nacrt i odobrite ponovo",
    [PROBLEM.MISSING_RATE]: (p) =>
      `u snimku nedostaje tarifa ${p.missing.map((m) => `${SIDE_LABEL.rs[m.side]} (${TYPE_LABEL.rs[m.code] || m.code})`).join(", ")} — vratite satnicu u nacrt i odobrite ponovo`,
    [PROBLEM.MISSING_COEF]: (p) =>
      `u snimku nedostaje koeficijent ${p.missing.map((m) => `${SIDE_LABEL.rs[m.side]} (${TYPE_LABEL.rs[m.code] || m.code})`).join(", ")} — vratite satnicu u nacrt i odobrite ponovo`,
    [PROBLEM.NO_PROJECT]: () => "satnica nije vezana za projekat sa liste",
    [PROBLEM.RATE_NOT_EUR]: (p) =>
      `tarifa je u valuti ${p.currencies.join(", ")} — mesečni obračun (neto/bruto) prima samo EUR tarife; obaveza za ove sate ide kroz Payables`,
    [PROBLEM.BAD_HOURS]: (p) => `neispravni sati (${p.detail})`,
    [PROBLEM.NO_ENGAGEMENT]: (p) =>
      `nema angažman (zaposlen ili preko podizvođača) za ${formatDay(p.date)} — upišite ga u profilu radnika (Angažman)`,
    [PROBLEM.ENGAGEMENT_CHANGES]: (p) =>
      `angažman se menja u toku meseca (${formatDay(p.date)}) — obračun u v1 ne podržava promenu angažmana u toku meseca`,
    [PROBLEM.CALC_ERROR]: (p) => `obračun nije moguć (${p.detail})`,
    [PROBLEM.NEGATIVE_PAYOUT]: (p) => `isplata bi bila negativna (${eurText(p.payout)}) — iznos manji od nule se ne isplaćuje`,
    [PROBLEM.GROSS_BELOW_MIN_BASE]: (p) =>
      `zarada po bruto satnici (${eurText(p.bruto)}) je ispod najniže osnovice (${eurText(p.minBase)}), a doprinosi na najnižu osnovicu bi isplatu sveli na ${eurText(p.payout)} — knjigovođa mora da potvrdi pravilo (srazmerna osnovica za deo meseca); do tada nema isplate`,
  },
  sk: {
    [PROBLEM.NO_SNAPSHOT]: () =>
      "pracovný výkaz bol schválený bez uloženia sadzieb a koeficientov (pred rozdelením podľa druhov hodín) — vráťte ho do konceptu a schváľte znova",
    [PROBLEM.SNAPSHOT_MISMATCH]: () => "hodiny v pracovnom výkaze nezodpovedajú záznamu zo schválenia — vráťte ho do konceptu a schváľte znova",
    [PROBLEM.MISSING_RATE]: (p) =>
      `v zázname chýba sadzba ${p.missing.map((m) => `${SIDE_LABEL.sk[m.side]} (${TYPE_LABEL.sk[m.code] || m.code})`).join(", ")} — vráťte pracovný výkaz do konceptu a schváľte ho znova`,
    [PROBLEM.MISSING_COEF]: (p) =>
      `v zázname chýba koeficient ${p.missing.map((m) => `${SIDE_LABEL.sk[m.side]} (${TYPE_LABEL.sk[m.code] || m.code})`).join(", ")} — vráťte pracovný výkaz do konceptu a schváľte ho znova`,
    [PROBLEM.NO_PROJECT]: () => "pracovný výkaz nie je prepojený s projektom zo zoznamu",
    [PROBLEM.RATE_NOT_EUR]: (p) =>
      `sadzba je v mene ${p.currencies.join(", ")} — mesačné zúčtovanie (čistá/hrubá mzda) prijíma iba sadzby v EUR; záväzok za tieto hodiny ide cez Payables`,
    [PROBLEM.BAD_HOURS]: (p) => `neplatné hodiny (${p.detail})`,
    [PROBLEM.NO_ENGAGEMENT]: (p) =>
      `žiadny pracovný vzťah (zamestnanec alebo cez subdodávateľa) k dátumu ${formatDay(p.date)} — pridajte ho v profile zamestnanca (Pracovný vzťah)`,
    [PROBLEM.ENGAGEMENT_CHANGES]: (p) =>
      `pracovný vzťah sa počas mesiaca mení (${formatDay(p.date)}) — zúčtovanie v1 nepodporuje zmenu pracovného vzťahu v priebehu mesiaca`,
    [PROBLEM.CALC_ERROR]: (p) => `zúčtovanie sa nedá vypočítať (${p.detail})`,
    [PROBLEM.NEGATIVE_PAYOUT]: (p) => `výplata by bola záporná (${eurText(p.payout, "sk")}) — suma pod nulou sa nevypláca`,
    [PROBLEM.GROSS_BELOW_MIN_BASE]: (p) =>
      `mzda pri hrubej sadzbe (${eurText(p.bruto, "sk")}) je pod minimálnym vymeriavacím základom (${eurText(p.minBase, "sk")}) a odvody z minimálneho základu by znížili výplatu na ${eurText(p.payout, "sk")} — pravidlo musí potvrdiť účtovník (pomerný základ za časť mesiaca); dovtedy sa nevypláca`,
  },
  en: {
    [PROBLEM.NO_SNAPSHOT]: () =>
      "the timesheet was approved without a rate and coefficient snapshot (before hour types) — set it back to draft and approve it again",
    [PROBLEM.SNAPSHOT_MISMATCH]: () => "the timesheet hours don't match its approval snapshot — set it back to draft and approve it again",
    [PROBLEM.MISSING_RATE]: (p) =>
      `the snapshot has no ${p.missing.map((m) => `${SIDE_LABEL.en[m.side]} rate (${TYPE_LABEL.en[m.code] || m.code})`).join(", ")} — set the timesheet back to draft and approve it again`,
    [PROBLEM.MISSING_COEF]: (p) =>
      `the snapshot has no ${p.missing.map((m) => `${SIDE_LABEL.en[m.side]} coefficient (${TYPE_LABEL.en[m.code] || m.code})`).join(", ")} — set the timesheet back to draft and approve it again`,
    [PROBLEM.NO_PROJECT]: () => "the timesheet is not linked to a project from the list",
    [PROBLEM.RATE_NOT_EUR]: (p) =>
      `the rate is in ${p.currencies.join(", ")} — monthly payroll (net/gross) accepts EUR rates only; the payable for these hours goes through Payables`,
    [PROBLEM.BAD_HOURS]: (p) => `invalid hours (${p.detail})`,
    [PROBLEM.NO_ENGAGEMENT]: (p) =>
      `no engagement (employee or via subcontractor) on ${formatDay(p.date)} — add it in the employee profile (Engagement)`,
    [PROBLEM.ENGAGEMENT_CHANGES]: (p) =>
      `the engagement changes during the month (${formatDay(p.date)}) — v1 payroll does not support a change of engagement within a month`,
    [PROBLEM.CALC_ERROR]: (p) => `payroll can't be calculated (${p.detail})`,
    [PROBLEM.NEGATIVE_PAYOUT]: (p) => `the payout would be negative (${eurText(p.payout, "en")}) — an amount below zero is not paid`,
    [PROBLEM.GROSS_BELOW_MIN_BASE]: (p) =>
      `pay at the gross rate (${eurText(p.bruto, "en")}) is below the minimum base (${eurText(p.minBase, "en")}), and contributions on the minimum base would cut the payout to ${eurText(p.payout, "en")} — the accountant must confirm the rule (prorated base for part of the month); no payout until then`,
  },
};

/** Poruka problema: „Radnik, nedelja od DD.MM.YYYY (Projekat): šta fali". */
export function problemMessage(p, lang = "rs") {
  const L = PROBLEM_TEXT[lang] || PROBLEM_TEXT.rs;
  const text = (L[p.code] || (() => p.code))(p);
  const where = p.weekStart
    ? `${lang === "en" ? "week of" : lang === "sk" ? "týždeň od" : "nedelja od"} ${formatDay(p.weekStart)}${p.projectName ? ` (${p.projectName})` : ""}`
    : "";
  return `${p.employeeName}${where ? `, ${where}` : ""}: ${text}`;
}

// ───────────────────────── jedna satnica → linije meseca ─────────────────────────
/**
 * Sati jedne odobrene satnice koji padaju u mesec: dnevne linije iz timesheetDays.js (v1 snimak — razvrstano po pragu
 * i praznicima iz snimka; v2 — gotove linije po datumu rada, K12), filtrirane na mesec.
 * Srpski mesečni obračun prima samo EUR tarife (D7): linija u drugoj valuti je problem `rate_not_eur`.
 * @param {object} row   red timesheets (approval_status, week_start, mon_hours … sun_hours, project_id, rate_snapshot)
 * @param {string} month "YYYY-MM-01" (ili bilo koji datum u mesecu)
 * @returns {{ lines: Array<{ projectId, hourType, hours, workerRate, workerCoef, clientRate, clientCoef, date,
 *             timesheetId, weekStart, … }>, problems: Array<{ code, missing?, detail?, currencies? }>, days: string[] }}
 *   `days` su datumi u mesecu sa satima > 0 (i kad satnica ima problem — za proveru angažmana).
 */
export function timesheetMonthLines(row, month) {
  const start = monthStart(month);
  const out = timesheetDayLines(row, { from: start, to: monthEnd(start) });
  if (!out.problems.length && out.lines.length) {
    const foreign = [...new Set(out.lines.flatMap((l) => [l.workerCurrency, l.clientCurrency]).filter((c) => c && c !== "EUR"))];
    if (foreign.length) return { ...out, lines: [], problems: [{ code: PROBLEM.RATE_NOT_EUR, currencies: foreign }] };
  }
  return out;
}

// ───────────────────────── angažman ─────────────────────────
/** Angažman (employment_history) koji važi na dan; preklapanje zabranjuje baza, pa najnoviji početak pobeđuje. */
function engagementOn(history, employeeId, date) {
  return (
    (history || [])
      .filter((h) => h?.employee_id === employeeId && day(h.start_date) && day(h.start_date) <= date && (!day(h.end_date) || day(h.end_date) >= date))
      .sort((a, b) => day(b.start_date).localeCompare(day(a.start_date)))[0] || null
  );
}

// ───────────────────────── mesec ─────────────────────────
const employeeNameOf = (emp, row) =>
  emp ? `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || emp.employee_id || emp.id : row?.employee_name || row?.employee_id;

const lineOrder = (a, b) =>
  String(a.projectId).localeCompare(String(b.projectId)) ||
  TYPE_ORDER.indexOf(a.hourType) - TYPE_ORDER.indexOf(b.hourType) ||
  a.date.localeCompare(b.date) ||
  String(a.timesheetId).localeCompare(String(b.timesheetId));

/**
 * Sve odobrene satnice meseca po radniku: linije (sati po danu, vrsti, tarifi i koeficijentu iz snimka), angažman
 * i problemi. Ne treba kurs — problemi se vide i pre unosa kursa.
 * @param {object} input
 * @param {string} input.month              "YYYY-MM-01"
 * @param {Array}  input.timesheets          redovi timesheets (neodobreni se preskaču)
 * @param {Array}  [input.employees]         radnici (Employee sa spojenim employee_private: rate_basis, work_fraction)
 * @param {Array}  [input.employmentHistory] redovi employment_history
 * @param {Array}  [input.projects]          projekti (za ime u porukama)
 * @returns {{ month, workers: Array, problems: Array }}
 */
export function collectMonth({ month, timesheets, employees, employmentHistory, projects }) {
  const start = monthStart(month);
  const empById = new Map((employees || []).map((e) => [e.id, e]));
  const projectName = new Map((projects || []).map((p) => [p.id, p.name]));
  const workers = new Map();

  for (const row of timesheets || []) {
    if (row?.approval_status !== "approved") continue; // samo odobrene satnice ulaze u obračun
    const r = timesheetMonthLines(row, start);
    if (!r.days.length) continue;
    const emp = empById.get(row.employee_id);
    let w = workers.get(row.employee_id);
    if (!w) {
      w = { employeeId: row.employee_id, employeeName: employeeNameOf(emp, row), employee: emp || null, lines: [], days: new Set(), problems: [] };
      workers.set(row.employee_id, w);
    }
    r.days.forEach((d) => w.days.add(d));
    w.lines.push(...r.lines);
    for (const p of r.problems) {
      w.problems.push({
        ...p,
        employeeId: w.employeeId,
        employeeName: w.employeeName,
        timesheetId: row.id,
        weekStart: day(row.week_start),
        projectId: row.project_id || null,
        projectName: projectName.get(row.project_id) || row.project || "",
      });
    }
  }

  for (const w of workers.values()) {
    // Angažman svakog dana sa satima: mora da postoji i da bude isti ceo mesec (jedan listić po radniku i mesecu).
    const days = [...w.days].sort();
    let first = null;
    for (const d of days) {
      const h = engagementOn(employmentHistory, w.employeeId, d);
      if (!h) {
        w.problems.push({ code: PROBLEM.NO_ENGAGEMENT, date: d, employeeId: w.employeeId, employeeName: w.employeeName });
        first = null;
        break;
      }
      if (!first) first = h;
      else if (h.engagement_type !== first.engagement_type || (h.vendor_id || null) !== (first.vendor_id || null)) {
        w.problems.push({ code: PROBLEM.ENGAGEMENT_CHANGES, date: d, employeeId: w.employeeId, employeeName: w.employeeName });
        first = null;
        break;
      }
    }
    w.engagementType = first?.engagement_type || null;
    w.vendorId = first?.vendor_id || null;
    w.vendorName = first?.vendor_name || null;
    w.lines.sort(lineOrder); // stabilan redosled → raspodela ostatka centa ne zavisi od redosleda učitavanja
  }

  const list = [...workers.values()].sort(
    (a, b) => String(a.employeeName).localeCompare(String(b.employeeName), "sr") || String(a.employeeId).localeCompare(String(b.employeeId))
  );
  return { month: start, workers: list, problems: list.flatMap((w) => w.problems) };
}

/**
 * Isplata koju obračun ne pravi dok se ne razjasni (QA 14.11.2026, P1), isto kao payroll_run_problems u bazi:
 *  - isplata manja od nule;
 *  - zaposleni sa bruto satnicom čiji je bruto ispod najniže osnovice (srazmerno udelu radnog vremena): doprinosi na
 *    punu najnižu osnovicu daju premalu ili negativnu isplatu, a pravilo za deo meseca (srazmerna osnovica) mora da
 *    potvrdi knjigovođa (D7, D17). Neto satnica ispod osnovice ostaje samo upozorenje — radnik dobija dogovoreni neto.
 * @returns {Array<{ code, payout, bruto?, minBase? }>}
 */
export function payoutProblems(m) {
  const out = [];
  if (m.payout < 0) out.push({ code: PROBLEM.NEGATIVE_PAYOUT, payout: m.payout });
  const c = m.calc;
  if (c && m.engagement === ENGAGEMENT.EMPLOYEE && m.rateBasis === RATE_BASIS.GROSS && c.belowMinBase) {
    // Ispod najniže osnovice doprinosi se računaju baš na nju (srazmerno udelu), pa je to osnovica doprinosa.
    out.push({ code: PROBLEM.GROSS_BELOW_MIN_BASE, payout: m.payout, bruto: c.bruto, minBase: c.contributionBase });
  }
  return out;
}

function warningsOf(calc) {
  if (!calc) return [];
  const w = [];
  if (calc.belowMinBase) w.push(PAYSLIP_WARNINGS.BELOW_MIN_BASE);
  if (calc.aboveMaxBase) w.push(PAYSLIP_WARNINGS.ABOVE_MAX_BASE);
  if (calc.negativeNet) w.push(PAYSLIP_WARNINGS.NEGATIVE_NET);
  if (calc.exactNet === false) w.push(PAYSLIP_WARNINGS.NET_NOT_EXACT);
  return w;
}

/**
 * Platni listići meseca iz odobrenih satnica.
 * @param {object} input            kao collectMonth, plus:
 * @param {number} input.eurRsdRate  kurs EUR/RSD koji je admin uneo za mesec — bez kursa nema obračuna (D2)
 * @param {object} input.params      obračunski parametri u RSD (paramsFromRow / PARAMS_2026_RSD)
 * @returns {{ month, eurRsdRate, params, payslips: Array, problems: Array, projects: Array, totals: object }}
 *   payslips su u obliku tabela payslips + `projects` (payslip_projects); radnik sa problemom nema listić.
 * @throws {Error} bez kursa ili bez parametara obračun ne kreće
 */
export function buildMonthPayroll({ month, eurRsdRate, params, timesheets, employees, employmentHistory, projects }) {
  if (!params) throw new Error("Nema obračunskih parametara (porez i doprinosi)");
  const pe = paramsInEur(params, eurRsdRate); // baca „Kurs EUR/RSD za mesec nije unet"
  const collected = collectMonth({ month, timesheets, employees, employmentHistory, projects });
  const problems = [...collected.problems];
  const payslips = [];

  for (const w of collected.workers) {
    if (w.problems.length) continue;
    const engagement = ENGAGEMENT_OF[w.engagementType];
    const rateBasis = w.employee?.rate_basis || RATE_BASIS.NET; // podrazumevano neto (D4, isto kao kolona u bazi)
    const fraction = Number(w.employee?.work_fraction ?? 1) || 1; // isto kao default kolone work_fraction
    let m;
    try {
      m = computeWorkerMonth({ engagement, rateBasis, lines: w.lines, params: pe, fraction });
    } catch (e) {
      if (!(e instanceof MissingRateError)) throw e;
      problems.push({ code: PROBLEM.CALC_ERROR, employeeId: w.employeeId, employeeName: w.employeeName, detail: e.message });
      continue;
    }
    const blocked = payoutProblems(m);
    if (blocked.length) {
      // Kao i ostali problemi: radnik nema listić, a baza ne odobrava obračun bez njega (nikad tiha isplata).
      problems.push(...blocked.map((p) => ({ ...p, employeeId: w.employeeId, employeeName: w.employeeName })));
      continue;
    }
    const c = m.calc;
    payslips.push({
      employee_id: w.employeeId,
      employee_name: w.employeeName,
      engagement_type: w.engagementType,
      vendor_id: w.vendorId,
      vendor_name: w.vendorName,
      rate_basis: rateBasis,
      work_fraction: fraction,
      total_hours: m.totalHours,
      hours_by_type: m.hoursByType,
      basis_amount: m.basisAmount,
      bruto: c ? c.bruto : null,
      neto: c ? c.neto : null,
      tax: c ? c.tax : null,
      emp_pio: c ? c.employee.pio : null,
      emp_health: c ? c.employee.health : null,
      emp_unemployment: c ? c.employee.unemployment : null,
      er_pio: c ? c.employer.pio : null,
      er_health: c ? c.employer.health : null,
      total_cost: m.laborCost,
      payout: m.payout,
      revenue: m.revenue,
      warnings: warningsOf(c),
      projects: m.projects.map((p) => ({
        project_id: p.projectId,
        hours: p.hours,
        worker_amount: p.workerAmount,
        labor_cost: p.laborCost,
        revenue: p.revenue,
      })),
    });
  }

  return {
    month: collected.month,
    eurRsdRate: Number(eurRsdRate),
    params: pe,
    payslips,
    problems,
    projects: projectTotals(payslips),
    totals: payrollTotals(payslips),
  };
}

/** Zbir po projektu za ceo mesec (iz listića ili iz redova payslip_projects sa `project_id`). */
export function projectTotals(payslips) {
  const map = new Map();
  for (const s of payslips || []) {
    for (const p of s.projects || []) {
      const t = map.get(p.project_id) || { project_id: p.project_id, hours: [], worker_amount: [], labor_cost: [], revenue: [] };
      t.hours.push(p.hours);
      t.worker_amount.push(p.worker_amount);
      t.labor_cost.push(p.labor_cost);
      t.revenue.push(p.revenue);
      map.set(p.project_id, t);
    }
  }
  return [...map.values()]
    .map((t) => ({
      project_id: t.project_id,
      hours: sum2(t.hours),
      worker_amount: sum2(t.worker_amount),
      labor_cost: sum2(t.labor_cost),
      revenue: sum2(t.revenue),
      difference: round2(sum2(t.revenue) - sum2(t.labor_cost)),
    }))
    .sort((a, b) => String(a.project_id).localeCompare(String(b.project_id)));
}

const sumOf = (rows, field) => sum2((rows || []).map((r) => (r[field] === null || r[field] === undefined ? 0 : r[field])));

/** Zbirovi meseca: sati, neto za isplatu, porez, doprinosi, bruto, bruto 2 (trošak), zarada, prihod i razlika. */
export function payrollTotals(payslips) {
  const rows = payslips || [];
  const out = {
    hours: sumOf(rows, "total_hours"),
    payout: sumOf(rows, "payout"),
    neto: sumOf(rows, "neto"),
    bruto: sumOf(rows, "bruto"),
    tax: sumOf(rows, "tax"),
    employeeContributions: sum2(["emp_pio", "emp_health", "emp_unemployment"].map((f) => sumOf(rows, f))),
    employerContributions: sum2(["er_pio", "er_health"].map((f) => sumOf(rows, f))),
    totalCost: sumOf(rows, "total_cost"),
    basis: sumOf(rows, "basis_amount"),
    revenue: sum2(rows.map((s) => sumOf(s.projects, "revenue"))),
    allocated: sum2(rows.map((s) => sumOf(s.projects, "labor_cost"))),
  };
  out.difference = round2(out.revenue - out.allocated); // prihod − trošak radnika (bez ostalih troškova projekta)
  return out;
}

/**
 * Šta se šalje bazi (save_payroll_draft): listići bez polja za prikaz (vendor_name, revenue).
 */
export function draftPayload(result) {
  return result.payslips.map(({ vendor_name: _v, revenue: _r, ...slip }) => slip);
}

const SLIP_FIELDS = ["total_hours", "basis_amount", "bruto", "neto", "tax", "emp_pio", "emp_health", "emp_unemployment",
  "er_pio", "er_health", "total_cost", "payout"];
const PROJECT_FIELDS = ["hours", "worker_amount", "labor_cost", "revenue"];
const same = (a, b) => (a === null || a === undefined ? null : round2(a)) === (b === null || b === undefined ? null : round2(b));

/**
 * Da li sačuvan nacrt odgovara obračunu iz trenutnih podataka. Vraća imena radnika čiji se listić razlikuje
 * (ili koji fali / višak); prazan niz = nacrt je ažuran.
 * @param {Array} stored    sačuvani listići, svaki sa `projects` (redovi payslip_projects)
 * @param {Array} computed  buildMonthPayroll().payslips
 */
export function staleEmployees(stored, computed) {
  const a = new Map((stored || []).map((s) => [s.employee_id, s]));
  const b = new Map((computed || []).map((s) => [s.employee_id, s]));
  const names = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const s = a.get(id);
    const c = b.get(id);
    const name = (s || c).employee_name;
    if (!s || !c) { names.push(name); continue; }
    let diff = SLIP_FIELDS.some((f) => !same(s[f], c[f])) || s.engagement_type !== c.engagement_type
      || s.rate_basis !== c.rate_basis || !same(s.work_fraction, c.work_fraction);
    const sp = new Map((s.projects || []).map((p) => [p.project_id, p]));
    const cp = new Map((c.projects || []).map((p) => [p.project_id, p]));
    if (sp.size !== cp.size) diff = true;
    for (const [pid, p] of cp) {
      const q = sp.get(pid);
      if (!q || PROJECT_FIELDS.some((f) => !same(p[f], q[f]))) diff = true;
    }
    if (diff) names.push(name);
  }
  return names;
}
