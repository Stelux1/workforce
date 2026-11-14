// Excel spisak isplata za banku iz odobrenog/isplaćenog obračuna (redove daje payslipExport.js → bankExportRows).
// Iznos je broj iz baze (payslips.neto) u ćeliji sa formatom „#,##0.00"; JMBG i račun su tekst (vodeće nule).
// Tačan format uvoza za banku još nije poznat (čeka Luku) — kolone su namerno jednostavne.
import * as XLSX from "xlsx";
import { bankExportFileName, bankExportRows, bankExportSheets } from "@/lib/payroll/payslipExport";

/** Radna sveska (bez čuvanja) — za preuzimanje i za test. */
export function buildBankWorkbook(rows, run, lang = "rs") {
  const wb = XLSX.utils.book_new();
  for (const s of bankExportSheets(rows, run, lang)) {
    const sheet = XLSX.utils.aoa_to_sheet([s.header, ...s.rows]);
    s.rows.forEach((_, i) => {
      const ref = XLSX.utils.encode_cell({ r: i + 1, c: s.amountColumn });
      if (sheet[ref] && sheet[ref].t === "n") sheet[ref].z = "#,##0.00";
    });
    sheet["!cols"] = s.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, sheet, s.name);
  }
  return wb;
}

/**
 * Preuzme Excel spisak isplata. Vraća redove (payments, invalidAmount, missingAccount, subcontractors) da stranica
 * može da upozori na iznos ≤ 0, radnike bez računa i radnike preko podizvođača.
 */
export function exportBankExcel({ run, payslips, employees, vendorNames, lang = "rs" }) {
  const rows = bankExportRows({ run, payslips, employees, vendorNames });
  XLSX.writeFile(buildBankWorkbook(rows, run, lang), bankExportFileName(run));
  return rows;
}
