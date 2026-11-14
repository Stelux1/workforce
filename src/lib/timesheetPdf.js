import jsPDF from "jspdf";
import { addDays, getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import { drawCompanyHeader, loadCompanyForPdf } from "@/lib/companyPdf";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const LABELS = {
  en: {
    title: "WEEKLY TIMESHEET",
    employeeName: "Employee Name",
    designation: "Designation",
    reference: "Reference ID",
    year: "Year",
    week: "Week",
    no: "No.",
    location: "Location",
    projectNo: "Project No.",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    daysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    dailyTotal: "Total hours / day",
    totalHours: "Total Working Hours",
    overtime: "Overtime Hours",
    employee: "Employee",
    contractor: "Contractor",
    client: "Client",
    signature: "Signature",
    signatureDate: "Signature / Date",
  },
  rs: {
    title: "NEDELJNI SATI",
    employeeName: "Ime zaposlenog",
    designation: "Radno mesto",
    reference: "Referenca",
    year: "Godina",
    week: "Nedelja",
    no: "Br.",
    location: "Lokacija",
    projectNo: "Br. projekta",
    days: ["Ponedeljak", "Utorak", "Sreda", "Cetvrtak", "Petak", "Subota", "Nedelja"],
    daysShort: ["Pon", "Uto", "Sre", "Cet", "Pet", "Sub", "Ned"],
    dailyTotal: "Dnevni ukupan",
    totalHours: "Ukupan broj radnih sati",
    overtime: "Prekovremeni sati",
    employee: "Zaposleni",
    contractor: "Izvođač radova",
    client: "Naručilac",
    signature: "Potpis",
    signatureDate: "Potpis / Datum",
  },
};

// Zaglavlje, potpis izvođača i podnožje: podaci firme i logo iz Podešavanja → Podaci firme (company_settings, D18),
// isto kao platni listić (companyPdf.js). Ranije su bili upisani u kod (Stelux) sa Base44 slikom; prazni podaci
// firme → PDF bez zaglavlja firme, bez izmišljenog teksta.

async function loadFontBase64(url) {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch {
    return null;
  }
}

function renderTimesheetPage(doc, ts, emp, pageWeekDate, company, isFirstPage, lang = "en", hasDejaVu = false, projectNo = "") {
  if (!isFirstPage) doc.addPage();
  // Datumi i oznaka nedelje dolaze iz samog reda, ne iz nedelje izabrane na stranici (QA 14.11.2026).
  const weekDate = ts.week_start ? parseISO(ts.week_start) : pageWeekDate;

  const L = LABELS[lang] || LABELS.en;

  // Landscape A4: W=297mm, H=210mm
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 12, MR = 12, MT = 8;
  const CW = W - ML - MR;

  const isoWeek = getISOWeek(weekDate);
  const isoYear = getISOWeekYear(weekDate);
  const ref = ts.week_ref || `${isoYear}W${String(isoWeek).padStart(2, "0")}-${emp?.employee_id || "???"}`;

  const border = (x, y, w, h, lineWidth = 0.3) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(lineWidth);
    doc.rect(x, y, w, h);
  };

  const fillRect = (x, y, w, h, rgb) => {
    doc.setFillColor(...rgb);
    doc.rect(x, y, w, h, "F");
    border(x, y, w, h);
  };

  const fontName = hasDejaVu ? "DejaVuSans" : "helvetica";
  const fontNameBold = hasDejaVu ? "DejaVuSans" : "helvetica";

  const cell = (x, y, w, h, text, opts = {}) => {
    if (opts.fill) fillRect(x, y, w, h, opts.fill);
    else border(x, y, w, h);
    if (text !== undefined && text !== null && text !== "") {
      doc.setFontSize(opts.fontSize || 8);
      doc.setFont(fontName, opts.bold ? "bold" : "normal");
      doc.setTextColor(0, 0, 0);
      const align = opts.align || "left";
      const tx = align === "center" ? x + w / 2 : align === "right" ? x + w - 2 : x + 2;
      doc.text(String(text), tx, y + h / 2 + 1.5, { align, maxWidth: w - 3 });
    }
  };

  const labelCell = (x, y, w, h, mainText, opts = {}) => {
    fillRect(x, y, w, h, opts.fill || [245, 245, 245]);
    doc.setFontSize(opts.mainSize || 7.5);
    doc.setFont(fontName, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(mainText, x + 2, y + h / 2 + 1.5, { maxWidth: w - 3 });
  };

  let y = MT;

  // ── HEADER ──────────────────────────────────────────────────────────
  // Logo levo, podaci firme desno (company_settings); bez podataka firme nema zaglavlja.
  const headerH = drawCompanyHeader(doc, company, { x: ML, y, right: W - MR, font: fontName });
  if (headerH) y += 24;

  // Title bar
  border(ML, y, CW, 9, 0.5);
  doc.setFontSize(13);
  doc.setFont(fontName, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(L.title, W / 2, y + 6.2, { align: "center" });

  y += 12;

  // ── EMPLOYEE INFO ────────────────────────────────────────────────────
  const infoH = 9;
  const labelW = 55;
  const valW1 = 90; // employee name value width
  const metaLabelW = 22;
  const metaValW = 22;

  // Row 1: Employee name | Year
  labelCell(ML, y, labelW, infoH, L.employeeName);
  cell(ML + labelW, y, valW1, infoH, ts.employee_name || "", { bold: true, fontSize: 9 });
  labelCell(ML + labelW + valW1, y, metaLabelW, infoH, L.year);
  cell(ML + labelW + valW1 + metaLabelW, y, metaValW, infoH, String(isoYear), { align: "center", bold: true, fontSize: 10 });

  y += infoH;

  // Row 2: Position | Week
  labelCell(ML, y, labelW, infoH, L.designation);
  cell(ML + labelW, y, valW1, infoH, emp?.position || "", { fontSize: 8 });
  labelCell(ML + labelW + valW1, y, metaLabelW, infoH, L.week);
  cell(ML + labelW + valW1 + metaLabelW, y, metaValW, infoH, `W${String(isoWeek).padStart(2, "0")}`, { align: "center", bold: true, fontSize: 10 });

  y += infoH;

  // Row 3: Reference
  labelCell(ML, y, labelW, infoH, L.reference);
  cell(ML + labelW, y, labelW + valW1 - labelW + metaLabelW + metaValW, infoH, ref, { fontSize: 7.5 });

  y += infoH + 4;

  // ── HOURS TABLE ──────────────────────────────────────────────────────
  const numW = 10;
  const locW = 55;
  const projW = 32;
  const remainW = CW - numW - locW - projW;
  const dayW = remainW / 7;
  const headH = 13;
  const dataH = 8;

  // Header row — grey fill
  const headerFill = [245, 245, 245];
  const weekendHeaderFill = [255, 232, 200];
  labelCell(ML, y, numW, headH, L.no, { mainSize: 7 });
  labelCell(ML + numW, y, locW, headH, L.location, { mainSize: 7 });
  labelCell(ML + numW + locW, y, projW, headH, L.projectNo, { mainSize: 7 });
  DAYS.forEach((d, i) => {
    const x = ML + numW + locW + projW + i * dayW;
    const isWeekend = i >= 5;
    fillRect(x, y, dayW, headH, isWeekend ? weekendHeaderFill : headerFill);
    doc.setFontSize(7);
    doc.setFont(fontName, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(L.days[i], x + dayW / 2, y + headH * 0.52, { align: "center" });
    const dateStr = (() => {
      const d2 = addDays(weekDate, i);
      return `${d2.getDate()}/${d2.getMonth() + 1}`;
    })();
    doc.setFontSize(5.5);
    doc.setFont(fontName, "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(dateStr, x + dayW / 2, y + headH * 0.82, { align: "center" });
  });

  y += headH;

  // Data rows — alternating fill
  const numRows = 6;
  for (let r = 0; r < numRows; r++) {
    const isFirst = r === 0;
    const rowFill = r % 2 === 0 ? [255, 255, 255] : [250, 250, 250];
    const weekendFill = r % 2 === 0 ? [255, 248, 240] : [255, 243, 230];
    cell(ML, y, numW, dataH, String(r + 1), { align: "center", fontSize: 8, fill: rowFill });
    cell(ML + numW, y, locW, dataH, isFirst ? (ts.project || "") : "", { fontSize: 8, fill: rowFill });
    cell(ML + numW + locW, y, projW, dataH, isFirst ? projectNo : "", { fontSize: 8, align: "center", fill: rowFill });
    DAYS.forEach((d, i) => {
      const x = ML + numW + locW + projW + i * dayW;
      const val = isFirst ? (ts[`${d}_hours`] || 0) : 0;
      cell(x, y, dayW, dataH, val > 0 ? String(val) : "", {
        align: "center", fontSize: 9, bold: isFirst && val > 0,
        fill: i >= 5 ? weekendFill : rowFill,
      });
    });
    y += dataH;
  }

  // Totals row — grey fill, thicker top border
  const totalRowH = 8;
  border(ML, y, CW, totalRowH, 0.5); // thicker outline for totals
  fillRect(ML, y, numW + locW + projW, totalRowH, [240, 240, 240]);
  doc.setFontSize(6.5); doc.setFont(fontName, "bold"); doc.setTextColor(0, 0, 0);
  doc.text(L.dailyTotal, ML + 2, y + totalRowH / 2 + 1.5);
  DAYS.forEach((d, i) => {
    const x = ML + numW + locW + projW + i * dayW;
    const val = ts[`${d}_hours`] || 0;
    cell(x, y, dayW, totalRowH, val > 0 ? String(val) : "", {
      align: "center", bold: true, fontSize: 9,
      fill: i >= 5 ? [255, 232, 200] : [240, 240, 240],
    });
  });

  y += totalRowH + 4;

  // ── SUMMARY ──────────────────────────────────────────────────────────
  const summH = 9;
  labelCell(ML, y, 75, summH, L.totalHours, { fill: [245, 245, 245] });
  cell(ML + 75, y, 28, summH, (ts.total_hours || 0).toFixed(1) + " h", { align: "center", bold: true, fontSize: 11 });
  if ((ts.overtime_hours || 0) > 0) {
    labelCell(ML + 110, y, 45, summH, L.overtime, { fill: [245, 245, 245] });
    cell(ML + 155, y, 22, summH, (ts.overtime_hours || 0).toFixed(1) + " h", { align: "center", bold: true, fontSize: 10 });
  }

  y += summH + 5;

  // ── SIGNATURES ───────────────────────────────────────────────────────
  const sigH = 20;
  const sigW = (CW - 6) / 3;

  const drawSig = (x, label, subText) => {
    // Header label
    fillRect(x, y, sigW, 8, [245, 245, 245]);
    doc.setFontSize(8); doc.setFont(fontName, "bold"); doc.setTextColor(0, 0, 0);
    doc.text(label, x + 3, y + 5.5);
    // Content area
    border(x, y + 8, sigW, sigH - 8);
    if (subText) {
      doc.setFontSize(7.5); doc.setFont(fontName, "normal"); doc.setTextColor(80, 80, 80);
      doc.text(subText, x + 3, y + 14);
    }
    // Signature/Date footer
    fillRect(x, y + sigH - 5, sigW, 5, [245, 245, 245]);
    doc.setFontSize(6.5); doc.setFont(fontName, "bold"); doc.setTextColor(0, 0, 0);
    doc.text(L.signatureDate, x + 3, y + sigH - 1.5);
  };

  drawSig(ML, L.employee, ts.employee_name || "");
  drawSig(ML + sigW + 3, L.contractor, [company?.name, company?.city].filter(Boolean).join(", "));
  drawSig(ML + 2 * sigW + 6, L.client, ts.client_name || "");

  // ── FOOTER ───────────────────────────────────────────────────────────
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(ML, H - 8, W - MR, H - 8);
  doc.setFontSize(6.5);
  doc.setFont(fontName, "normal");
  doc.setTextColor(130, 130, 130);
  if (company?.footer) doc.text(company.footer, W / 2, H - 4, { align: "center" });
  doc.text(`Ref: ${ref}`, W - MR, H - 4, { align: "right" });
}

const DEJAVU_NORMAL_URL = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf";
const DEJAVU_BOLD_URL = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf";

export async function exportTimesheetPDF(rows, employees, weekDate, filename, lang = "en", projects = []) {
  const [company, dejavuNormal, dejavuBold] = await Promise.all([
    loadCompanyForPdf(),
    loadFontBase64(DEJAVU_NORMAL_URL),
    loadFontBase64(DEJAVU_BOLD_URL),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  let hasDejaVu = false;
  if (dejavuNormal && dejavuBold) {
    doc.addFileToVFS("DejaVuSans.ttf", dejavuNormal);
    doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
    doc.addFileToVFS("DejaVuSans-Bold.ttf", dejavuBold);
    doc.addFont("DejaVuSans-Bold.ttf", "DejaVuSans", "bold");
    hasDejaVu = true;
  }

  rows.forEach((ts, idx) => {
    const emp = employees.find((e) => e.id === ts.employee_id);
    const project = projects.find((p) => p.id === ts.project_id);
    renderTimesheetPage(doc, ts, emp, weekDate, company, idx === 0, lang, hasDejaVu, project?.project_number || "");
  });

  doc.save(filename);
}