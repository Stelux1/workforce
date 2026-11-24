// Izvoz internog obračuna za klijenta (spec §9): CSV, Excel i PDF „za korišćenje izvan Teamore". NIJE faktura (T29):
// nema broja fakture, PDV-a ni stavki računa; dokument nosi oznaku „Interni obračun — nije faktura".
// Redovi i zbir dolaze iz billingExportData (src/lib/billingOverview.js) — isti kao na ekranu (zbir ekrana = zbir izvoza).
// Billable troškovi su posebna tabela sa svojim zbirom i ne ulaze u obračun (T15).
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { toCsv, downloadCsv } from "@/lib/csvImport";
import { applyPdfFonts, drawCompanyHeader, loadCompanyForPdf, loadPdfFonts } from "@/lib/companyPdf";
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";
import { formatMoney } from "@/lib/projectCosts";
import { sortCurrencies } from "@/lib/finance/currency";

const stamp = (d = new Date()) => d.toISOString().slice(0, 10);
const slug = (s) => String(s || "").normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();

export const billingFileName = (data, ext) =>
  `obracun-${slug(data.header.client) || "klijent"}${data.header.project ? `-${slug(data.header.project)}` : ""}-${data.header.periodStart}_${data.header.periodEnd}.${ext}`;

const LINE_KEYS = ["project", "employee", "role", "hourType", "hours", "rate", "coef", "amount", "currency"];
const COST_KEYS = ["date", "project", "category", "description", "amount", "currency"];

function lineHeaders(T) {
  return { project: T.project, employee: T.worker, role: T.role, hourType: T.hourType, hours: T.hours, rate: T.rate, coef: T.coef, amount: T.amount, currency: T.currency };
}
function costHeaders(T) {
  return { date: T.date, project: T.project, category: T.category, description: T.description, amount: T.amount, currency: T.currency };
}
const cell = (v) => (v === null || v === undefined ? "" : v);

/** Zaglavlje dokumenta kao parovi [naziv, vrednost] (isti tekst u CSV, Excel i PDF). */
export function billingHeaderPairs(data, T, lang) {
  const h = data.header;
  const pairs = [
    [T.client, h.client],
    [T.project, h.project || T.allProjectsOfClient],
    [T.period, `${formatIsoDate(h.periodStart, lang)} – ${formatIsoDate(h.periodEnd, lang)}`],
    [T.currency, h.currency],
    [T.status, T.statuses[h.status] || h.status || ""],
  ];
  if (h.frozen && h.calculatedAt) pairs.push([T.frozen, formatIsoDate(String(h.calculatedAt).slice(0, 10), lang)]);
  if (h.extInvoiceReference || h.extInvoiceAmount !== null) {
    pairs.push([T.extReference, h.extInvoiceReference || ""]);
    if (h.extInvoiceDate) pairs.push([T.extDate, formatIsoDate(h.extInvoiceDate, lang)]);
    if (h.extInvoiceAmount !== null) pairs.push([T.extAmount, `${h.extInvoiceAmount} ${h.extInvoiceCurrency || h.currency}`]);
    if (h.extDueDate) pairs.push([T.extDue, formatIsoDate(h.extDueDate, lang)]);
  }
  return pairs;
}

function aoa(data, T, lang) {
  const out = [[T.exportTitle], [T.internalNote], [T.generated, stamp()]];
  for (const p of billingHeaderPairs(data, T, lang)) out.push(p);
  const LH = lineHeaders(T);
  out.push([], [T.lines], LINE_KEYS.map((k) => LH[k]));
  for (const r of data.rows) out.push(LINE_KEYS.map((k) => cell(r[k])));
  out.push([T.totalHours, data.totals.hours]);
  for (const cur of sortCurrencies(Object.keys(data.totals.byCurrency))) out.push([T.total, cur, data.totals.byCurrency[cur]]);
  if (data.costs.length) {
    const CH = costHeaders(T);
    out.push([], [T.linkedCosts], [T.costsNote], COST_KEYS.map((k) => CH[k]));
    for (const c of data.costs) out.push(COST_KEYS.map((k) => cell(c[k])));
    for (const cur of sortCurrencies(Object.keys(data.costTotals))) out.push([T.total, cur, data.costTotals[cur]]);
  }
  return out;
}

export function exportBillingCsv(data, { T, lang }) {
  downloadCsv(billingFileName(data, "csv"), toCsv(aoa(data, T, lang), ";"));
}

export function exportBillingExcel(data, { T, lang }) {
  const sheet = XLSX.utils.aoa_to_sheet(aoa(data, T, lang));
  sheet["!cols"] = [28, 26, 22, 16, 9, 11, 10, 13, 9].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, T.exportTitle.slice(0, 31));
  XLSX.writeFile(wb, billingFileName(data, "xlsx"));
}

/** Pregled po klijentu i projektu (overviewByProject) u Excel/CSV — iznosi po valuti u zasebnim kolonama. */
export function exportOverview(rows, { T, kind, lookup, from, to }) {
  const currencies = sortCurrencies([...new Set(rows.flatMap((r) => [...Object.keys(r.revenue), ...Object.keys(r.unbilled)]))]);
  const head = [T.client, T.project, T.hours, ...currencies.map((c) => `${T.calculated} ${c}`), ...currencies.map((c) => `${T.unbilled} ${c}`)];
  const body = rows.map((r) => [
    lookup.clientName(r.clientId), lookup.projectName(r.projectId), r.hours,
    ...currencies.map((c) => cell(r.revenue[c])), ...currencies.map((c) => cell(r.unbilled[c])),
  ]);
  const name = `billing-pregled-${from}_${to}`;
  if (kind === "csv") {
    downloadCsv(`${name}.csv`, toCsv([head, ...body], ";"));
    return;
  }
  const sheet = XLSX.utils.aoa_to_sheet([[T.exportOverviewTitle], [T.period, `${from} – ${to}`], [T.internalNote], [], head, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, T.exportOverviewTitle.slice(0, 31));
  XLSX.writeFile(wb, `${name}.xlsx`);
}

// PDF: A4 uspravno, zaglavlje firme (D18), podaci obračuna, linije sa prelomom strana, zbir, troškovi odvojeno.
export async function exportBillingPdf(data, { T, lang }) {
  const locale = intlLocale(lang);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const [fonts, company] = await Promise.all([loadPdfFonts(), loadCompanyForPdf().catch(() => null)]);
  const font = applyPdfFonts(doc, fonts);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 12;
  const MT = 12;
  const MB = 14;
  let y = MT;
  const headerH = drawCompanyHeader(doc, company, { x: ML, y: MT, right: W - ML, font });
  y += headerH ? headerH + 3 : 0;

  doc.setFont(font, "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text(T.exportTitle, ML, y + 5);
  doc.setFont(font, "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(`${T.internalNote} · ${T.generated}: ${formatIsoDate(stamp(), lang)}`, ML, y + 10);
  y += 15;
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  for (const [k, v] of billingHeaderPairs(data, T, lang)) {
    doc.setFont(font, "bold");
    doc.text(`${k}:`, ML, y);
    doc.setFont(font, "normal");
    doc.text(String(v ?? ""), ML + 42, y);
    y += 5;
  }
  y += 3;

  const money = (v, cur) => (v === null || v === undefined ? "—" : formatMoney(v, cur, locale));
  const fmtNum = (v, d = 2) => (v === null || v === undefined ? "" : Number(v).toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d }));
  const fit = (text, w) => {
    const s = String(text ?? "");
    if (doc.getTextWidth(s) <= w - 2) return s;
    let t = s;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > w - 2) t = t.slice(0, -1);
    return `${t}…`;
  };
  const table = (cols, rows, render) => {
    const rowH = 6;
    const width = cols.reduce((s, c) => s + c.w, 0);
    const head = () => {
      doc.setFillColor(238, 240, 244);
      doc.rect(ML, y, width, rowH, "F");
      doc.setFont(font, "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 30, 30);
      let x = ML;
      for (const c of cols) {
        doc.text(fit(c.label, c.w), c.right ? x + c.w - 1 : x + 1, y + 4.2, { align: c.right ? "right" : "left" });
        x += c.w;
      }
      y += rowH;
      doc.setFont(font, "normal");
    };
    head();
    for (const r of rows) {
      if (y + rowH > H - MB) {
        doc.addPage();
        y = MT;
        head();
      }
      doc.setFontSize(7.5);
      doc.setTextColor(40, 40, 40);
      let x = ML;
      for (const c of cols) {
        doc.text(fit(render(r, c.key), c.w), c.right ? x + c.w - 1 : x + 1, y + 4.2, { align: c.right ? "right" : "left" });
        x += c.w;
      }
      doc.setDrawColor(225, 228, 233);
      doc.line(ML, y + rowH, ML + width, y + rowH);
      y += rowH;
    }
  };
  const totalsBlock = (lines) => {
    y += 3;
    if (y + 6 * lines.length > H - MB) {
      doc.addPage();
      y = MT;
    }
    doc.setFont(font, "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    for (const l of lines) {
      doc.text(l, W - ML, y + 4, { align: "right" });
      y += 6;
    }
    doc.setFont(font, "normal");
  };

  const LH = lineHeaders(T);
  const lineCols = [
    { key: "project", w: 34 }, { key: "employee", w: 34 }, { key: "role", w: 26 }, { key: "hourType", w: 22 },
    { key: "hours", w: 14, right: true }, { key: "rate", w: 17, right: true }, { key: "coef", w: 12, right: true },
    { key: "amount", w: 27, right: true },
  ].map((c) => ({ ...c, label: LH[c.key] }));
  table(lineCols, data.rows, (r, k) => {
    if (k === "hours") return fmtNum(r.hours);
    if (k === "rate") return fmtNum(r.rate);
    if (k === "coef") return fmtNum(r.coef, 2);
    if (k === "amount") return money(r.amount, r.currency);
    return r[k] || "";
  });
  totalsBlock([
    `${T.totalHours}: ${fmtNum(data.totals.hours)}`,
    ...sortCurrencies(Object.keys(data.totals.byCurrency)).map((c) => `${T.total}: ${money(data.totals.byCurrency[c], c)}`),
  ]);

  if (data.costs.length) {
    y += 4;
    if (y + 20 > H - MB) {
      doc.addPage();
      y = MT;
    }
    doc.setFont(font, "bold");
    doc.setFontSize(10);
    doc.text(T.linkedCosts, ML, y + 4);
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text(T.costsNote, ML, y + 9);
    y += 12;
    const CH = costHeaders(T);
    const costCols = [
      { key: "date", w: 20 }, { key: "project", w: 38 }, { key: "category", w: 40 }, { key: "description", w: 60 },
      { key: "amount", w: 28, right: true },
    ].map((c) => ({ ...c, label: CH[c.key] }));
    table(costCols, data.costs, (c, k) => (k === "date" ? formatIsoDate(c.date, lang) : k === "amount" ? money(c.amount, c.currency) : c[k] || ""));
    totalsBlock(sortCurrencies(Object.keys(data.costTotals)).map((c) => `${T.total}: ${money(data.costTotals[c], c)}`));
  }

  const pages = doc.getNumberOfPages();
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.text(`${T.internalNote} · ${p}/${pages}`, W - ML, H - 6, { align: "right" });
  }
  doc.save(billingFileName(data, "pdf"));
}
