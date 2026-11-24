// Financial Report sa filterima i izvozom (spec §10) — kartica projekta (`projectId`) i centralne Financial Reports.
// Brojke: financialReport → financialSummary (jedan obračunski servis). Izvoz koristi iste redove kao ekran, bez
// vrednosti za koje korisnik nema pravo (T26).
import { useMemo, useState } from "react";
import { endOfMonth, endOfYear, format, startOfMonth, startOfYear, subMonths } from "date-fns";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/AuthContext";
import { useLang } from "@/lib/LanguageContext";
import { useL } from "@/lib/translations";
import { formatIsoDate } from "@/lib/dateFormat";
import { financialReport, financialReportExportRows } from "@/lib/payroll/projectReport";
import { exportFinancialCsv, exportFinancialPdf, financialReportFileName } from "@/lib/payroll/financialReportExport";
import FinancialReportView from "./FinancialReportView";
import { useFinancialReportData } from "./useFinancialReportData";

const iso = (d) => format(d, "yyyy-MM-dd");

/** Period iz izbora: all | month | prev_month | year | custom. */
export function presetRange(preset, today = new Date(), custom = {}) {
  if (preset === "month") return { from: iso(startOfMonth(today)), to: iso(endOfMonth(today)) };
  if (preset === "prev_month") { const p = subMonths(today, 1); return { from: iso(startOfMonth(p)), to: iso(endOfMonth(p)) }; }
  if (preset === "year") return { from: iso(startOfYear(today)), to: iso(endOfYear(today)) };
  if (preset === "custom") return { from: custom.from || null, to: custom.to || null };
  return { from: null, to: null };
}

const fullName = (e) => `${e.first_name || ""} ${e.last_name || ""}`.trim() || e.email || "—";

function FilterSelect({ label, value, onChange, options, allLabel }) {
  return (
    <div className="space-y-1 min-w-[10rem]">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function FinancialReportPanel({ projectId = null, projectName = "" }) {
  const L = useL();
  const { lang } = useLang();
  const { permissions } = useAuth();
  const scope = projectId ? "project" : "central";
  const { data, loading, error } = useFinancialReportData({ projectId });

  const [preset, setPreset] = useState(projectId ? "all" : "year");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [filters, setFilters] = useState({ projectId: "all", clientId: "all", employeeId: "all", role: "all", costCategoryId: "all" });
  const [convert, setConvert] = useState(false);
  const [rateDate, setRateDate] = useState("");
  const [exporting, setExporting] = useState(null);

  const range = presetRange(preset, new Date(), custom);
  const today = iso(new Date());

  const names = useMemo(() => ({
    project: new Map(data.projects.map((p) => [p.id, p.project_number ? `${p.project_number} — ${p.name}` : p.name])),
    client: new Map(data.clients.map((c) => [c.id, c.name])),
    employee: new Map(data.employees.map((e) => [e.id, fullName(e)])),
    role: new Map(data.roles.map((r) => [r.id, r.title])),
    category: new Map(data.categories.map((c) => [c.id, c.name])),
  }), [data.projects, data.clients, data.employees, data.roles, data.categories]);

  // Job Role: ista uloga postoji po projektu (project_roles); centralni filter je po nazivu uloge (title_key) → svi ID-jevi.
  const roleOptions = useMemo(() => {
    const groups = new Map();
    for (const r of data.roles) {
      const key = r.title_key || r.title || r.id;
      const g = groups.get(key) || { value: key, label: r.title || key, ids: [] };
      g.ids.push(r.id);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "sr"));
  }, [data.roles]);

  const report = useMemo(() => {
    const roleIds = filters.role === "all" ? "all" : roleOptions.find((o) => o.value === filters.role)?.ids || [];
    return financialReport({
      timesheets: data.timesheets,
      costs: data.costs,
      projects: data.projects,
      assignments: data.assignments,
      categories: data.categories,
      exchangeRates: convert ? data.exchangeRates : null,
      convertTo: "EUR",
      rateDate: rateDate || range.to || today,
      range: { from: range.from, to: range.to },
      filters: {
        projectId: projectId || filters.projectId,
        clientId: projectId ? "all" : filters.clientId,
        employeeId: filters.employeeId,
        projectRoleId: roleIds,
        costCategoryId: filters.costCategoryId,
      },
      billing: data.billing.status === "ok" ? data.billing : null,
      payables: data.payables.status === "ok" ? data.payables : null,
      today,
    });
  }, [data, convert, rateDate, range.from, range.to, filters, roleOptions, projectId, today]);

  // Na kartici projekta: radnici sa angažmanom na projektu; centralno: svi radnici.
  const employeeOptions = useMemo(() => {
    const ids = projectId ? new Set(data.assignments.map((a) => a.employee_id)) : null;
    return data.employees.filter((e) => !ids || ids.has(e.id)).map((e) => ({ value: e.id, label: fullName(e) }));
  }, [data.employees, data.assignments, projectId]);

  const filterText = () => {
    const parts = [];
    parts.push(`${L("Period", "Period", "Obdobie")}: ${range.from || range.to ? `${range.from ? formatIsoDate(range.from, lang) : "…"} – ${range.to ? formatIsoDate(range.to, lang) : "…"}` : L("all time", "celo vreme", "celé obdobie")}`);
    if (projectId) parts.push(`${L("Project", "Projekat", "Projekt")}: ${projectName || names.project.get(projectId) || ""}`);
    else if (filters.projectId !== "all") parts.push(`${L("Project", "Projekat", "Projekt")}: ${names.project.get(filters.projectId) || ""}`);
    if (!projectId && filters.clientId !== "all") parts.push(`${L("Client", "Klijent", "Klient")}: ${names.client.get(filters.clientId) || ""}`);
    if (filters.employeeId !== "all") parts.push(`${L("Employee", "Radnik", "Pracovník")}: ${names.employee.get(filters.employeeId) || ""}`);
    if (filters.role !== "all") parts.push(`${L("Job role", "Uloga", "Pozícia")}: ${roleOptions.find((o) => o.value === filters.role)?.label || ""}`);
    if (filters.costCategoryId !== "all") parts.push(`${L("Cost category", "Kategorija troška", "Kategória nákladu")}: ${names.category.get(filters.costCategoryId) || ""}`);
    if (convert && report.summary.converted) parts.push(`EUR @ ${formatIsoDate(report.summary.converted.date, lang)}`);
    return parts.join(" · ");
  };

  const doExport = async (kind) => {
    const rows = financialReportExportRows(report, permissions, { names });
    const slug = projectId ? String(projectName || "project").normalize("NFKD").replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 40) : "";
    setExporting(kind);
    try {
      if (kind === "csv") exportFinancialCsv(rows, { lang, filterText: filterText(), filename: financialReportFileName("csv", slug) });
      else await exportFinancialPdf(rows, { lang, filterText: filterText(), filename: financialReportFileName("pdf", slug), title: projectId ? `${L("Financial Report", "Finansijski izveštaj", "Finančný prehľad")} — ${projectName}` : "" });
    } catch (e) {
      toast.error(e?.message || L("Export failed", "Izvoz nije uspeo", "Export zlyhal"));
    } finally {
      setExporting(null);
    }
  };

  const set = (key) => (v) => setFilters((f) => ({ ...f, [key]: v }));
  const all = L("All", "Svi", "Všetky");

  if (error) {
    return <Card className="p-6 text-sm text-destructive">{L("The report could not be loaded", "Izveštaj nije učitan", "Prehľad sa nepodarilo načítať")}: {error.message}</Card>;
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-[10rem]">
            <Label className="text-xs text-muted-foreground">{L("Period", "Period", "Obdobie")}</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="h-9" data-testid="financial-period"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{L("All time", "Celo vreme", "Celé obdobie")}</SelectItem>
                <SelectItem value="month">{L("This month", "Ovaj mesec", "Tento mesiac")}</SelectItem>
                <SelectItem value="prev_month">{L("Last month", "Prošli mesec", "Minulý mesiac")}</SelectItem>
                <SelectItem value="year">{L("This year", "Ova godina", "Tento rok")}</SelectItem>
                <SelectItem value="custom">{L("Custom", "Izaberi datume", "Vlastné")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{L("From", "Od", "Od")}</Label>
                <Input type="date" className="h-9" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{L("To", "Do", "Do")}</Label>
                <Input type="date" className="h-9" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              </div>
            </>
          )}
          {!projectId && (
            <>
              <FilterSelect label={L("Project", "Projekat", "Projekt")} value={filters.projectId} onChange={set("projectId")} allLabel={all}
                options={data.projects.map((p) => ({ value: p.id, label: names.project.get(p.id) }))} />
              <FilterSelect label={L("Client", "Klijent", "Klient")} value={filters.clientId} onChange={set("clientId")} allLabel={all}
                options={data.clients.map((c) => ({ value: c.id, label: c.name }))} />
            </>
          )}
          <FilterSelect label={L("Employee", "Radnik", "Pracovník")} value={filters.employeeId} onChange={set("employeeId")} allLabel={all}
            options={employeeOptions} />
          <FilterSelect label={L("Job role", "Uloga", "Pozícia")} value={filters.role} onChange={set("role")} allLabel={all} options={roleOptions} />
          <FilterSelect label={L("Cost category", "Kategorija troška", "Kategória nákladu")} value={filters.costCategoryId} onChange={set("costCategoryId")} allLabel={all}
            options={data.categories.map((c) => ({ value: c.id, label: c.name }))} />
          <div className="flex items-center gap-2 pb-1.5">
            <Switch id={`fx-${scope}`} checked={convert} onCheckedChange={setConvert} />
            <Label htmlFor={`fx-${scope}`} className="text-sm">{L("Show in EUR", "Prikaži u EUR", "Zobraziť v EUR")}</Label>
          </div>
          {convert && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{L("Rate date", "Datum kursa", "Dátum kurzu")}</Label>
              <Input type="date" className="h-9" value={rateDate || range.to || today} onChange={(e) => setRateDate(e.target.value)} />
            </div>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => doExport("csv")} disabled={loading || !!exporting} data-testid="financial-export-csv">
              {exporting === "csv" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport("pdf")} disabled={loading || !!exporting} data-testid="financial-export-pdf">
              {exporting === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}PDF
            </Button>
          </div>
        </div>
        {convert && data.exchangeRates.length === 0 && (
          <p className="text-xs text-warning mt-2">{L("No exchange rates are recorded — amounts in other currencies cannot be converted and stay per currency.", "Nijedan kurs nije upisan — iznosi u drugim valutama se ne mogu preračunati i ostaju po valuti.", "Nie je zapísaný žiadny kurz — sumy v iných menách nemožno prepočítať a zostávajú podľa meny.")}</p>
        )}
      </Card>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : (
        <FinancialReportView report={report} names={names} perms={permissions} flows={{ billing: data.billing, payables: data.payables }} scope={scope} />
      )}
    </div>
  );
}
