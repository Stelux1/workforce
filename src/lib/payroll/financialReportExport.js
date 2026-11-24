// Izvoz Financial Report-a (spec §10: PDF i CSV; T26, T28). Redovi stižu iz `financialReportExportRows(report, perms)`
// (projectReport.js), koji već izbacuje vrednosti za koje korisnik nema pravo — ovde se samo prevode nazivi i crta.
// Iznos je uvek u svojoj valuti; konverzija je poseban odeljak uz kurs i datum kursa. Ništa se ne sabira kroz valute.
import jsPDF from "jspdf";
import { downloadCsv, toCsv } from "@/lib/csvImport";
import { applyPdfFonts, drawCompanyHeader, loadCompanyForPdf, loadPdfFonts } from "@/lib/companyPdf";
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";

const T = {
  en: {
    title: "Financial Report", generated: "Generated", filters: "Filters", page: "Page", of: "of",
    section: "Section", item: "Item", metric: "Metric", currency: "Currency", value: "Value",
    note: "Internal management calculation (approved hours × rates × coefficients). Not an official accounting balance or a cash-flow statement.",
    sections: {
      summary: "Summary", estimate: "Estimate (submitted, not final)", converted: "Converted (exchange rate)", project: "By project",
      client: "By client", employee: "By employee", role: "By job role", costs: "Additional costs",
      billing: "Billing & client payments", payables: "Payroll payables & payments",
    },
    metrics: {
      approvedHours: "Approved hours", pendingHours: "Submitted hours", laborRevenue: "Labor revenue", payrollCost: "Payroll cost",
      laborMargin: "Labor margin", additionalCosts: "Additional project costs", netProfit: "Net project profit",
      profitMargin: "Profit margin %", unitsPerEur: "Rate (units per 1 EUR)", missingRate: "No exchange rate — not in total",
      rateWithoutDate: "Rate without date — not in EUR total", calculated: "Calculated", invoiced: "Invoiced externally",
      received: "Received", outstanding: "Outstanding", estimatedUnpaid: "Estimated unpaid", overdue: "Overdue",
      receivedUnlinked: "Received, not linked to a summary", unbilledRevenue: "Approved, not in any billing summary",
      confirmed: "Confirmed payables", paid: "Paid", remaining: "Remaining", scopeShare: "Payable lines in this scope",
    },
  },
  rs: {
    title: "Finansijski izveštaj", generated: "Napravljeno", filters: "Filteri", page: "Strana", of: "od",
    section: "Odeljak", item: "Stavka", metric: "Pokazatelj", currency: "Valuta", value: "Vrednost",
    note: "Interni menadžerski obračun (odobreni sati × tarife × koeficijenti). Nije zvanični računovodstveni bilans niti cash-flow izveštaj.",
    sections: {
      summary: "Zbir", estimate: "Procena (predato, nije konačno)", converted: "Preračunato (kurs)", project: "Po projektu",
      client: "Po klijentu", employee: "Po radniku", role: "Po ulozi", costs: "Dodatni troškovi",
      billing: "Obračun klijentu i uplate", payables: "Obaveze prema radnicima i isplate",
    },
    metrics: {
      approvedHours: "Odobreni sati", pendingHours: "Predati sati", laborRevenue: "Prihod od rada", payrollCost: "Trošak rada (payroll cost)",
      laborMargin: "Marža rada", additionalCosts: "Dodatni troškovi projekta", netProfit: "Neto rezultat projekta",
      profitMargin: "Profitna marža %", unitsPerEur: "Kurs (jedinica za 1 EUR)", missingRate: "Nema kursa — nije u zbiru",
      rateWithoutDate: "Kurs bez datuma — nije u EUR zbiru", calculated: "Obračunato", invoiced: "Eksterno fakturisano",
      received: "Primljeno", outstanding: "Otvoreno potraživanje", estimatedUnpaid: "Procenjeno nenaplaćeno", overdue: "Dospelo",
      receivedUnlinked: "Primljeno, nevezano za obračun", unbilledRevenue: "Odobreno, nije ni u jednom obračunu",
      confirmed: "Potvrđene obaveze", paid: "Isplaćeno", remaining: "Preostalo", scopeShare: "Stavke obaveza u ovom obuhvatu",
    },
  },
  sk: {
    title: "Finančný prehľad", generated: "Vytvorené", filters: "Filtre", page: "Strana", of: "z",
    section: "Časť", item: "Položka", metric: "Ukazovateľ", currency: "Mena", value: "Hodnota",
    note: "Interný manažérsky výpočet (schválené hodiny × sadzby × koeficienty). Nie je to oficiálna účtovná súvaha ani prehľad peňažných tokov.",
    sections: {
      summary: "Súhrn", estimate: "Odhad (odovzdané, nie konečné)", converted: "Prepočítané (kurz)", project: "Podľa projektu",
      client: "Podľa klienta", employee: "Podľa pracovníka", role: "Podľa pozície", costs: "Dodatočné náklady",
      billing: "Vyúčtovanie klientovi a platby", payables: "Záväzky voči pracovníkom a výplaty",
    },
    metrics: {
      approvedHours: "Schválené hodiny", pendingHours: "Odovzdané hodiny", laborRevenue: "Tržby z práce", payrollCost: "Mzdové náklady (payroll cost)",
      laborMargin: "Marža práce", additionalCosts: "Dodatočné náklady projektu", netProfit: "Čistý výsledok projektu",
      profitMargin: "Zisková marža %", unitsPerEur: "Kurz (jednotiek za 1 EUR)", missingRate: "Bez kurzu — nie je v súčte",
      rateWithoutDate: "Kurz bez dátumu — nie je v súčte EUR", calculated: "Vypočítané", invoiced: "Externe fakturované",
      received: "Prijaté", outstanding: "Otvorená pohľadávka", estimatedUnpaid: "Odhad neuhradené", overdue: "Po splatnosti",
      receivedUnlinked: "Prijaté, nepriradené k vyúčtovaniu", unbilledRevenue: "Schválené, nie je v žiadnom vyúčtovaní",
      confirmed: "Potvrdené záväzky", paid: "Vyplatené", remaining: "Zostáva", scopeShare: "Položky záväzkov v tomto rozsahu",
    },
  },
};
const labelsFor = (lang) => T[lang] || T.en;

const stamp = (d = new Date()) => d.toISOString().slice(0, 10);
export const financialReportFileName = (ext, scope = "") => `financial-report${scope ? `-${scope}` : ""}-${stamp()}.${ext}`;

/** Tabela izvoza na jeziku: zaglavlja + redovi [odeljak, stavka, pokazatelj, valuta, vrednost]. */
export function financialExportTable(rows, lang = "en") {
  const L = labelsFor(lang);
  const headers = [L.section, L.item, L.metric, L.currency, L.value];
  const body = rows.map((r) => [
    L.sections[r.section] || r.section,
    r.item ?? "",
    L.metrics[r.metric] || r.metric,
    r.currency ?? "",
    r.metric === "missingRate" ? "" : r.value,
  ]);
  return { headers, body, labels: L };
}

export function exportFinancialCsv(rows, { lang = "en", filename = financialReportFileName("csv"), filterText = "" } = {}) {
  const { headers, body, labels: L } = financialExportTable(rows, lang);
  const head = [[L.title], [L.generated, stamp()]];
  if (filterText) head.push([L.filters, filterText]);
  head.push([L.note], []);
  downloadCsv(filename, toCsv([...head, headers, ...body], ";"));
}

const COLS = [{ w: 52 }, { w: 62 }, { w: 82 }, { w: 18 }, { w: 30, align: "right" }];

export async function exportFinancialPdf(rows, { lang = "en", filename = financialReportFileName("pdf"), filterText = "", title = "" } = {}) {
  const { headers, body, labels: L } = financialExportTable(rows, lang);
  const locale = intlLocale(lang);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const [fonts, company] = await Promise.all([loadPdfFonts(), loadCompanyForPdf().catch(() => null)]);
  const font = applyPdfFonts(doc, fonts);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 10;
  const MT = 10;
  const MB = 14;
  const tableW = COLS.reduce((s, c) => s + c.w, 0);

  let y = MT;
  const headerH = drawCompanyHeader(doc, company, { x: ML, y: MT, right: W - ML, font });
  y += headerH ? headerH + 2 : 0;
  doc.setFont(font, "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text(title || L.title, ML, y + 5);
  doc.setFont(font, "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(`${L.generated}: ${formatIsoDate(stamp(), lang)}`, ML, y + 10);
  y += 13;
  for (const text of [filterText && `${L.filters}: ${filterText}`, L.note].filter(Boolean)) {
    const lines = doc.splitTextToSize(text, W - 2 * ML);
    doc.text(lines, ML, y + 2);
    y += lines.length * 4 + 1;
  }
  y += 3;

  const rowH = 6;
  const fit = (text, w) => {
    const s = String(text ?? "");
    if (doc.getTextWidth(s) <= w - 2) return s;
    let t = s;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > w - 2) t = t.slice(0, -1);
    return `${t}…`;
  };
  const cell = (v, i) => {
    if (i === 4 && typeof v === "number") return v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return String(v ?? "");
  };
  const drawRow = (values, bold = false) => {
    doc.setFont(font, bold ? "bold" : "normal");
    doc.setFontSize(7.5);
    let x = ML;
    values.forEach((v, i) => {
      const c = COLS[i];
      doc.text(fit(cell(v, i), c.w), c.align === "right" ? x + c.w - 1 : x + 1, y + 4.2, { align: c.align === "right" ? "right" : "left" });
      x += c.w;
    });
    y += rowH;
  };
  const drawHead = () => {
    doc.setFillColor(238, 240, 244);
    doc.rect(ML, y, tableW, rowH, "F");
    doc.setTextColor(30, 30, 30);
    drawRow(headers, true);
  };
  drawHead();
  let lastSection = null;
  body.forEach((r) => {
    if (y + rowH > H - MB) {
      doc.addPage();
      y = MT;
      drawHead();
      lastSection = null;
    }
    doc.setTextColor(40, 40, 40);
    drawRow([r[0] === lastSection ? "" : r[0], r[1], r[2], r[3], r[4]]);
    lastSection = r[0];
    doc.setDrawColor(225, 228, 233);
    doc.line(ML, y, ML + tableW, y);
  });

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
