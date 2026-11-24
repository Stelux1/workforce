import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { WEEKDAY_LABELS, formatHours } from "@/lib/timesheetReport";

const DEJAVU = {
  normal: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf",
  bold: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf",
};

async function fetchBase64(url) {
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

const num = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
const pdfCell = (v) => (v === null || v === undefined ? "" : formatHours(v));

/* ─────────────────────────  EXCEL  ───────────────────────── */

export function exportReportExcel({ report, columns, headGroups, viewMode, meta }) {
  const L = meta.labels;
  const rows = [];

  rows.push([L.reportTitle]);
  rows.push([L.vendor, meta.vendorLabel]);
  rows.push([L.range, meta.periodLabel]);
  rows.push([L.generated, meta.generatedAt]);
  rows.push([]);

  if (viewMode === "daily") {
    const groupRow = [L.no, L.employee, L.total];
    headGroups.forEach((g) => {
      groupRow.push(`${L.week}${String(g.isoWeek).padStart(2, "0")}`);
      for (let i = 1; i < g.dates.length; i++) groupRow.push("");
    });
    const dateRow = ["", "", ""];
    columns.forEach((c) => dateRow.push(`${WEEKDAY_LABELS.en[c.dow]} ${format(c.date, "dd.MM")}`));
    rows.push(groupRow);
    rows.push(dateRow);
  } else {
    const header = [L.no, L.employee, L.total];
    columns.forEach((c) =>
      header.push(
        `${L.week}${String(c.isoWeek).padStart(2, "0")} (${format(c.dates[0].date, "dd.MM")}-${format(c.dates[c.dates.length - 1].date, "dd.MM")})`
      )
    );
    rows.push(header);
  }

  report.vendorGroups.forEach((g) => {
    rows.push([g.vendor || L.noVendor]);
    g.rows.forEach((r) => rows.push([r.number || "", r.name, num(r.total), ...r.cells.map(num)]));
    rows.push(["", `${L.subtotal} — ${g.vendor || L.noVendor}`, num(g.total), ...g.columnTotals.map(num)]);
    rows.push([]);
  });

  rows.push(["", L.grandTotal, num(report.grandTotal), ...report.columnTotals.map(num)]);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 12 },
    { wch: 34 },
    { wch: 12 },
    ...columns.map(() => ({ wch: viewMode === "daily" ? 8 : 14 })),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Timesheets");
  XLSX.writeFile(wb, meta.filename);
}

/* ─────────────────────────  PDF  ───────────────────────── */

export async function exportReportPDF({ report, columns, headGroups, viewMode, meta }) {
  const L = meta.labels;
  const lang = ["rs", "sk"].includes(meta.lang) ? meta.lang : "en";
  const days = WEEKDAY_LABELS[lang] || WEEKDAY_LABELS.en;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const [nrm, bld] = await Promise.all([fetchBase64(DEJAVU.normal), fetchBase64(DEJAVU.bold)]);
  let font = "helvetica";
  if (nrm && bld) {
    doc.addFileToVFS("DejaVuSans.ttf", nrm);
    doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
    doc.addFileToVFS("DejaVuSans-Bold.ttf", bld);
    doc.addFont("DejaVuSans-Bold.ttf", "DejaVuSans", "bold");
    font = "DejaVuSans";
  }

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 10;
  const MR = 10;
  const MT = 10;
  const MB = 14;

  const FIXED = [
    { w: 12, label: L.no, align: "left" },
    { w: 54, label: L.employee, align: "left" },
    { w: 16, label: L.total, align: "right" },
  ];
  const fixedW = FIXED.reduce((s, f) => s + f.w, 0);
  const colW = viewMode === "daily" ? 8.5 : 13;
  const perPage = Math.max(1, Math.floor((W - ML - MR - fixedW) / colW));

  const chunks = [];
  for (let i = 0; i < columns.length; i += perPage) chunks.push(columns.slice(i, i + perPage));
  if (chunks.length === 0) chunks.push([]);

  let y = MT;
  let chunk = [];

  const setF = (bold, size) => {
    doc.setFont(font, bold ? "bold" : "normal");
    doc.setFontSize(size);
  };
  const tableRight = () => ML + fixedW + chunk.length * colW;

  const fitSize = (txt, maxW, size) => {
    setF(false, size);
    let s = size;
    while (s > 4.6 && doc.getTextWidth(String(txt)) > maxW) {
      s -= 0.3;
      doc.setFontSize(s);
    }
    return s;
  };

  const drawDocHeader = () => {
    setF(true, 13);
    doc.setTextColor(30, 33, 40);
    doc.text(L.reportTitle, ML, MT + 5);
    setF(false, 8);
    doc.setTextColor(105, 108, 115);
    doc.text(`${L.vendor}: ${meta.vendorLabel}`, ML, MT + 10.5);
    doc.text(`${L.range}: ${meta.periodLabel}`, ML, MT + 14.6);
    doc.text(`${L.generated}: ${meta.generatedAt}`, W - MR, MT + 5, { align: "right" });
    doc.setDrawColor(196, 176, 140);
    doc.setLineWidth(0.4);
    doc.line(ML, MT + 17.5, W - MR, MT + 17.5);
    y = MT + 21;
  };

  const drawTableHeader = () => {
    doc.setDrawColor(219, 214, 205);
    doc.setLineWidth(0.2);
    const h1 = viewMode === "daily" ? 6 : 9;
    const h2 = viewMode === "daily" ? 8 : 0;
    const total = h1 + h2;

    let x = ML;
    doc.setFillColor(240, 236, 228);
    FIXED.forEach((f) => {
      doc.rect(x, y, f.w, total, "FD");
      setF(true, 7);
      doc.setTextColor(70, 58, 42);
      const tx = f.align === "right" ? x + f.w - 1.5 : x + 1.5;
      doc.text(f.label, tx, y + total / 2 + 1.2, f.align === "right" ? { align: "right" } : undefined);
      x += f.w;
    });

    if (viewMode === "daily") {
      let i = 0;
      while (i < chunk.length) {
        const c = chunk[i];
        let count = 1;
        while (
          i + count < chunk.length &&
          chunk[i + count].isoWeek === c.isoWeek &&
          chunk[i + count].isoYear === c.isoYear
        ) {
          count++;
        }
        const w = count * colW;
        doc.setFillColor(232, 226, 214);
        doc.rect(x, y, w, h1, "FD");
        setF(true, 6.5);
        doc.setTextColor(70, 58, 42);
        doc.text(`${L.week}${String(c.isoWeek).padStart(2, "0")}`, x + w / 2, y + h1 - 1.8, { align: "center" });
        x += w;
        i += count;
      }

      let dx = ML + fixedW;
      chunk.forEach((c) => {
        if (c.isWeekend) doc.setFillColor(253, 246, 233);
        else doc.setFillColor(255, 255, 255);
        doc.rect(dx, y + h1, colW, h2, "FD");
        setF(true, 5.6);
        doc.setTextColor(60, 60, 60);
        doc.text(days[c.dow], dx + colW / 2, y + h1 + 3.4, { align: "center" });
        setF(false, 5.4);
        doc.setTextColor(110, 110, 110);
        doc.text(format(c.date, "dd.MM"), dx + colW / 2, y + h1 + 6.8, { align: "center" });
        dx += colW;
      });
    } else {
      let dx = ML + fixedW;
      chunk.forEach((c) => {
        doc.setFillColor(255, 255, 255);
        doc.rect(dx, y, colW, h1, "FD");
        setF(true, 6.2);
        doc.setTextColor(60, 60, 60);
        doc.text(`${L.week}${String(c.isoWeek).padStart(2, "0")}`, dx + colW / 2, y + 3.8, { align: "center" });
        setF(false, 5.2);
        doc.setTextColor(110, 110, 110);
        const first = c.dates[0].date;
        const last = c.dates[c.dates.length - 1].date;
        doc.text(`${format(first, "dd.MM")}-${format(last, "dd.MM")}`, dx + colW / 2, y + 7.2, { align: "center" });
        dx += colW;
      });
    }
    y += total;
  };

  const newPage = () => {
    doc.addPage();
    drawDocHeader();
    drawTableHeader();
  };

  const drawRow = (h, values, opts = {}) => {
    if (y + h > H - MB) newPage();
    if (opts.fill) {
      doc.setFillColor(opts.fill[0], opts.fill[1], opts.fill[2]);
      doc.rect(ML, y, tableRight() - ML, h, "F");
    }
    doc.setDrawColor(232, 228, 220);
    doc.setLineWidth(0.15);
    doc.line(ML, y + h, tableRight(), y + h);

    let x = ML;
    FIXED.forEach((f, i) => {
      const val = values[i];
      if (val !== "" && val !== null && val !== undefined) {
        const maxW = f.w - 3;
        let size = opts.size || 7;
        if (i === 1) size = fitSize(val, maxW, opts.size || 7);
        setF(opts.bold, size);
        doc.setTextColor(45, 42, 38);
        const tx = f.align === "right" ? x + f.w - 1.5 : x + 1.5;
        doc.text(String(val), tx, y + h / 2 + 1.2, f.align === "right" ? { align: "right" } : undefined);
      }
      x += f.w;
    });

    chunk.forEach((c, i) => {
      const val = values[3 + i];
      if (val !== "" && val !== null && val !== undefined) {
        setF(opts.bold, 6.6);
        doc.setTextColor(60, 60, 65);
        doc.text(String(val), x + colW / 2, y + h / 2 + 1.2, { align: "center" });
      }
      x += colW;
    });

    y += h;
  };

  chunks.forEach((ch, ci) => {
    chunk = ch;
    if (ci > 0) doc.addPage();
    drawDocHeader();
    drawTableHeader();

    report.vendorGroups.forEach((g) => {
      if (y + 7 > H - MB) newPage();
      doc.setFillColor(232, 226, 214);
      doc.rect(ML, y, tableRight() - ML, 7, "F");
      setF(true, 7.5);
      doc.setTextColor(58, 46, 30);
      const label = `${(g.vendor || L.noVendor).toUpperCase()}  ·  ${g.employeeCount} ${L.employeesShort}`;
      doc.text(label, ML + 1.5, y + 4.8);
      y += 7;

      g.rows.forEach((r) => {
        drawRow(6, [r.number || "", r.name, pdfCell(r.total), ...r.cells.map(pdfCell)]);
      });

      drawRow(6.5, ["", `${L.subtotal} — ${g.vendor || L.noVendor}`, pdfCell(g.total), ...g.columnTotals.map(pdfCell)], {
        bold: true,
        fill: [246, 243, 236],
        size: 7,
      });
    });

    drawRow(8, ["", L.grandTotal, pdfCell(report.grandTotal), ...report.columnTotals.map(pdfCell)], {
      bold: true,
      fill: [224, 214, 192],
      size: 8,
    });
  });

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(200, 195, 185);
    doc.setLineWidth(0.2);
    doc.line(ML, H - 9, W - MR, H - 9);
    setF(false, 7);
    doc.setTextColor(120, 122, 128);
    doc.text(`${meta.vendorLabel}  ·  ${meta.periodLabel}`, ML, H - 5);
    doc.text(`${L.page} ${p} ${L.of} ${pageCount}`, W - MR, H - 5, { align: "right" });
  }

  doc.save(meta.filename);
}