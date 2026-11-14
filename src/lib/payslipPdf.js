// Platni listić PDF — isti stil kao PDF satnice (timesheetPdf.js): crne ivice, sive ćelije za nazive, okvir naslova,
// zaglavlje firme iz company_settings (D18) sa logom firme. Jedan radnik = jedna strana; „preuzmi sve" = svi listići
// obračuna u jednom PDF-u.
// Svi iznosi i sati su vrednosti iz baze (payslips, payslip_projects), samo formatirane (payslipModel) — PDF ništa
// ne računa. Nacrt obračuna dobija vodeni žig „NACRT — nije za isplatu" na svakoj strani.
import jsPDF from "jspdf";
import { parseISO } from "date-fns";
import { formatDate } from "@/lib/dateFormat";
import { applyPdfFonts, drawCompanyHeader, loadCompanyForPdf, loadPdfFonts } from "@/lib/companyPdf";
import { monthNumeric, payslipModel, runIsDraft } from "@/lib/payroll/payslipExport";

const LABELS = {
  rs: {
    title: "PLATNI LISTIĆ",
    employeeName: "Ime i prezime",
    employeeCode: "Šifra radnika",
    month: "Mesec obračuna",
    rate: "Kurs EUR/RSD",
    engagement: "Angažman",
    rateBasis: "Osnova satnice",
    workFraction: "Udeo radnog vremena",
    status: "Status obračuna",
    employee: "Zaposleni",
    subcontractor: "Preko podizvođača",
    basis: { neto: "Neto", bruto: "Bruto" },
    statuses: { draft: "Nacrt", approved: "Odobren", paid: "Isplaćen" },
    hoursByType: "Sati po vrsti",
    hours: "Sati",
    totalHours: "Ukupno sati",
    byProject: "Sati po projektu",
    project: "Projekat",
    projectNo: "Br. projekta",
    projectAmount: "Iznos po satnici (EUR)",
    total: "Ukupno",
    amounts: "Obračun",
    amountEur: "Iznos (EUR)",
    warnings: "Upozorenja",
    note: "Upravljački obračun u EUR po kursu obračuna. Ne zamenjuje poresku prijavu (PPP-PD) ni obračun knjigovođe.",
    watermark: "NACRT — nije za isplatu",
    draftShort: "NACRT",
  },
  en: {
    title: "PAYSLIP",
    employeeName: "Full name",
    employeeCode: "Employee ID",
    month: "Payroll month",
    rate: "EUR/RSD rate",
    engagement: "Engagement",
    rateBasis: "Rate basis",
    workFraction: "Work fraction",
    status: "Payroll status",
    employee: "Employee (direct)",
    subcontractor: "Via subcontractor",
    basis: { neto: "Net", bruto: "Gross" },
    statuses: { draft: "Draft", approved: "Approved", paid: "Paid" },
    hoursByType: "Hours by type",
    hours: "Hours",
    totalHours: "Total hours",
    byProject: "Hours by project",
    project: "Project",
    projectNo: "Project No.",
    projectAmount: "Amount at hourly rate (EUR)",
    total: "Total",
    amounts: "Payroll",
    amountEur: "Amount (EUR)",
    warnings: "Warnings",
    note: "Management payroll in EUR at the payroll exchange rate. It does not replace the tax return (PPP-PD) or the accountant's payroll.",
    watermark: "DRAFT — not for payment",
    draftShort: "DRAFT",
  },
};

const GREY = [245, 245, 245];
const TOTAL_FILL = [240, 240, 240];
const GROUP_FILL = [250, 250, 250];

function monthLabelOf(month, lang) {
  return formatDate(parseISO(String(month).slice(0, 10)), "LLLL yyyy", lang).replace(/^./, (c) => c.toUpperCase());
}

function renderPayslip(doc, model, { company, font, lang, first, pageRefs }) {
  const L = LABELS[lang] || LABELS.rs;
  if (!first) doc.addPage();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 14, MR = 14, MT = 10;
  const CW = W - ML - MR;
  const BOTTOM = H - 16; // ispod je podnožje
  const ref = [model.monthNumeric, model.employeeCode].filter(Boolean).join(" · ");
  pageRefs.push(ref);

  const border = (x, y, w, h, lw = 0.3) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(lw);
    doc.rect(x, y, w, h);
  };
  const fillRect = (x, y, w, h, rgb) => {
    doc.setFillColor(...rgb);
    doc.rect(x, y, w, h, "F");
    border(x, y, w, h);
  };
  const cell = (x, y, w, h, text, o = {}) => {
    if (o.fill) fillRect(x, y, w, h, o.fill);
    else border(x, y, w, h, o.lineWidth);
    if (text === undefined || text === null || text === "") return;
    doc.setFontSize(o.fontSize || 8.5);
    doc.setFont(font, o.bold ? "bold" : "normal");
    doc.setTextColor(...(o.color || [0, 0, 0]));
    const align = o.align || "left";
    const tx = align === "center" ? x + w / 2 : align === "right" ? x + w - 2 : x + 2;
    doc.text(String(text), tx, y + h / 2 + 1.4, { align, maxWidth: w - 3 });
  };
  const label = (x, y, w, h, text, o = {}) => cell(x, y, w, h, text, { fill: o.fill || GREY, bold: true, fontSize: o.fontSize || 7.5, align: o.align });

  let y = MT;
  // Nova strana kad sledeći red ne staje (radnik sa mnogo projekata).
  const ensure = (h) => {
    if (y + h <= BOTTOM) return;
    doc.addPage();
    pageRefs.push(ref);
    y = MT;
  };

  // ── ZAGLAVLJE FIRME (samo ako su podaci firme uneti, D18) ─────────────
  const headerH = drawCompanyHeader(doc, company, { x: ML, y, right: W - MR, font });
  if (headerH) y += headerH + 6;

  // ── NASLOV ────────────────────────────────────────────────────────────
  const monthLabel = monthLabelOf(model.month, lang);
  border(ML, y, CW, 10, 0.5);
  doc.setFontSize(13);
  doc.setFont(font, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(`${L.title} — ${monthLabel}${model.draft ? ` (${L.draftShort})` : ""}`, W / 2, y + 6.8, { align: "center" });
  y += 13;

  // ── PODACI O RADNIKU ──────────────────────────────────────────────────
  const infoH = 8;
  const lw = 38;
  const vw = CW / 2 - lw;
  const engagement = model.subcontractor
    ? `${L.subcontractor}${model.vendorName ? ` · ${model.vendorName}` : ""}`
    : L.employee;
  const info = [
    [L.employeeName, model.employeeName, L.month, monthLabel, true],
    [L.employeeCode, model.employeeCode, L.rate, model.eurRsdRateText],
    [L.engagement, engagement, L.rateBasis, L.basis[model.rateBasis] || model.rateBasis],
    [L.workFraction, model.workFractionText, L.status, L.statuses[model.status] || model.status],
  ];
  for (const [l1, v1, l2, v2, strong] of info) {
    label(ML, y, lw, infoH, l1);
    cell(ML + lw, y, vw, infoH, v1, { bold: strong, fontSize: strong ? 9.5 : 8.5 });
    label(ML + lw + vw, y, lw, infoH, l2);
    cell(ML + 2 * lw + vw, y, vw, infoH, v2, { bold: true, fontSize: 9 });
    y += infoH;
  }
  y += 5;

  const rowH = 6.5;

  // ── SATI PO VRSTI ─────────────────────────────────────────────────────
  const hw = 40;
  ensure(rowH * 2);
  label(ML, y, CW - hw, rowH, L.hoursByType);
  label(ML + CW - hw, y, hw, rowH, L.hours, { align: "right" });
  y += rowH;
  for (const h of model.hoursByType) {
    ensure(rowH);
    cell(ML, y, CW - hw, rowH, h.label);
    cell(ML + CW - hw, y, hw, rowH, h.text, { align: "right" });
    y += rowH;
  }
  ensure(rowH);
  cell(ML, y, CW - hw, rowH, L.totalHours, { fill: TOTAL_FILL, bold: true });
  cell(ML + CW - hw, y, hw, rowH, model.totalHoursText, { fill: TOTAL_FILL, bold: true, align: "right", fontSize: 9.5 });
  y += rowH + 5;

  // ── SATI PO PROJEKTU (payslip_projects) ───────────────────────────────
  const pw = [CW - 30 - 25 - 45, 30, 25, 45];
  const px = [ML, ML + pw[0], ML + pw[0] + pw[1], ML + pw[0] + pw[1] + pw[2]];
  ensure(rowH * 2);
  label(px[0], y, pw[0], rowH, L.byProject);
  label(px[1], y, pw[1], rowH, L.projectNo, { align: "center" });
  label(px[2], y, pw[2], rowH, L.hours, { align: "right" });
  label(px[3], y, pw[3], rowH, L.projectAmount, { align: "right" });
  y += rowH;
  for (const p of model.projects) {
    ensure(rowH);
    cell(px[0], y, pw[0], rowH, p.name);
    cell(px[1], y, pw[1], rowH, p.number, { align: "center" });
    cell(px[2], y, pw[2], rowH, p.hoursText, { align: "right" });
    cell(px[3], y, pw[3], rowH, p.workerAmountText, { align: "right" });
    y += rowH;
  }
  // Ukupno = polja listića (total_hours, basis_amount), ne zbir redova.
  ensure(rowH);
  cell(px[0], y, pw[0] + pw[1], rowH, L.total, { fill: TOTAL_FILL, bold: true });
  cell(px[2], y, pw[2], rowH, model.totalHoursText, { fill: TOTAL_FILL, bold: true, align: "right" });
  cell(px[3], y, pw[3], rowH, model.basisAmountText, { fill: TOTAL_FILL, bold: true, align: "right" });
  y += rowH + 5;

  // ── OBRAČUN (iznosi iz payslips) ──────────────────────────────────────
  const aw = 45;
  ensure(rowH * 2);
  label(ML, y, CW - aw, rowH, L.amounts);
  label(ML + CW - aw, y, aw, rowH, L.amountEur, { align: "right" });
  y += rowH;
  let group = null;
  for (const a of model.amounts) {
    if (a.group !== group && !a.payout) {
      group = a.group;
      ensure(rowH * 2);
      cell(ML, y, CW, rowH, model.groups[group], { fill: GROUP_FILL, bold: true, fontSize: 7.5, color: [90, 90, 90] });
      y += rowH;
    }
    if (a.payout) {
      const ph = 10;
      ensure(ph + 2);
      y += 2;
      cell(ML, y, CW - aw, ph, a.label, { fill: TOTAL_FILL, bold: true, fontSize: 11, lineWidth: 0.5 });
      cell(ML + CW - aw, y, aw, ph, a.text, { fill: TOTAL_FILL, bold: true, fontSize: 12, align: "right", lineWidth: 0.5 });
      border(ML, y, CW, ph, 0.5);
      y += ph;
      continue;
    }
    ensure(rowH);
    cell(ML, y, CW - aw, rowH, a.label, { bold: a.strong });
    cell(ML + CW - aw, y, aw, rowH, a.text, { bold: a.strong, align: "right" });
    y += rowH;
  }
  y += 5;

  // ── UPOZORENJA (payslips.warnings) ────────────────────────────────────
  if (model.warnings.length) {
    ensure(rowH * 2);
    label(ML, y, CW, rowH, L.warnings);
    y += rowH;
    for (const w of model.warnings) {
      ensure(rowH);
      cell(ML, y, CW, rowH, w.text, { color: [150, 90, 0] });
      y += rowH;
    }
    y += 4;
  }

  ensure(8);
  doc.setFontSize(7);
  doc.setFont(font, "normal");
  doc.setTextColor(110, 110, 110);
  doc.text(L.note, ML, y + 3, { maxWidth: CW });
}

function drawFooter(doc, { company, font, ref }) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 14, MR = 14;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(ML, H - 10, W - MR, H - 10);
  doc.setFontSize(6.5);
  doc.setFont(font, "normal");
  doc.setTextColor(130, 130, 130);
  if (company?.footer) doc.text(company.footer, ML, H - 6, { maxWidth: W - ML - MR - 40 });
  if (ref) doc.text(`Ref: ${ref}`, W - MR, H - 6, { align: "right" });
}

function drawWatermark(doc, { font, text }) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const angle = 35;
  const rad = (angle * Math.PI) / 180;
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.16 }));
  doc.setFont(font, "bold");
  doc.setFontSize(40);
  doc.setTextColor(200, 0, 0);
  const w = doc.getTextWidth(text);
  // Tekst pod uglom, centriran na sredinu strane (jsPDF rotira oko početka teksta).
  doc.text(text, W / 2 - (w / 2) * Math.cos(rad), H / 2 + (w / 2) * Math.sin(rad), { angle });
  doc.restoreGraphicsState();
}

/**
 * Pravi PDF sa platnim listićima (bez čuvanja) — za preuzimanje i za test.
 * @param {object} input
 * @param {object} input.run        red payroll_runs
 * @param {Array}  input.payslips   redovi payslips, svaki sa `projects` (payslip_projects)
 * @param {Array}  [input.employees]
 * @param {Array}  [input.projects]
 * @param {Map}    [input.vendorNames] vendor_id → naziv podizvođača
 * @param {object|null} [input.company] loadCompanyForPdf()
 * @param {object|null} [input.fonts]   loadPdfFonts()
 */
export function buildPayslipsPdf({ run, payslips, employees, projects, vendorNames, lang = "rs", company = null, fonts = null }) {
  if (!payslips?.length) throw new Error("Nema platnih listića za PDF");
  const L = LABELS[lang] || LABELS.rs;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const font = applyPdfFonts(doc, fonts);
  const empById = new Map((employees || []).map((e) => [e.id, e]));
  const pageRefs = [];
  payslips.forEach((slip, i) => {
    const model = payslipModel({
      run, slip, employee: empById.get(slip.employee_id), projects, vendorName: vendorNames?.get?.(slip.vendor_id), lang,
    });
    renderPayslip(doc, model, { company, font, lang, first: i === 0, pageRefs });
  });
  const draft = runIsDraft(run);
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    drawFooter(doc, { company, font, ref: pageRefs[p - 1] || monthNumeric(run.month) });
    if (draft) drawWatermark(doc, { font, text: L.watermark });
  }
  return doc;
}

/** Učita podatke firme (sa logom) i font, napravi PDF i preuzme ga. */
export async function exportPayslipsPDF({ filename, ...input }) {
  const [company, fonts] = await Promise.all([loadCompanyForPdf(), loadPdfFonts()]);
  const doc = buildPayslipsPdf({ ...input, company, fonts });
  doc.save(filename);
}
