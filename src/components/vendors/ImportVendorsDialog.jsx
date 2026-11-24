import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildTemplate, downloadCsv, parseCsv, readCsvFile, toCsv } from "@/lib/csvImport";
import { useT } from "@/lib/translations";
import {
  analyzeVendorImport, buildReportRows, summarizeVendorImport, VENDOR_IMPORT_FIELDS, VENDOR_TEMPLATE_EXAMPLE,
} from "@/lib/vendorImport";

const MAX_ROWS = 1000;
const MAX_BYTES = 2 * 1024 * 1024;

const STATUS_STYLE = {
  valid: "bg-emerald-100 text-emerald-700",
  duplicate: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

export default function ImportVendorsDialog({ open, onOpenChange, existingVendors }) {
  const T = useT();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [problem, setProblem] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null); // { created, failed: [{line, name, reason}] }

  const reset = () => {
    setFileName(""); setAnalysis(null); setProblem(""); setResult(null); setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };
  const close = (next) => {
    if (importing) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const statusLabel = { valid: T("Will be imported"), duplicate: T("Skipped (duplicate)"), error: T("Error") };

  const handleTemplate = () => {
    downloadCsv("vendors-template.csv", buildTemplate(VENDOR_IMPORT_FIELDS, [VENDOR_TEMPLATE_EXAMPLE]));
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProblem(""); setAnalysis(null); setResult(null); setFileName(file.name);
    if (file.size > MAX_BYTES) { setProblem(T("The file is too large (max 2 MB).")); return; }
    try {
      const parsed = parseCsv(await readCsvFile(file));
      if (parsed.headers.length === 0 || parsed.rows.length === 0) { setProblem(T("The file has no data rows.")); return; }
      if (parsed.rows.length > MAX_ROWS) { setProblem(T("Too many rows (max 1000 per import).")); return; }
      const a = analyzeVendorImport(parsed, existingVendors);
      if (!a.hasName) { setProblem(T("Column \"Vendor Name\" was not found. Download the template and use its column names.")); return; }
      setAnalysis(a);
    } catch {
      setProblem(T("The file could not be read."));
    }
  };

  const handleImport = async () => {
    const toImport = analysis.items.filter((it) => it.status === "valid");
    setImporting(true);
    let created = 0;
    const failed = [];
    // Redom, da Vendor ID (VEN-NNN) prati redosled iz fajla.
    for (const it of toImport) {
      try {
        await base44.entities.Vendor.create(it.data);
        created += 1;
      } catch (err) {
        failed.push({ line: it.line, name: it.data.name, reason: err?.message || T("Unknown error") });
      }
    }
    setImporting(false);
    setResult({ created, failed });
    queryClient.invalidateQueries({ queryKey: ["vendors"] });
    if (created > 0) toast.success(`${T("Vendors imported")}: ${created}`);
  };

  const downloadReport = () => {
    const rows = buildReportRows(analysis.items, T);
    result?.failed.forEach((f) => rows.push([f.line, T("Error"), f.reason, f.name]));
    downloadCsv("vendors-import-report.csv", toCsv(rows));
  };

  const counts = analysis?.counts;
  const summary = summarizeVendorImport(counts, result?.created, result?.failed.length);
  const skipped = summary.skipped;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{T("Import vendors from CSV")}</DialogTitle>
          <DialogDescription>
            {T("Vendor ID is assigned automatically; a Vendor ID column in the file is ignored.")}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3"><p className="text-2xl font-bold text-emerald-600">{result.created}</p><p className="text-xs text-muted-foreground">{T("Imported")}</p></div>
              <div className="rounded-lg border p-3"><p className="text-2xl font-bold text-amber-600">{skipped}</p><p className="text-xs text-muted-foreground">{T("Skipped")}</p></div>
              <div className="rounded-lg border p-3"><p className="text-2xl font-bold text-red-600">{result.failed.length}</p><p className="text-xs text-muted-foreground">{T("Failed")}</p></div>
            </div>
            {result.failed.length > 0 && (
              <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                {result.failed.map((f) => (
                  <li key={f.line} className="text-red-700">{T("Row")} {f.line} · {f.name}: {f.reason}</li>
                ))}
              </ul>
            )}
            {skipped + result.failed.length > 0 && (
              <Button variant="outline" size="sm" className="gap-2" onClick={downloadReport}>
                <Download className="w-4 h-4" />{T("Download error report")}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium">1. {T("Download the template and fill it in")}</p>
              <p className="text-xs text-muted-foreground">
                {T("Columns")}: {VENDOR_IMPORT_FIELDS.map((f) => f.label).join(", ")}. {T("Fields marked * are required.")}
              </p>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleTemplate}>
                <FileSpreadsheet className="w-4 h-4" />{T("Download template")}
              </Button>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium">2. {T("Upload the CSV file")}</p>
              <p className="text-xs text-muted-foreground">
                {T("Separator , or ; — columns are matched automatically by their English or Serbian names.")}
              </p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4" />{T("Choose CSV file")}
                </Button>
                {fileName && <span className="text-sm text-muted-foreground truncate">{fileName}</span>}
              </div>
              {problem && (
                <p className="text-sm text-red-700 flex items-start gap-2"><XCircle className="w-4 h-4 mt-0.5 shrink-0" />{problem}</p>
              )}
            </div>

            {analysis && (
              <div className="space-y-3">
                <p className="text-sm font-medium">3. {T("Preview")}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`px-2 py-1 rounded-full font-medium ${STATUS_STYLE.valid}`}>{T("Will be imported")}: {counts.valid}</span>
                  <span className={`px-2 py-1 rounded-full font-medium ${STATUS_STYLE.duplicate}`}>{T("Skipped (duplicate)")}: {counts.duplicate}</span>
                  <span className={`px-2 py-1 rounded-full font-medium ${STATUS_STYLE.error}`}>{T("Error")}: {counts.error}</span>
                </div>
                {analysis.ignored.length > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{T("Ignored column")}: {analysis.ignored.join(", ")}</p>
                )}
                {analysis.unknown.length > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{T("Unrecognized columns (not imported)")}: {analysis.unknown.join(", ")}</p>
                )}
                <div className="rounded-lg border overflow-auto max-h-72">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium w-14">{T("Row")}</th>
                        <th className="text-left px-3 py-2 font-medium">{T("Vendor Name")}</th>
                        <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">{T("Country")}</th>
                        <th className="text-left px-3 py-2 font-medium">{T("Result")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.items.map((it) => (
                        <tr key={it.line} className="border-t align-top">
                          <td className="px-3 py-2 text-muted-foreground">{it.line}</td>
                          <td className="px-3 py-2">{it.data.name || "—"}</td>
                          <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{it.data.country || "—"}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[it.status]}`}>{statusLabel[it.status]}</span>
                            {it.messages.map((m) => <p key={m} className="text-xs text-muted-foreground mt-1">{T(m)}</p>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" onClick={reset}>{T("Import another file")}</Button>
              <Button onClick={() => close(false)} className="gap-2"><CheckCircle2 className="w-4 h-4" />{T("Done")}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)} disabled={importing}>{T("Cancel")}</Button>
              <Button onClick={handleImport} disabled={!analysis || counts.valid === 0 || importing} className="gap-2">
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                {T("Import")} {counts ? `(${counts.valid})` : ""}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
