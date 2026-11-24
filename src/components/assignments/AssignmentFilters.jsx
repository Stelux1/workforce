// Filteri Project Assignments (§4.1): pretraga, Project, Client, Job Role, Status, Date Range i brzi režim Active / All.
// Stanje živi u URL-u (stranica), pa KPI i linkovi sa drugih ekrana otvaraju realnu filtriranu listu (T04).
import { useState } from "react";
import { CalendarDays, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { useAssignmentStatusLabels } from "./status";

const ALL = "all";
const STATUS_OPTIONS = ["active", "upcoming", "ending_soon", "completed", "cancelled"];

function Field({ label, children, className }) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function DateRange({ from, to, onChange }) {
  const L = useL();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const label = from || to
    ? `${from ? formatIsoDate(from, lang) : "…"} – ${to ? formatIsoDate(to, lang) : "…"}`
    : L("All dates", "Svi datumi", "Všetky dátumy");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-between gap-2 bg-card px-3 font-normal">
          <span className="inline-flex min-w-0 items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="end">
        <p className="text-xs text-muted-foreground">
          {L("Shows assignments that overlap the period.", "Prikazuje angažmane koji se preklapaju sa periodom.", "Zobrazí pridelenia, ktoré sa prekrývajú s obdobím.")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{L("From", "Od", "Od")}</Label>
            <Input type="date" value={from || ""} max={to || undefined} onChange={(e) => onChange({ from: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{L("To", "Do", "Do")}</Label>
            <Input type="date" value={to || ""} min={from || undefined} onChange={(e) => onChange({ to: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={() => { onChange({ from: "", to: "" }); setOpen(false); }} disabled={!from && !to}>
            {L("Clear", "Obriši", "Vymazať")}
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>{L("Done", "Gotovo", "Hotovo")}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * @param {object} props.filters  {q, project, client, role, status, from, to, mode, expiring}
 * @param {(patch: object) => void} props.onChange
 * @param {{projects, clients, roles: {key, label}[]}} props.options
 */
export default function AssignmentFilters({ filters, onChange, options }) {
  const L = useL();
  const labels = useAssignmentStatusLabels();
  const mode = filters.mode === "all" ? "all" : "active";
  const projects = options.projects.filter((p) => !filters.client || p.client_id === filters.client);

  return (
    <Card className="p-3 sm:p-4">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[minmax(220px,1.4fr)_repeat(5,minmax(0,1fr))_auto]">
        <div className="relative sm:col-span-2 lg:col-span-4 2xl:col-span-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filters.q || ""} onChange={(e) => onChange({ q: e.target.value })} className="h-10 bg-card pl-9"
            placeholder={L("Search employee, project or role", "Pretraga: radnik, projekat ili uloga", "Hľadať zamestnanca, projekt alebo rolu")}
            aria-label={L("Search", "Pretraga", "Hľadať")} />
        </div>
        <Field label={L("Project", "Projekat", "Projekt")}>
          <Select value={filters.project || ALL} onValueChange={(v) => onChange({ project: v === ALL ? "" : v })}>
            <SelectTrigger className="h-9 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{L("All projects", "Svi projekti", "Všetky projekty")}</SelectItem>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={L("Client", "Klijent", "Klient")}>
          <Select value={filters.client || ALL} onValueChange={(v) => onChange({ client: v === ALL ? "" : v, project: "" })}>
            <SelectTrigger className="h-9 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{L("All clients", "Svi klijenti", "Všetci klienti")}</SelectItem>
              {options.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={L("Job Role", "Job Role", "Pracovná rola")}>
          <Select value={filters.role || ALL} onValueChange={(v) => onChange({ role: v === ALL ? "" : v })}>
            <SelectTrigger className="h-9 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{L("All roles", "Sve uloge", "Všetky roly")}</SelectItem>
              {options.roles.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={L("Status", "Status", "Stav")}>
          <Select value={filters.status || ALL} onValueChange={(v) => onChange(v === ALL ? { status: "" } : { status: v, mode: "all" })}>
            <SelectTrigger className="h-9 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{L("All statuses", "Svi statusi", "Všetky stavy")}</SelectItem>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{labels[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={L("Date Range", "Period", "Obdobie")}>
          <DateRange from={filters.from} to={filters.to} onChange={onChange} />
        </Field>
        <div className="flex h-10 items-center rounded-lg border bg-muted/50 p-1 sm:col-span-2 lg:col-span-1" role="group"
          aria-label={L("Quick view", "Brzi prikaz", "Rýchly prehľad")}>
          {[
            ["active", L("Active", "Aktivni", "Aktívne")],
            ["all", L("All Assignments", "Svi angažmani", "Všetky pridelenia")],
          ].map(([key, text]) => (
            <button key={key} type="button" aria-pressed={mode === key}
              onClick={() => onChange(key === "active" ? { mode: "active", status: "" } : { mode: "all" })}
              className={cn("h-full flex-1 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                mode === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {text}
            </button>
          ))}
        </div>
      </div>
      {filters.expiring === "month" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-1 text-xs font-medium text-primary">
            {L("Expiring this month", "Ističu ovog meseca", "Končia tento mesiac")}
            <button type="button" onClick={() => onChange({ expiring: "" })} className="rounded-full p-0.5 hover:bg-primary/15"
              aria-label={L("Remove filter", "Ukloni filter", "Odstrániť filter")}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}
    </Card>
  );
}
