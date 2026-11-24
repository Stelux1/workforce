// Izvoz troškova projekata (spec §8.1, §8.2): Excel, CSV i PDF CELOG filtriranog skupa — ne samo prikazane strane.
// Redovi stižu iz `costExportRows(costs, perms, lookup)` (projectCosts.js), koji već izbacuje sve bez prava costs.view.
// Iznosi su u izvornoj valuti; zbir je uvek po valuti (T28). Ništa se ne sabira kroz valute.
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { toCsv, downloadCsv } from "@/lib/csvImport";
import { applyPdfFonts, drawCompanyHeader, loadCompanyForPdf, loadPdfFonts } from "@/lib/companyPdf";
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";
import { costTotalsByCurrency, formatMoney } from "@/lib/projectCosts";
import { sortCurrencies } from "@/lib/finance/currency";

const LABELS = {
  en: {
    cost_date: "Date", project: "Project", client: "Client", category: "Category", subcategory: "Subcategory",
    description: "Description", worker: "Worker", vendor: "Vendor", amount: "Amount", currency: "Currency",
    eur_rsd_rate: "Rate (per 1 EUR)", fx_rate_date: "Rate date", billable: "Billable", receipt: "Receipt", notes: "Notes",
    yes: "Yes", no: "No", title: "Project Costs", filters: "Filters", generated: "Generated", total: "Total",
    sheet: "Project Costs", page: "Page", of: "of", count: "Costs",
  },
  rs: {
    cost_date: "Datum", project: "Projekat", client: "Klijent", category: "Kategorija", subcategory: "Potkategorija",
    description: "Opis", worker: "Radnik", vendor: "Dobavljač", amount: "Iznos", currency: "Valuta",
    eur_rsd_rate: "Kurs (za 1 EUR)", fx_rate_date: "Datum kursa", billable: "Naplativo", receipt: "Račun", notes: "Napomene",
    yes: "Da", no: "Ne", title: "Troškovi projekata", filters: "Filteri", generated: "Napravljeno", total: "Ukupno",
    sheet: "Troškovi projekata", page: "Strana", of: "od", count: "Troškova",
  },
  sk: {
    cost_date: "Dátum", project: "Projekt", client: "Klient", category: "Kategória", subcategory: "Podkategória",
    description: "Popis", worker: "Pracovník", vendor: "Dodávateľ", amount: "Suma", currency: "Mena",
    eur_rsd_rate: "Kurz (za 1 EUR)", fx_rate_date: "Dátum kurzu", billable: "Fakturovateľné", receipt: "Doklad", notes: "Poznámky",
    yes: "Áno", no: "Nie", title: "Náklady projektov", filters: "Filtre", generated: "Vytvorené", total: "Spolu",
    sheet: "Náklady projektov", page: "Strana", of: "z", count: "Nákladov",
  },
};
const labelsFor = (lang) => LABELS[lang] || LABELS.en;

const COLUMNS = [
  "cost_date", "project", "client", "category", "subcategory", "description", "worker", "vendor",
  "amount", "currency", "eur_rsd_rate", "fx_rate_date", "billable", "receipt", "notes",
];

/** Tabela za izvoz: zaglavlja po jeziku, redovi kao niz ćelija (brojevi ostaju brojevi) i zbir po valuti. */
export function costExportTable(rows, lang = "en") {
  const L = labelsFor(lang);
  const headers = COLUMNS.map((k) => L[k]);
  const body = rows.map((r) => COLUMNS.map((k) => {
    if (k === "billable") return r.billable ? L.yes : L.no;
    const v = r[k];
    return v === null || v === undefined ? "" : v;
  }));
  const totals = costTotalsByCurrency(rows.map((r) => ({ amount: r.amount, currency: r.currency })));
  return { headers, body, totals, labels: L };
}

const stamp = (d = new Date()) => d.toISOString().slice(0, 10);
export const costExportFileName = (ext, scope = "") => `project-costs${scope ? `-${scope}` : ""}-${stamp()}.${ext}`;

export function exportCostsCsv(rows, { lang = "en", filename = costExportFileName("csv") } = {}) {
  const { headers, body } = costExportTable(rows, lang);
  downloadCsv(filename, toCsv([headers, ...body], ";"));
}

export function exportCostsExcel(rows, { lang = "en", filename = costExportFileName("xlsx"), filterText = "" } = {}) {
  const { headers, body, totals, labels: L } = costExportTable(rows, lang);
  const aoa = [[L.title], [L.generated, stamp()]];
  if (filterText) aoa.push([L.filters, filterText]);
  aoa.push([], headers, ...body, []);
  for (const cur of sortCurrencies(Object.keys(totals))) aoa.push([L.total, cur, totals[cur]]);
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [14, 28, 22, 22, 22, 30, 22, 22, 14, 9, 14, 13, 10, 20, 30].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, L.sheet.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

// PDF: A4 pejzaž, zaglavlje firme (D18), filteri, tabela sa prelomom strana, zbir po valuti na kraju.
const PDF_COLUMNS = [
  { key: "cost_date", w: 20 }, { key: "project", w: 44 }, { key: "category", w: 38 }, { key: "subcategory", w: 38 },
  { key: "description", w: 62 }, { key: "amount", w: 24, align: "right" }, { key: "currency", w: 12 },
  { key: "rate", w: 28 }, { key: "billable", w: 11 },
];

export async function exportCostsPdf(rows, { lang = "en", filename = costExportFileName("pdf"), filterText = "" } = {}) {
  const L = labelsFor(lang);
  const locale = intlLocale(lang);
  const totals = costTotalsByCurrency(rows.map((r) => ({ amount: r.amount, currency: r.currency })));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const [fonts, company] = await Promise.all([loadPdfFonts(), loadCompanyForPdf().catch(() => null)]);
  const font = applyPdfFonts(doc, fonts);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 10;
  const MT = 10;
  const MB = 14;

  let y = MT;
  const headerH = drawCompanyHeader(doc, company, { x: ML, y: MT, right: W - ML, font });
  y += headerH ? headerH + 2 : 0;
  doc.setFont(font, "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text(L.title, ML, y + 5);
  doc.setFont(font, "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(`${L.generated}: ${formatIsoDate(stamp(), lang)} · ${L.count}: ${rows.length}`, ML, y + 10);
  y += 13;
  if (filterText) {
    const lines = doc.splitTextToSize(`${L.filters}: ${filterText}`, W - 2 * ML);
    doc.text(lines, ML, y + 2);
    y += lines.length * 4 + 1;
  }
  y += 3;

  const rowH = 6;
  const cellText = (r, key) => {
    if (key === "cost_date") return formatIsoDate(r.cost_date, lang);
    if (key === "amount") return Number(r.amount).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (key === "rate") return r.eur_rsd_rate ? `${r.eur_rsd_rate}${r.fx_rate_date ? ` · ${formatIsoDate(r.fx_rate_date, lang)}` : ""}` : "";
    if (key === "billable") return r.billable ? L.yes : "";
    return String(r[key] ?? "");
  };
  // Tekst se skraćuje po stvarnoj širini u trenutnom fontu (ćelija ne sme da prelije u susednu kolonu).
  const fit = (text, w) => {
    if (doc.getTextWidth(text) <= w - 2) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > w - 2) t = t.slice(0, -1);
    return `${t}…`;
  };
  const drawHead = () => {
    doc.setFillColor(238, 240, 244);
    doc.rect(ML, y, PDF_COLUMNS.reduce((s, c) => s + c.w, 0), rowH, "F");
    doc.setFont(font, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 30, 30);
    let x = ML;
    for (const c of PDF_COLUMNS) {
      const label = c.key === "rate" ? L.eur_rsd_rate : L[c.key];
      doc.text(fit(label, c.w), c.align === "right" ? x + c.w - 1 : x + 1, y + 4.2, { align: c.align === "right" ? "right" : "left" });
      x += c.w;
    }
    y += rowH;
    doc.setFont(font, "normal");
  };
  drawHead();
  rows.forEach((r) => {
    if (y + rowH > H - MB) {
      doc.addPage();
      y = MT;
      drawHead();
    }
    doc.setFontSize(7.5);
    doc.setTextColor(40, 40, 40);
    let x = ML;
    for (const c of PDF_COLUMNS) {
      const t = fit(cellText(r, c.key), c.w);
      doc.text(t, c.align === "right" ? x + c.w - 1 : x + 1, y + 4.2, { align: c.align === "right" ? "right" : "left" });
      x += c.w;
    }
    doc.setDrawColor(225, 228, 233);
    doc.line(ML, y + rowH, ML + PDF_COLUMNS.reduce((s, c) => s + c.w, 0), y + rowH);
    y += rowH;
  });

  y += 4;
  if (y + 6 * Math.max(1, Object.keys(totals).length) > H - MB) {
    doc.addPage();
    y = MT;
  }
  doc.setFont(font, "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  for (const cur of sortCurrencies(Object.keys(totals))) {
    doc.text(`${L.total}: ${formatMoney(totals[cur], cur, locale)}`, ML, y + 4);
    y += 6;
  }
  const pages = doc.getNumberOfPages();
  doc.setFont(font, "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.text(`${L.page} ${p} ${L.of} ${pages}`, W - ML, H - 6, { align: "right" });
  }
  doc.save(filename);
}
