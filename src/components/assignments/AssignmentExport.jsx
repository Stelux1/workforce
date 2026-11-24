// Izvoz Project Assignments (§4.1): Export CSV / Excel i Generate PDF Report CELOG filtriranog i sortiranog skupa
// (ne samo trenutne strane). Kolone iz `exportRows(list, perms)` — bez prava nema B2C/B2B ni u fajlu (T26).
// Tarife su u izvornoj valuti (kolona valute uz iznos); ništa se ne sabira kroz valute (T28).
import { useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { ChartColumn, ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toCsv, downloadCsv } from "@/lib/csvImport";
import { applyPdfFonts, drawCompanyHeader, loadCompanyForPdf, loadPdfFonts } from "@/lib/companyPdf";
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";
import { exportRows } from "@/lib/assignments";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";
import { useAssignmentStatusLabels } from "./status";

const HEADERS = {
  employee: ["Employee", "Radnik", "Zamestnanec"],
  employee_code: ["Employee ID", "Šifra radnika", "ID zamestnanca"],
  project: ["Project", "Projekat", "Projekt"],
  client: ["Client", "Klijent", "Klient"],
  job_role: ["Job Role", "Job Role", "Pracovná rola"],
  b2c_rate: ["B2C Rate (per hour)", "B2C tarifa (po satu)", "Sadzba B2C (za hodinu)"],
  b2c_currency: ["B2C Currency", "B2C valuta", "Mena B2C"],
  b2b_rate: ["B2B Rate (per hour)", "B2B tarifa (po satu)", "Sadzba B2B (za hodinu)"],
  b2b_currency: ["B2B Currency", "B2B valuta", "Mena B2B"],
  start_date: ["Start Date", "Početak", "Začiatok"],
  end_date: ["End Date", "Kraj", "Koniec"],
  status: ["Status", "Status", "Stav"],
};
const PDF_WIDTHS = {
  employee: 40, employee_code: 20, project: 38, client: 32, job_role: 30, b2c_rate: 20, b2c_currency: 12,
  b2b_rate: 20, b2b_currency: 12, start_date: 21, end_date: 21, status: 22,
};

const stamp = () => new Date().toISOString().slice(0, 10);

/**
 * @param {object[]} props.rows      ceo filtriran i sortiran skup (decorateAssignments → filter → sort)
 * @param {string} props.filterText  opis aktivnih filtera i referentnog dana (ide u Excel i PDF)
 */
export default function AssignmentExport({ rows, filterText }) {
  const L = useL();
  const { lang } = useLang();
  const { permissions } = useAuth();
  const statusLabels = useAssignmentStatusLabels();
  const [busy, setBusy] = useState(false);
  const idx = lang === "rs" ? 1 : lang === "sk" ? 2 : 0;

  const table = () => {
    const { columns, rows: out } = exportRows(rows, permissions || []);
    const headers = columns.map((c) => HEADERS[c]?.[idx] || c);
    const body = out.map((r) => columns.map((c) => {
      const v = r[c];
      if (c === "status") return statusLabels[v] || v;
      return v === null || v === undefined ? "" : v;
    }));
    return { columns, headers, body, out };
  };
  const title = L("Project Assignments", "Angažmani na projektima", "Pridelenia na projektoch");

  const csv = () => {
    const { headers, body } = table();
    downloadCsv(`project-assignments-${stamp()}.csv`, toCsv([headers, ...body], ";"));
  };

  const excel = () => {
    const { headers, body } = table();
    const aoa = [[title], [L("Generated", "Napravljeno", "Vytvorené"), stamp()]];
    if (filterText) aoa.push([L("Filters", "Filteri", "Filtre"), filterText]);
    aoa.push([], headers, ...body);
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, title.slice(0, 31));
    XLSX.writeFile(wb, `project-assignments-${stamp()}.xlsx`);
  };

  const pdf = async () => {
    const { columns, headers, out } = table();
    const locale = intlLocale(lang);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const [fonts, company] = await Promise.all([loadPdfFonts(), loadCompanyForPdf().catch(() => null)]);
    const font = applyPdfFonts(doc, fonts);
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const ML = 10;
    const MT = 10;
    const MB = 14;
    const avail = W - 2 * ML;
    const raw = columns.map((c) => PDF_WIDTHS[c] || 20);
    const scale = avail / raw.reduce((s, w) => s + w, 0);
    const widths = raw.map((w) => w * scale);
    const right = new Set(["b2c_rate", "b2b_rate"]);

    let y = MT;
    const headerH = drawCompanyHeader(doc, company, { x: ML, y: MT, right: W - ML, font });
    y += headerH ? headerH + 2 : 0;
    doc.setFont(font, "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text(title, ML, y + 5);
    doc.setFont(font, "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(`${L("Generated", "Napravljeno", "Vytvorené")}: ${formatIsoDate(stamp(), lang)} · ${L("Assignments", "Angažmana", "Pridelení")}: ${out.length}`, ML, y + 10);
    y += 13;
    if (filterText) {
      const lines = doc.splitTextToSize(`${L("Filters", "Filteri", "Filtre")}: ${filterText}`, avail);
      doc.text(lines, ML, y + 2);
      y += lines.length * 4 + 1;
    }
    y += 3;
    const rowH = 6;
    const fit = (text, w) => {
      if (doc.getTextWidth(text) <= w - 2) return text;
      let t = text;
      while (t.length > 1 && doc.getTextWidth(`${t}…`) > w - 2) t = t.slice(0, -1);
      return `${t}…`;
    };
    const cell = (r, c) => {
      const v = r[c];
      if (c === "start_date" || c === "end_date") return v ? formatIsoDate(v, lang) : c === "end_date" ? L("Open-ended", "Bez kraja", "Na neurčito") : "";
      if (c === "status") return statusLabels[v] || v;
      if (right.has(c)) return v === null || v === undefined ? "—" : Number(v).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return String(v ?? "");
    };
    const drawRow = (values, bold) => {
      doc.setFont(font, bold ? "bold" : "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(bold ? 30 : 40, bold ? 30 : 40, bold ? 30 : 40);
      let x = ML;
      values.forEach((t, i) => {
        const al = right.has(columns[i]) ? "right" : "left";
        doc.text(fit(String(t), widths[i]), al === "right" ? x + widths[i] - 1 : x + 1, y + 4.2, { align: al });
        x += widths[i];
      });
    };
    const head = () => {
      doc.setFillColor(238, 240, 244);
      doc.rect(ML, y, avail, rowH, "F");
      drawRow(headers, true);
      y += rowH;
    };
    head();
    for (const r of out) {
      if (y + rowH > H - MB) {
        doc.addPage();
        y = MT;
        head();
      }
      drawRow(columns.map((c) => cell(r, c)), false);
      doc.setDrawColor(225, 228, 233);
      doc.line(ML, y + rowH, ML + avail, y + rowH);
      y += rowH;
    }
    const pages = doc.getNumberOfPages();
    doc.setFont(font, "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.text(`${L("Page", "Strana", "Strana")} ${p} / ${pages}`, W - ML, H - 6, { align: "right" });
    }
    doc.save(`project-assignments-${stamp()}.pdf`);
  };

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  const empty = rows.length === 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2 bg-card" disabled={busy || empty}>
            <Download className="h-4 w-4" />
            {L("Export", "Izvoz", "Export")}
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => run(csv)}><FileText className="mr-2 h-4 w-4" />{L("Export CSV", "Izvoz CSV", "Export CSV")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(excel)}><FileSpreadsheet className="mr-2 h-4 w-4" />{L("Export Excel", "Izvoz Excel", "Export Excel")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" className="gap-2 bg-card" disabled={busy || empty} onClick={() => run(pdf)}>
        <ChartColumn className="h-4 w-4" />
        {L("Generate Report", "Napravi izveštaj", "Vytvoriť prehľad")}
      </Button>
    </>
  );
}
