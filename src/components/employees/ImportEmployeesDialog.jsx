import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadCsv, parseCsv, readCsvFile, rowToObject, mapColumns } from "@/lib/csvImport";
import {
  EMPLOYEE_FIELDS, fieldsFor, employeeTemplate, isCommentRow, validateEmployeeRow, planImport, errorReportCsv,
  RESULT_LABELS,
} from "@/lib/csvEmployees";
import { normalizePrivate } from "@/lib/employeePrivate";
import { useT } from "@/lib/translations";
import { useAuth } from "@/lib/AuthContext";

const MAX_ROWS = 1000;
const MAX_BYTES = 2 * 1024 * 1024;
const NONE = "__none";

const STATUS_STYLE = {
  ok: "bg-emerald-100 text-emerald-700",
  imported: "bg-emerald-100 text-emerald-700",
  duplicate: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
};

const LABEL = Object.fromEntries(EMPLOYEE_FIELDS.map((f) => [f.key, f.label]));
const fieldLabel = (key) => LABEL[key] || key;

export default function ImportEmployeesDialog({ open, onOpenChange }) {
  const T = useT();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const fields = useMemo(() => fieldsFor(isAdmin), [isAdmin]);

  const [step, setStep] = useState("upload"); // upload → map → preview → importing → done
  const [fileName, setFileName] = useState("");
  const [problem, setProblem] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]); // [{ line, cells }]
  const [mapping, setMapping] = useState({}); // { fieldKey: columnIndex }
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState(null);

  const { data: existing = [], isLoading: loadingExisting } = useQuery({
    queryKey: ["employees-import-check"],
    queryFn: () => base44.entities.Employee.list("-created_date"), // svi zaposleni (bez limita) za duplikate i šifre
    enabled: open,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["department-configs"],
    queryFn: () => base44.entities.DepartmentConfig.list("name", 200),
    enabled: open,
  });

  const reset = () => {
    setStep("upload"); setFileName(""); setProblem(""); setHeaders([]); setRows([]); setMapping({});
    setSkipDuplicates(true); setProgress({ done: 0, total: 0 }); setResults(null);
    if (fileRef.current) fileRef.current.value = "";
  };
  const close = (next) => {
    if (step === "importing") return;
    if (!next) reset();
    onOpenChange(next);
  };

  const downloadTemplate = (withExample) => {
    downloadCsv(withExample ? "teamora-employees-template-example.csv" : "teamora-employees-template.csv",
      employeeTemplate(isAdmin, { withExample }));
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProblem("");
    setFileName(file.name);
    if (file.size > MAX_BYTES) { setProblem(T("The file is too large (max 2 MB).")); return; }
    let parsed;
    try {
      parsed = parseCsv(await readCsvFile(file));
    } catch {
      setProblem(T("The file could not be read."));
      return;
    }
    // Broj reda: zaglavlje je red 1, podaci od reda 2 (redovi primera sa # se broje, ali ne uvoze).
    const data = parsed.rows.map((cells, i) => ({ line: i + 2, cells })).filter((r) => !isCommentRow(r.cells));
    if (!parsed.headers.length || !data.length) { setProblem(T("The file has no data rows.")); return; }
    if (data.length > MAX_ROWS) { setProblem(T("Too many rows (max 1000 per import).")); return; }
    setHeaders(parsed.headers);
    setRows(data);
    setMapping(mapColumns(parsed.headers, fields));
    setStep("map");
  };

  // Mapiranje po koloni fajla (UI) ↔ { polje: kolona } (biblioteka).
  const fieldForColumn = (idx) => Object.keys(mapping).find((k) => mapping[k] === idx) || NONE;
  const setColumnField = (idx, key) => setMapping((prev) => {
    const next = Object.fromEntries(Object.entries(prev).filter(([k, v]) => v !== idx && k !== key));
    if (key !== NONE) next[key] = idx;
    return next;
  });
  const missingRequired = fields.filter((f) => f.required && mapping[f.key] === undefined);
  // Kolone koje bi bile privatna polja, a korisnik nije admin — ne uvoze se (D3).
  const privateColumns = isAdmin ? [] : headers.filter((h) => Object.keys(mapColumns([h], EMPLOYEE_FIELDS.filter((f) => f.private))).length);

  const plan = useMemo(() => {
    if (step !== "preview" && step !== "importing" && step !== "done") return [];
    const validated = rows.map((r) => ({ line: r.line, ...validateEmployeeRow(rowToObject(r.cells, mapping), { departments, isAdmin }) }));
    return planImport(validated, existing, { skipDuplicates });
  }, [step, rows, mapping, departments, isAdmin, existing, skipDuplicates]);

  const counts = useMemo(() => plan.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}), [plan]);
  const ready = plan.filter((r) => r.status === "ok");

  const runImport = async () => {
    setStep("importing");
    setProgress({ done: 0, total: ready.length });
    const out = [];
    // Redom, ne paralelno: jasan napredak i bez trke oko šifara radnika.
    for (const row of plan) {
      if (row.status !== "ok") { out.push(row); continue; }
      try {
        const payload = isAdmin ? normalizePrivate(row.data, { isNew: true }) : row.data;
        await base44.entities.Employee.create(payload);
        out.push({ ...row, status: "imported" });
      } catch (err) {
        out.push({ ...row, status: "failed", importError: err?.message || T("Unknown error") });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setResults(out);
    setStep("done");
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["employees-for-id"] });
    queryClient.invalidateQueries({ queryKey: ["employees-import-check"] });
    const imported = out.filter((r) => r.status === "imported").length;
    if (imported) toast.success(`${T("Employees imported")}: ${imported}`);
  };

  const downloadReport = (list) => {
    downloadCsv("teamora-employees-import-report.csv", errorReportCsv(list, { T, fieldLabel }));
  };

  const rowMessages = (r) => [
    ...(r.errors || []).map((e) => ({ tone: "error", text: `${T(fieldLabel(e.field))}: ${T(e.key)}` })),
    ...(r.duplicates || []).map((d) => ({
      tone: "warn",
      text: `${T("Duplicate")} ${T(fieldLabel(d.field))} — ${d.source === "file" ? `${T("row")} ${d.ref}` : `${T("existing employee")} ${d.ref}`}`,
    })),
    ...(r.warnings || []).map((w) => ({ tone: "warn", text: `${T(fieldLabel(w.field))}: ${T(w.key)}` })),
    ...(r.importError ? [{ tone: "error", text: r.importError }] : []),
  ];

  const sample = (idx) => rows.find((r) => String(r.cells[idx] ?? "").trim())?.cells[idx] ?? "";
  const doneCounts = results ? results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}) : {};
  const notImported = results ? results.filter((r) => r.status !== "imported") : [];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-primary" /> {T("Import employees from CSV")}</DialogTitle>
          <DialogDescription>
            {T("Separator , or ; — columns are matched automatically by their English or Serbian names.")}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium">1. {T("Download the template and fill it in")}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadTemplate(false)}>
                  <Download className="w-4 h-4" /> {T("Download template")}
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadTemplate(true)}>
                  <Download className="w-4 h-4" /> {T("Template with example row")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {T("Fields marked * are required.")} {T("First Name")} *, {T("Last Name")} *. {T("Rows starting with # are ignored (the example row).")}{" "}
                {T("Dates: dd.mm.yyyy or yyyy-mm-dd. Empty Employee ID gets the next EMP-number.")}
                {!isAdmin && <> {T("JMBG, ID documents and bank data can be imported only by an admin.")}</>}
              </p>
            </div>
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium">2. {T("Upload the CSV file")}</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} aria-label={T("Choose CSV file")} />
              <Button className="gap-2" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4" /> {T("Choose CSV file")}
              </Button>
              {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
              {problem && <p className="text-sm text-destructive flex items-center gap-2"><XCircle className="w-4 h-4" /> {problem}</p>}
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{fileName}</span> · {rows.length} {T("rows")} · {T("Map file columns to employee fields")}
            </p>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">{T("File column")}</th>
                    <th className="text-left px-3 py-2 font-medium">{T("Example value")}</th>
                    <th className="text-left px-3 py-2 font-medium w-64">{T("Employee field")}</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, idx) => (
                    <tr key={`${h}-${idx}`} className="border-t">
                      <td className="px-3 py-2 font-medium">{h || <span className="text-muted-foreground">({T("empty")})</span>}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[220px]">{sample(idx)}</td>
                      <td className="px-3 py-1.5">
                        <Select value={fieldForColumn(idx)} onValueChange={(v) => setColumnField(idx, v)}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            <SelectItem value={NONE}>{T("Ignored column")}</SelectItem>
                            {fields.map((f) => (
                              <SelectItem key={f.key} value={f.key}>{T(f.label)}{f.required ? " *" : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {missingRequired.length > 0 && (
              <p className="text-sm text-destructive flex items-center gap-2">
                <XCircle className="w-4 h-4" /> {T("Required fields are not mapped")}: {missingRequired.map((f) => T(f.label)).join(", ")}
              </p>
            )}
            {privateColumns.length > 0 && (
              <p className="text-sm text-amber-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {T("JMBG, ID documents and bank data can be imported only by an admin.")} ({privateColumns.join(", ")})
              </p>
            )}
          </div>
        )}

        {(step === "preview" || step === "importing") && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`px-2 py-0.5 rounded ${STATUS_STYLE.ok}`}>{T("Will be imported")}: {counts.ok || 0}</span>
              <span className={`px-2 py-0.5 rounded ${STATUS_STYLE.duplicate}`}>{T("Skipped (duplicate)")}: {counts.duplicate || 0}</span>
              <span className={`px-2 py-0.5 rounded ${STATUS_STYLE.error}`}>{T("Error")}: {counts.error || 0}</span>
              {loadingExisting && <span className="text-muted-foreground flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {T("Checking existing employees...")}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="skip-dups" checked={skipDuplicates} disabled={step === "importing"} onCheckedChange={(v) => setSkipDuplicates(v === true)} />
              <Label htmlFor="skip-dups" className="text-sm font-normal">
                {T("Skip duplicates (same email or JMBG in the file or already in Teamora)")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">{T("A duplicate Employee ID is always skipped — it must be unique.")}</p>
            <div className="border rounded-lg overflow-hidden max-h-[45vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium w-14">{T("Row")}</th>
                    <th className="text-left px-3 py-2 font-medium">{T("Employee")}</th>
                    <th className="text-left px-3 py-2 font-medium">{T("Employee ID")}</th>
                    <th className="text-left px-3 py-2 font-medium">{T("Result")}</th>
                    <th className="text-left px-3 py-2 font-medium">{T("Details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((r) => (
                    <tr key={r.line} className="border-t align-top">
                      <td className="px-3 py-2 text-muted-foreground">{r.line}</td>
                      <td className="px-3 py-2 font-medium">{`${r.data.first_name || ""} ${r.data.last_name || ""}`.trim() || "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.data.employee_id || "—"}</td>
                      <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${STATUS_STYLE[r.status]}`}>{T(RESULT_LABELS[r.status])}</span></td>
                      <td className="px-3 py-2 text-xs space-y-0.5">
                        {rowMessages(r).map((m, i) => (
                          <div key={i} className={m.tone === "error" ? "text-destructive" : "text-amber-700"}>{m.text}</div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {step === "importing" && (
              <div className="space-y-1">
                <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
                <p className="text-xs text-muted-foreground">{T("Importing...")} {progress.done} / {progress.total}</p>
              </div>
            )}
          </div>
        )}

        {step === "done" && results && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                <div><p className="text-2xl font-bold">{doneCounts.imported || 0}</p><p className="text-xs text-muted-foreground">{T("Imported")}</p></div>
              </div>
              <div className="rounded-lg border p-3 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
                <div><p className="text-2xl font-bold">{doneCounts.duplicate || 0}</p><p className="text-xs text-muted-foreground">{T("Skipped (duplicate)")}</p></div>
              </div>
              <div className="rounded-lg border p-3 flex items-center gap-3">
                <XCircle className="w-6 h-6 text-red-600" />
                <div><p className="text-2xl font-bold">{(doneCounts.error || 0) + (doneCounts.failed || 0)}</p><p className="text-xs text-muted-foreground">{T("Errors")}</p></div>
              </div>
            </div>
            {notImported.length > 0 && (
              <div className="border rounded-lg max-h-[40vh] overflow-y-auto divide-y text-sm">
                {notImported.map((r) => (
                  <div key={r.line} className="px-3 py-2">
                    <span className="font-medium">{T("Row")} {r.line}</span>
                    {" · "}{`${r.data.first_name || ""} ${r.data.last_name || ""}`.trim() || "—"}
                    {" · "}<span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_STYLE[r.status]}`}>{T(RESULT_LABELS[r.status])}</span>
                    <div className="text-xs text-muted-foreground mt-0.5">{rowMessages(r).map((m) => m.text).join(" | ")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "map" && (
            <>
              <Button variant="outline" onClick={reset}>{T("Back")}</Button>
              <Button disabled={missingRequired.length > 0} onClick={() => setStep("preview")}>{T("Preview")}</Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("map")}>{T("Back")}</Button>
              {plan.some((r) => r.status !== "ok") && (
                <Button variant="outline" className="gap-2" onClick={() => downloadReport(plan)}>
                  <Download className="w-4 h-4" /> {T("Download error report")}
                </Button>
              )}
              <Button disabled={!ready.length || loadingExisting} onClick={runImport}>
                {T("Import")} ({ready.length})
              </Button>
            </>
          )}
          {step === "importing" && (
            <Button disabled className="gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {T("Importing...")}</Button>
          )}
          {step === "done" && (
            <>
              {notImported.length > 0 && (
                <Button variant="outline" className="gap-2" onClick={() => downloadReport(results)}>
                  <Download className="w-4 h-4" /> {T("Download error report")}
                </Button>
              )}
              <Button variant="outline" onClick={reset}>{T("Import another file")}</Button>
              <Button onClick={() => close(false)}>{T("Done")}</Button>
            </>
          )}
          {step === "upload" && <Button variant="outline" onClick={() => close(false)}>{T("Cancel")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
