// Izvoz obaveza i isplata (spec §7): Excel i CSV CELOG filtriranog skupa. Redovi dolaze iz
// payableExportRows(rows, perms) (payablesList.js), koji bez payroll.view vraća prazno (T26).
// Iznosi su u valuti obaveze; zbir je po valuti (T28) — valute se ne sabiraju.
import * as XLSX from "xlsx";
import { toCsv, downloadCsv } from "@/lib/csvImport";
import { sortCurrencies } from "@/lib/finance/currency";

const LABELS = {
  en: {
    payee: "Payee", payee_type: "Payee type", period_start: "Period from", period_end: "Period to", workers: "Workers", hours: "Hours",
    calculated: "Calculated", adjustments: "Adjustments", total: "Total payable", paid: "Paid", remaining: "Remaining",
    currency: "Currency", due_date: "Due date", status: "Status", overdue: "Overdue", payments: "Payments",
    employee: "Worker", vendor: "Vendor", yes: "Yes", no: "No", title: "Payables", generated: "Generated", filters: "Filters", sum: "Total",
    st: { draft: "Draft", unpaid: "Unpaid", partially_paid: "Partially paid", paid: "Paid", cancelled: "Cancelled" },
  },
  rs: {
    payee: "Primalac", payee_type: "Vrsta primaoca", period_start: "Period od", period_end: "Period do", workers: "Radnika", hours: "Sati",
    calculated: "Obračunato", adjustments: "Korekcije", total: "Ukupna obaveza", paid: "Isplaćeno", remaining: "Preostalo",
    currency: "Valuta", due_date: "Dospeće", status: "Status", overdue: "Dospelo", payments: "Isplata",
    employee: "Radnik", vendor: "Dobavljač", yes: "Da", no: "Ne", title: "Obaveze i isplate", generated: "Napravljeno", filters: "Filteri", sum: "Ukupno",
    st: { draft: "Nacrt", unpaid: "Neplaćeno", partially_paid: "Delimično plaćeno", paid: "Plaćeno", cancelled: "Otkazano" },
  },
  sk: {
    payee: "Príjemca", payee_type: "Typ príjemcu", period_start: "Obdobie od", period_end: "Obdobie do", workers: "Pracovníkov", hours: "Hodiny",
    calculated: "Vypočítané", adjustments: "Korekcie", total: "Záväzok spolu", paid: "Vyplatené", remaining: "Zostáva",
    currency: "Mena", due_date: "Splatnosť", status: "Stav", overdue: "Po splatnosti", payments: "Výplat",
    employee: "Pracovník", vendor: "Dodávateľ", yes: "Áno", no: "Nie", title: "Záväzky a výplaty", generated: "Vytvorené", filters: "Filtre", sum: "Spolu",
    st: { draft: "Koncept", unpaid: "Nezaplatené", partially_paid: "Čiastočne zaplatené", paid: "Zaplatené", cancelled: "Zrušené" },
  },
};
const COLUMNS = [
  "payee", "payee_type", "period_start", "period_end", "workers", "hours", "calculated", "adjustments", "total", "paid",
  "remaining", "currency", "due_date", "status", "overdue", "payments",
];
const MONEY = ["calculated", "adjustments", "total", "paid", "remaining"];

/** Tabela za izvoz: zaglavlja po jeziku, ćelije (brojevi ostaju brojevi) i zbir po valuti. */
export function payableExportTable(rows, lang = "en") {
  const L = LABELS[lang] || LABELS.en;
  const headers = COLUMNS.map((k) => L[k]);
  const body = rows.map((r) => COLUMNS.map((k) => {
    if (k === "payee_type") return r.payee_type === "vendor" ? L.vendor : L.employee;
    if (k === "status") return L.st[r.status] || r.status;
    if (k === "overdue") return r.overdue ? L.yes : L.no;
    const v = r[k];
    return v === null || v === undefined ? "" : v;
  }));
  const totals = {};
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const t = (totals[r.currency] ||= Object.fromEntries(MONEY.map((k) => [k, 0])));
    for (const k of MONEY) t[k] = Math.round((t[k] + Number(r[k] || 0)) * 100) / 100;
  }
  return { headers, body, totals, labels: L };
}

const stamp = () => new Date().toISOString().slice(0, 10);
export const payableExportFileName = (ext, scope = "") => `payables${scope ? `-${scope}` : ""}-${stamp()}.${ext}`;

export function exportPayablesCsv(rows, { lang = "en", scope = "" } = {}) {
  const { headers, body } = payableExportTable(rows, lang);
  downloadCsv(payableExportFileName("csv", scope), toCsv([headers, ...body], ";"));
}

export function exportPayablesExcel(rows, { lang = "en", scope = "", filterText = "" } = {}) {
  const { headers, body, totals, labels: L } = payableExportTable(rows, lang);
  const aoa = [[L.title], [L.generated, stamp()]];
  if (filterText) aoa.push([L.filters, filterText]);
  aoa.push([], headers, ...body, []);
  for (const cur of sortCurrencies(Object.keys(totals))) {
    aoa.push([L.sum, cur, ...MONEY.map((k) => `${L[k]}: ${totals[cur][k].toFixed(2)}`)]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [30, 14, 12, 12, 9, 9, 13, 13, 14, 13, 13, 9, 12, 18, 10, 9].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, L.title.slice(0, 31));
  XLSX.writeFile(wb, payableExportFileName("xlsx", scope));
}
