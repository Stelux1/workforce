import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TriangleAlert, CheckCircle2 } from "lucide-react";
import { RATE_LABELS } from "@/lib/rateEngine";
import { MissingRateError } from "@/lib/payroll/monthly";
import { RATE_ORDER, RATE_SOURCES, RateUnitError, resolveSideRate } from "@/lib/payroll/rates";

const S = RATE_SOURCES;

const LABELS = {
  en: {
    title: "Rate Resolution Check", employee: "Employee", project: "Project", date: "Work Date",
    worker: "Worker rate (cost)", client: "Client rate (revenue)", perHour: "EUR per hour", level: "Source",
    missing_rate: "No rate at any level for this date — the timesheet can't be calculated or approved.",
    unit: (source, amount, currency, unit) => `${source}: ${amount} ${currency} ${unit}. Only EUR per hour is accepted — fix this rate (the next level is not used instead).`,
    noEmployee: "Choose an employee", noDate: "Choose a work date",
    conflict: "Two active rates of the same level conflict — resolve before invoicing.",
    position: "position", validFrom: "from",
    order: "Order: ", orderNote: " (job role for the client only).",
    hint: "Rates are resolved for the work date, so a later rate change never rewrites earlier work.",
    sources: {
      [S.ASSIGNMENT_RATE]: "Assignment rate (Rates)",
      [S.PROJECT_EMPLOYEE]: "Worker's rate on the project",
      [S.PROJECT_RATE]: "Project / position rate (Rates)",
      [S.JOB_ROLE]: "Job role on the project",
      [S.EMPLOYEE_RATE]: "Employee rate (Rates)",
      [S.PROFILE]: "Rate from the employee profile",
    },
  },
  rs: {
    title: "Provera primene tarife", employee: "Zaposleni", project: "Projekat", date: "Datum rada",
    worker: "Tarifa radnika (trošak)", client: "Tarifa klijenta (prihod)", perHour: "EUR po satu", level: "Izvor",
    missing_rate: "Nema tarife ni na jednom nivou za ovaj datum — satnica ne može da se obračuna ni odobri.",
    unit: (source, amount, currency, unit) => `${source}: ${amount} ${currency} ${unit}. Prima se samo EUR po satu — ispravite ovu tarifu (sledeći nivo se ne koristi umesto nje).`,
    noEmployee: "Izaberite zaposlenog", noDate: "Izaberite datum rada",
    conflict: "Dve aktivne tarife istog nivoa su u konfliktu — rešite pre fakturisanja.",
    position: "pozicija", validFrom: "od",
    order: "Redosled: ", orderNote: " (zanimanje samo za klijenta).",
    hint: "Tarife se određuju prema datumu rada, pa kasnija promena tarife ne menja raniji rad.",
    sources: {
      [S.ASSIGNMENT_RATE]: "Tarifa angažmana (Tarife)",
      [S.PROJECT_EMPLOYEE]: "Satnica radnika na projektu",
      [S.PROJECT_RATE]: "Tarifa projekta / pozicije (Tarife)",
      [S.JOB_ROLE]: "Zanimanje na projektu",
      [S.EMPLOYEE_RATE]: "Tarifa radnika (Tarife)",
      [S.PROFILE]: "Satnica iz profila radnika",
    },
  },
};

// Jedna strana kroz zajednički izbor tarife (src/lib/payroll/rates.js) — greška se prikazuje umesto broja.
function explain(side, input) {
  try {
    return { resolved: resolveSideRate(side, input) };
  } catch (error) {
    return { error };
  }
}

// Dodatni opis izvora: pozicija i datum važenja reda iz Tarifa, ili naziv zanimanja.
function sourceDetail(resolved, rates, L) {
  const row = rates.find((r) => r.id === resolved.ref);
  if (row) {
    return [row.position ? `${L.position} ${row.position}` : "", row.effective_from ? `${L.validFrom} ${row.effective_from}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  if (resolved.source === S.JOB_ROLE) return String(resolved.ref).split(":job_role:")[1] || "";
  return "";
}

const RESULT = ({ label, result, rates, L, R }) => {
  const { resolved, error } = result;
  if (!resolved) {
    let message = error?.message;
    if (error instanceof MissingRateError) message = L.missing_rate;
    else if (error instanceof RateUnitError) {
      message = L.unit(L.sources[error.source] || error.source, error.amount, error.currency, String(R[error.unit] || error.unit).toLowerCase());
    }
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{label}</p>
        <p className="flex items-center gap-1.5 text-sm text-amber-800 mt-1">
          <TriangleAlert className="w-4 h-4 shrink-0" /> {message}
        </p>
      </div>
    );
  }
  const detail = sourceDetail(resolved, rates, L);
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">
          {resolved.rate.toFixed(2)}
          <span className="text-xs font-medium text-muted-foreground"> {L.perHour}</span>
        </p>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        {L.level}: {L.sources[resolved.source] || resolved.source}
        {detail ? ` · ${detail}` : ""}
      </p>
      {resolved.conflict && (
        <p className="flex items-center gap-1.5 text-xs text-destructive mt-1">
          <TriangleAlert className="w-3.5 h-3.5 shrink-0" /> {L.conflict}
        </p>
      )}
    </div>
  );
};

export default function RateResolver({ employees = [], projects = [], assignments = [], rates = [], lang }) {
  const L = LABELS[lang] || LABELS.en;
  const R = RATE_LABELS[lang] || RATE_LABELS.en;
  const [employeeId, setEmployeeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const emp = employeeId || employees[0]?.id || "";
  const proj = projectId || projects[0]?.id || "";
  // Stranica je samo za admina, pa zaposleni dolazi sa privatnim poljima (b2c/b2b satnica iz profila).
  const employee = employees.find((e) => e.id === emp);
  const project = projects.find((p) => p.id === proj);

  const blocked = !emp ? L.noEmployee : !date ? L.noDate : null;
  const input = { date, employeeId: emp, project, assignments, rates, employeePrivate: employee };
  const worker = blocked ? { error: new Error(blocked) } : explain("worker", input);
  const client = blocked ? { error: new Error(blocked) } : explain("client", input);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="w-4 h-4" /> {L.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{L.employee}</Label>
            <Select value={emp} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{`${e.last_name || ""} ${e.first_name || ""}`.trim()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{L.project}</Label>
            <Select value={proj} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{L.date}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RESULT label={L.worker} result={worker} rates={rates} L={L} R={R} />
          <RESULT label={L.client} result={client} rates={rates} L={L} R={R} />
        </div>

        <p className="text-xs text-muted-foreground">
          {L.order}
          {RATE_ORDER.client.map((s) => L.sources[s]).join(" → ")}
          {L.orderNote}
        </p>
        <p className="text-xs text-muted-foreground">{L.hint}</p>
      </CardContent>
    </Card>
  );
}
