// Platni listić (PDF) i spisak isplata za banku (Excel) iz SAČUVANOG obračuna (payroll_runs, payslips,
// payslip_projects). Čiste funkcije — ništa se ne čita iz baze i NIŠTA SE NE RAČUNA PONOVO: svaki iznos i broj sati
// je vrednost polja iz baze, samo formatirana za prikaz (D11, D17). Zbirovi koji ne postoje kao polje u bazi se ne
// prikazuju (npr. „ukupno doprinosi" se ne sabira — svaka stavka ide posebno).
//
// Pravila:
//  - spisak za banku samo za odobren ili isplaćen obračun; nacrt baca grešku;
//  - platni listić nacrta može da se pregleda, ali sa vodenim žigom „NACRT — nije za isplatu" i „NACRT_" u nazivu
//    fajla (runIsDraft); odobren/isplaćen listić je bez žiga;
//  - za isplatu = neto (D6, bez odbitaka); u spisku za banku iznos je `payslips.neto`;
//  - radnik bez računa ide na poseban spisak („Nedostaje račun"), nikad se tiho ne preskače;
//  - iznos ≤ 0 (npr. negativan neto kad su doprinosi na najnižu osnovicu veći od zarade) nikad ne ulazi u spisak za
//    banku: ide na poseban spisak („Iznos nije za isplatu") uz upozorenje, isto kao radnik bez računa;
//  - valuta je uvek upisana u spisak (EUR, D2); da li se rezidentima isplaćuje u RSD potvrđuje knjigovođa;
//  - radnik preko podizvođača nema zaradu (neto je prazan): plaća se faktura podizvođača, pa ide na poseban spisak
//    („Podizvođači") sa iznosom `payslips.payout`, ne u spisak zarada.

import { HOUR_TYPE_ORDER } from "./hours.js";
import { warningLabel } from "./payrollMonth.js";

export const FINAL_STATUSES = Object.freeze(["approved", "paid"]);
export const runIsFinal = (run) => FINAL_STATUSES.includes(run?.status);
export const runIsDraft = (run) => run?.status === "draft";

/** Valuta isplate: svi iznosi u aplikaciji su u EUR (D2). */
export const PAYOUT_CURRENCY = "EUR";

const TYPE_ORDER = HOUR_TYPE_ORDER;
const EMPLOYEE = "direct_employee";
const SUBCONTRACTOR = "subcontractor_worker";

const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());
const isEmptyValue = (v) => v === null || v === undefined || v === "";

// ───────────────────────── formatiranje ─────────────────────────
const SEPARATORS = { rs: { group: ".", decimal: "," },
  sk: { group: "\u00a0", decimal: "," }, en: { group: ",", decimal: "." } };
const sepOf = (lang) => SEPARATORS[lang] || SEPARATORS.rs;

function groupDigits(intPart, group) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group);
}

function toNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Neispravan broj: ${value}`);
  return n;
}

/**
 * Iznos za prikaz: „1.234,56" (rs) ili „1,234.56" (en). Samo formatiranje vrednosti iz baze (numeric(12,2)) —
 * bez zaokruživanja na drugu vrednost. Prazno (null) → "".
 */
export function formatMoney(value, lang = "rs") {
  if (isEmptyValue(value)) return "";
  const n = toNumber(value);
  const { group, decimal } = sepOf(lang);
  const [intPart, dec] = Math.abs(n).toFixed(2).split(".");
  const sign = n < 0 && `${intPart}${dec}` !== "000" ? "-" : "";
  return `${sign}${groupDigits(intPart, group)}${decimal}${dec}`;
}

/** Sati za prikaz: „40", „7,5", „7,25" (do 2 decimale, kao numeric(7,2) u bazi). Prazno → "". */
export function formatHours(value, lang = "rs") {
  if (isEmptyValue(value)) return "";
  const n = toNumber(value);
  const { group, decimal } = sepOf(lang);
  const [intPart, dec] = Math.abs(n).toFixed(2).split(".");
  const tail = dec.replace(/0+$/, "");
  return `${n < 0 ? "-" : ""}${groupDigits(intPart, group)}${tail ? decimal + tail : ""}`;
}

/** Kurs EUR/RSD za prikaz (numeric(10,4)): najmanje 2, najviše 4 decimale — „117,20", „117,1234". */
export function formatRate(value, lang = "rs") {
  if (isEmptyValue(value)) return "";
  const n = toNumber(value);
  const { group, decimal } = sepOf(lang);
  const [intPart, dec] = n.toFixed(4).split(".");
  const tail = dec.replace(/0+$/, "").padEnd(2, "0");
  return `${groupDigits(intPart, group)}${decimal}${tail}`;
}

/** Stopa (0.0515) za prikaz u nazivu stavke: „5,15%". Prazno → "". */
export function formatPercent(rate, lang = "rs") {
  if (isEmptyValue(rate)) return "";
  const pct = Number((toNumber(rate) * 100).toPrecision(12));
  const [intPart, dec = ""] = String(pct).split(".");
  return `${intPart}${dec ? sepOf(lang).decimal + dec : ""}%`;
}

/** „2026-03-01" → „03.2026". */
export function monthNumeric(month) {
  const m = /^(\d{4})-(\d{2})/.exec(String(month ?? ""));
  if (!m) throw new Error(`Neispravan mesec obračuna: ${month}`);
  return `${m[2]}.${m[1]}`;
}

/** „2026-03-01" → „2026-03" (za nazive fajlova). */
const monthIso = (month) => {
  const [mm, yyyy] = monthNumeric(month).split(".");
  return `${yyyy}-${mm}`;
};

// ───────────────────────── nazivi fajlova ─────────────────────────
const ASCII = { š: "s", đ: "dj", č: "c", ć: "c", ž: "z", Š: "S", Đ: "Dj", Č: "C", Ć: "C", Ž: "Z" };
/** Deo naziva fajla: bez dijakritika i znakova koje sistemi ne vole; razmaci → „_". */
export function fileNamePart(text) {
  return clean(text)
    .replace(/[šđčćžŠĐČĆŽ]/g, (c) => ASCII[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

const draftPrefix = (run) => (runIsDraft(run) ? "NACRT_" : "");

/** Platni listić jednog radnika: „Platni_listic_2026-03_EMP-002_Petar_Petrovic.pdf" (nacrt: „NACRT_…"). */
export function payslipFileName({ run, slip, employee }) {
  const parts = ["Platni_listic", monthIso(run?.month), fileNamePart(employee?.employee_id), fileNamePart(slip?.employee_name)]
    .filter(Boolean);
  return `${draftPrefix(run)}${parts.join("_")}.pdf`;
}

/** Svi listići obračuna u jednom PDF-u: „Platni_listici_2026-03.pdf". */
export const payslipsFileName = (run) => `${draftPrefix(run)}Platni_listici_${monthIso(run?.month)}.pdf`;

/** Spisak isplata za banku: „Isplate_zarada_2026-03.xlsx". */
export const bankExportFileName = (run) => `Isplate_zarada_${monthIso(run?.month)}.xlsx`;

/** Naziv lista sa isplatama (najviše 31 znak, bez : \ / ? * [ ]): „Isplate 03.2026". */
export const bankSheetName = (run) => `Isplate ${monthNumeric(run?.month)}`;

/** Opis plaćanja u nalogu: „Zarada 03.2026" (uvek na srpskom — ide banci). */
export const paymentDescription = (run) => `Zarada ${monthNumeric(run?.month)}`;

// ───────────────────────── platni listić ─────────────────────────
const LABELS = {
  rs: {
    hourType: { redovni: "Redovni rad", prekovremeni: "Prekovremeni rad", vikend: "Rad vikendom", praznik: "Rad na praznik", praznik_vikend: "Praznik vikendom" },
    basis: { neto: "Zarada po satnici (neto)", bruto: "Zarada po satnici (bruto)", sub: "Iznos sati (podizvođač)" },
    bruto: "Bruto zarada",
    emp_pio: "Doprinos za PIO — zaposleni",
    emp_health: "Doprinos za zdravstveno osiguranje — zaposleni",
    emp_unemployment: "Doprinos za nezaposlenost — zaposleni",
    tax: "Porez na zaradu",
    neto: "Neto zarada",
    er_pio: "Doprinos za PIO — poslodavac",
    er_health: "Doprinos za zdravstveno osiguranje — poslodavac",
    total_cost: { employee: "Bruto 2 (ukupan trošak poslodavca)", sub: "Trošak (faktura podizvođača)" },
    payout: { employee: "ZA ISPLATU", sub: "ZA ISPLATU (podizvođaču)" },
    groups: { pay: "Zarada", employer: "Na teret poslodavca", payout: "Isplata" },
  },
  sk: {
    hourType: { redovni: "Bežné", prekovremeni: "Nadčas", vikend: "Víkend", praznik: "Sviatok", praznik_vikend: "Sviatok cez víkend" },
    basis: { neto: "Mzda podľa hodinovej sadzby (čistá)", bruto: "Mzda podľa hodinovej sadzby (hrubá)", sub: "Suma za hodiny (subdodávateľ)" },
    bruto: "Hrubá mzda",
    emp_pio: "Dôchodkový odvod — zamestnanec",
    emp_health: "Odvod na zdravotné poistenie — zamestnanec",
    emp_unemployment: "Odvod na poistenie v nezamestnanosti — zamestnanec",
    tax: "Daň z príjmu",
    neto: "Čistá mzda",
    er_pio: "Dôchodkový odvod — zamestnávateľ",
    er_health: "Odvod na zdravotné poistenie — zamestnávateľ",
    total_cost: { employee: "Hrubá 2 (celkové náklady zamestnávateľa)", sub: "Náklad (faktúra subdodávateľa)" },
    payout: { employee: "NA VÝPLATU", sub: "NA VÝPLATU (subdodávateľovi)" },
    groups: { pay: "Mzda", employer: "Odvody zamestnávateľa", payout: "Platba" },
  },
  en: {
    hourType: { redovni: "Regular", prekovremeni: "Overtime", vikend: "Weekend", praznik: "Public holiday", praznik_vikend: "Holiday on weekend" },
    basis: { neto: "Pay at hourly rate (net)", bruto: "Pay at hourly rate (gross)", sub: "Hours amount (subcontractor)" },
    bruto: "Gross pay",
    emp_pio: "Pension contribution — employee",
    emp_health: "Health insurance contribution — employee",
    emp_unemployment: "Unemployment contribution — employee",
    tax: "Income tax",
    neto: "Net pay",
    er_pio: "Pension contribution — employer",
    er_health: "Health insurance contribution — employer",
    total_cost: { employee: "Gross 2 (total employer cost)", sub: "Cost (subcontractor invoice)" },
    payout: { employee: "TO PAY", sub: "TO PAY (to the subcontractor)" },
    groups: { pay: "Pay", employer: "Employer contributions", payout: "Payment" },
  },
};
const labelsOf = (lang) => LABELS[lang] || LABELS.rs;

// Stopa iz parametara snimljenih u obračunu (payroll_runs.params) — samo za naziv stavke.
const RATE_FIELD = { emp_pio: "emp_pio", emp_health: "emp_health", emp_unemployment: "emp_unemployment", tax: "tax_rate", er_pio: "er_pio", er_health: "er_health" };

/**
 * Sve što platni listić prikazuje, iz sačuvanih redova. Iznosi: `value` je vrednost polja iz baze (ista vrednost,
 * ne preračunata), `text` je ta vrednost formatirana. Stavka čije je polje u bazi prazno se ne prikazuje.
 * @param {object} input
 * @param {object} input.run       red payroll_runs (month, status, eur_rsd_rate, params)
 * @param {object} input.slip      red payslips + `projects` (redovi payslip_projects)
 * @param {object} [input.employee] radnik (Employee) — za šifru radnika
 * @param {Array}  [input.projects] projekti (id, name, project_number) — za naziv projekta
 * @param {string} [input.vendorName] naziv podizvođača
 * @param {"rs"|"en"} [input.lang]
 */
export function payslipModel({ run, slip, employee, projects, vendorName, lang = "rs" }) {
  if (!run || !slip) throw new Error("Nema obračuna ili platnog listića");
  const L = labelsOf(lang);
  const sub = slip.engagement_type === SUBCONTRACTOR;
  const projectById = new Map((projects || []).map((p) => [p.id, p]));
  const params = run.params || {};

  const hoursByType = TYPE_ORDER.filter((code) => !isEmptyValue(slip.hours_by_type?.[code]))
    .map((code) => ({ code, label: L.hourType[code], value: slip.hours_by_type[code], text: formatHours(slip.hours_by_type[code], lang) }));
  // Vrsta koju ne poznajemo se ipak prikazuje (nikad tiho izostavljeni sati).
  for (const [code, value] of Object.entries(slip.hours_by_type || {})) {
    if (!TYPE_ORDER.includes(code) && !isEmptyValue(value)) hoursByType.push({ code, label: code, value, text: formatHours(value, lang) });
  }

  const projectRows = (slip.projects || [])
    .map((p) => {
      const project = projectById.get(p.project_id);
      return {
        projectId: p.project_id,
        name: project?.name || p.project_id,
        number: project?.project_number || "",
        hours: p.hours,
        hoursText: formatHours(p.hours, lang),
        workerAmount: p.worker_amount,
        workerAmountText: formatMoney(p.worker_amount, lang),
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "sr") || String(a.projectId).localeCompare(String(b.projectId)));

  const line = (field, label, group, extra = {}) => {
    const value = slip[field];
    if (isEmptyValue(value)) return null;
    const pct = RATE_FIELD[field] ? formatPercent(params[RATE_FIELD[field]], lang) : "";
    return { field, group, label: pct ? `${label} (${pct})` : label, value, text: formatMoney(value, lang), ...extra };
  };
  const amounts = [
    line("basis_amount", sub ? L.basis.sub : L.basis[slip.rate_basis] || L.basis.neto, "pay"),
    line("bruto", L.bruto, "pay"),
    line("emp_pio", L.emp_pio, "pay"),
    line("emp_health", L.emp_health, "pay"),
    line("emp_unemployment", L.emp_unemployment, "pay"),
    line("tax", L.tax, "pay"),
    line("neto", L.neto, "pay", { strong: true }),
    line("er_pio", L.er_pio, "employer"),
    line("er_health", L.er_health, "employer"),
    line("total_cost", sub ? L.total_cost.sub : L.total_cost.employee, "employer", { strong: true }),
    line("payout", sub ? L.payout.sub : L.payout.employee, "payout", { strong: true, payout: true }),
  ].filter(Boolean);

  return {
    draft: runIsDraft(run),
    status: run.status,
    month: run.month,
    monthNumeric: monthNumeric(run.month),
    employeeId: slip.employee_id,
    employeeName: slip.employee_name || "",
    employeeCode: employee?.employee_id || "",
    engagementType: slip.engagement_type,
    subcontractor: sub,
    vendorName: sub ? vendorName || "" : "",
    rateBasis: slip.rate_basis,
    workFraction: slip.work_fraction,
    workFractionText: isEmptyValue(slip.work_fraction) ? "" : formatPercent(slip.work_fraction, lang),
    eurRsdRate: run.eur_rsd_rate,
    eurRsdRateText: formatRate(run.eur_rsd_rate, lang),
    totalHours: slip.total_hours,
    totalHoursText: formatHours(slip.total_hours, lang),
    basisAmount: slip.basis_amount,
    basisAmountText: formatMoney(slip.basis_amount, lang),
    hoursByType,
    projects: projectRows,
    amounts,
    groups: L.groups,
    warnings: (slip.warnings || []).map((code) => ({ code, text: warningLabel(code, lang) })),
  };
}

// ───────────────────────── spisak isplata za banku ─────────────────────────
const BANK_LABELS = {
  rs: {
    payments: ["Rb.", "Ime i prezime", "Šifra radnika", "JMBG", "Banka", "Račun (IBAN)", "Iznos", "Valuta", "Opis plaćanja"],
    missing: ["Rb.", "Ime i prezime", "Šifra radnika", "JMBG", "Iznos", "Valuta", "Opis plaćanja", "Napomena"],
    missingNote: "Nema račun u profilu radnika (Finansije → IBAN) — nije u spisku za banku",
    subcontractors: ["Rb.", "Ime i prezime", "Šifra radnika", "Podizvođač", "Iznos", "Valuta", "Napomena"],
    subcontractorNote: "Radnik preko podizvođača — plaća se faktura podizvođača, ne zarada",
    invalid: ["Rb.", "Ime i prezime", "Šifra radnika", "JMBG", "Iznos", "Valuta", "Opis plaćanja", "Napomena"],
    invalidNote: "Iznos za isplatu nije veći od 0 — nije u spisku za banku; proverite obračun",
    jmbg: ["Rb.", "Ime i prezime", "Šifra radnika", "Banka", "Račun (IBAN)", "Iznos", "Valuta", "Napomena"],
    jmbgNote: "Nedostaje JMBG u profilu radnika — ostaje u spisku za banku (banka plaća po računu), dopunite JMBG",
    missingSheet: "Nedostaje račun",
    invalidSheet: "Iznos nije za isplatu",
    subcontractorSheet: "Podizvođači",
    jmbgSheet: "Nedostaje JMBG",
  },
  sk: {
    payments: ["Č.", "Meno a priezvisko", "ID zamestnanca", "JMBG", "Banka", "Účet (IBAN)", "Suma", "Mena", "Popis platby"],
    missing: ["Č.", "Meno a priezvisko", "ID zamestnanca", "JMBG", "Suma", "Mena", "Popis platby", "Poznámka"],
    missingNote: "V profile zamestnanca nie je bankový účet (Financie → IBAN) — nie je v zozname pre banku",
    subcontractors: ["Č.", "Meno a priezvisko", "ID zamestnanca", "Subdodávateľ", "Suma", "Mena", "Poznámka"],
    subcontractorNote: "Pracovník cez subdodávateľa — platí sa faktúra subdodávateľa, nie mzda",
    invalid: ["Č.", "Meno a priezvisko", "ID zamestnanca", "JMBG", "Suma", "Mena", "Popis platby", "Poznámka"],
    invalidNote: "Suma na výplatu nie je väčšia ako 0 — nie je v zozname pre banku; skontrolujte zúčtovanie",
    jmbg: ["Č.", "Meno a priezvisko", "ID zamestnanca", "Banka", "Účet (IBAN)", "Suma", "Mena", "Poznámka"],
    jmbgNote: "V profile zamestnanca chýba JMBG — zostáva v zozname pre banku (banka platí podľa účtu), doplňte JMBG",
    missingSheet: "Nedostaje račun",
    invalidSheet: "Iznos nije za isplatu",
    subcontractorSheet: "Podizvođači",
    jmbgSheet: "Nedostaje JMBG",
  },
  en: {
    payments: ["No.", "Full name", "Employee ID", "JMBG", "Bank", "Account (IBAN)", "Amount", "Currency", "Payment description"],
    missing: ["No.", "Full name", "Employee ID", "JMBG", "Amount", "Currency", "Payment description", "Note"],
    missingNote: "No bank account in the employee profile (Financial → IBAN) — not in the bank list",
    subcontractors: ["No.", "Full name", "Employee ID", "Subcontractor", "Amount", "Currency", "Note"],
    subcontractorNote: "Worker via a subcontractor — the subcontractor's invoice is paid, not a salary",
    invalid: ["No.", "Full name", "Employee ID", "JMBG", "Amount", "Currency", "Payment description", "Note"],
    invalidNote: "The amount to pay is not above 0 — not in the bank list; check the payroll",
    jmbg: ["No.", "Full name", "Employee ID", "Bank", "Account (IBAN)", "Amount", "Currency", "Note"],
    jmbgNote: "JMBG missing in the employee profile — stays in the bank list (the bank pays by account), please add the JMBG",
    missingSheet: "Nedostaje račun",
    invalidSheet: "Iznos nije za isplatu",
    subcontractorSheet: "Podizvođači",
    jmbgSheet: "Nedostaje JMBG",
  },
};
export const bankLabels = (lang = "rs") => BANK_LABELS[lang] || BANK_LABELS.rs;

/**
 * Redovi spiska isplata iz listića odobrenog/isplaćenog obračuna. Iznos je `payslips.neto` (za isplatu = neto, D6),
 * kao vrednost iz baze. Svaki listić završava na tačno jednom spisku:
 *  - `payments`: zaposleni sa računom (IBAN iz employee_private) i iznosom > 0 — ide banci;
 *  - `invalidAmount`: zaposleni čiji je neto ≤ 0 — upozorenje, nikad u spisku za banku (proverava se pre računa);
 *  - `missingAccount`: zaposleni bez računa — upozorenje, nikad tiho preskočen;
 *  - `subcontractors`: radnici preko podizvođača (neto prazan) — iznos `payout`, plaća se faktura podizvođača.
 * Dodatno `missingJmbg`: radnici iz `payments` čiji je JMBG prazan — OSTAJU u isplatama (banka plaća po računu), ali
 * ih izvoz prijavljuje (list „Nedostaje JMBG" i upozorenje na stranici), nikad tiho.
 * @throws {Error} za nacrt (ili obračun bez statusa) i za listić zaposlenog bez neto iznosa
 */
export function bankExportRows({ run, payslips, employees, vendorNames }) {
  if (!runIsFinal(run)) throw new Error("Spisak isplata za banku postoji samo za odobren ili isplaćen obračun");
  const empById = new Map((employees || []).map((e) => [e.id, e]));
  const description = paymentDescription(run);
  const vendors = vendorNames instanceof Map ? vendorNames : new Map(Object.entries(vendorNames || {}));
  const sorted = [...(payslips || [])].sort(
    (a, b) => String(a.employee_name || "").localeCompare(String(b.employee_name || ""), "sr") || String(a.employee_id).localeCompare(String(b.employee_id))
  );

  const payments = [];
  const invalidAmount = [];
  const missingAccount = [];
  const subcontractors = [];
  const missingJmbg = [];
  for (const s of sorted) {
    const emp = empById.get(s.employee_id);
    const base = { employeeId: s.employee_id, employeeName: s.employee_name || "", employeeCode: emp?.employee_id || "" };
    if (s.engagement_type === SUBCONTRACTOR) {
      subcontractors.push({ ...base, vendorName: vendors.get(s.vendor_id) || "", amount: s.payout, currency: PAYOUT_CURRENCY });
      continue;
    }
    if (s.engagement_type !== EMPLOYEE) throw new Error(`Nepoznat angažman na platnom listiću: ${s.engagement_type}`);
    if (isEmptyValue(s.neto)) throw new Error(`Platni listić bez neto iznosa: ${base.employeeName}`);
    const row = { ...base, jmbg: clean(emp?.jmbg), amount: s.neto, currency: PAYOUT_CURRENCY, description };
    const account = clean(emp?.iban);
    if (!(toNumber(s.neto) > 0)) invalidAmount.push(row); // nikad iznos ≤ 0 u nalogu za banku
    else if (account) {
      payments.push({ ...row, bankName: clean(emp?.bank_name), account });
      if (!row.jmbg) missingJmbg.push({ ...row, bankName: clean(emp?.bank_name), account }); // ostaje u isplatama, ali sa upozorenjem
    }
    else missingAccount.push(row);
  }
  const number = (rows) => rows.map((r, i) => ({ no: i + 1, ...r }));
  return {
    description,
    payments: number(payments),
    invalidAmount: number(invalidAmount),
    missingAccount: number(missingAccount),
    subcontractors: number(subcontractors),
    missingJmbg: number(missingJmbg),
  };
}

/**
 * Tabele (niz redova) za Excel iz bankExportRows: list isplata i, ako ih ima, „Iznos nije za isplatu",
 * „Nedostaje račun", „Nedostaje JMBG" i „Podizvođači".
 * Iznos ostaje broj iz baze (ćelija sa formatom „#,##0.00"), JMBG i račun su tekst (vodeće nule).
 */
export function bankExportSheets(rows, run, lang = "rs") {
  const L = bankLabels(lang);
  const sheets = [
    {
      name: bankSheetName(run),
      header: L.payments,
      rows: rows.payments.map((r) => [r.no, r.employeeName, r.employeeCode, r.jmbg, r.bankName, r.account, r.amount, r.currency, r.description]),
      amountColumn: 6,
      widths: [5, 30, 14, 16, 20, 28, 12, 8, 18],
    },
  ];
  if (rows.invalidAmount.length) {
    sheets.push({
      name: L.invalidSheet,
      header: L.invalid,
      rows: rows.invalidAmount.map((r) => [r.no, r.employeeName, r.employeeCode, r.jmbg, r.amount, r.currency, r.description, L.invalidNote]),
      amountColumn: 4,
      widths: [5, 30, 14, 16, 12, 8, 18, 60],
    });
  }
  if (rows.missingAccount.length) {
    sheets.push({
      name: L.missingSheet,
      header: L.missing,
      rows: rows.missingAccount.map((r) => [r.no, r.employeeName, r.employeeCode, r.jmbg, r.amount, r.currency, r.description, L.missingNote]),
      amountColumn: 4,
      widths: [5, 30, 14, 16, 12, 8, 18, 60],
    });
  }
  if (rows.missingJmbg?.length) {
    sheets.push({
      name: L.jmbgSheet,
      header: L.jmbg,
      rows: rows.missingJmbg.map((r) => [r.no, r.employeeName, r.employeeCode, r.bankName, r.account, r.amount, r.currency, L.jmbgNote]),
      amountColumn: 5,
      widths: [5, 30, 14, 20, 28, 12, 8, 70],
    });
  }
  if (rows.subcontractors.length) {
    sheets.push({
      name: L.subcontractorSheet,
      header: L.subcontractors,
      rows: rows.subcontractors.map((r) => [r.no, r.employeeName, r.employeeCode, r.vendorName, r.amount, r.currency, L.subcontractorNote]),
      amountColumn: 4,
      widths: [5, 30, 14, 26, 12, 8, 60],
    });
  }
  return sheets;
}
