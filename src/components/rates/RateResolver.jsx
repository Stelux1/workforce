import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TriangleAlert, CheckCircle2 } from "lucide-react";
import { activeAssignments, resolveRate, RATE_LABELS } from "@/lib/rateEngine";

const LABELS = {
  en: {
    title: "Rate Resolution Check", employee: "Employee", project: "Project", date: "Work Date",
    cost: "Cost rate", revenue: "Revenue rate", per: "per", level: "Source", missing_rate: "No applicable rate for this date",
    conflict: "Two active rates of the same level conflict — resolve before invoicing.",
    hint: "Rates are resolved for the work date, so a later rate change never rewrites earlier work.",
  },
  rs: {
    title: "Provera primene tarife", employee: "Zaposleni", project: "Projekat", date: "Datum rada",
    cost: "Tarifa troška", revenue: "Tarifa prihoda", per: "za", level: "Izvor", missing_rate: "Nema primenjive tarife za ovaj datum",
    conflict: "Dve aktivne tarife istog nivoa su u konfliktu — rešite pre fakturisanja.",
    hint: "Tarife se određuju prema datumu rada, pa kasnija promena tarife ne menja raniji rad.",
  },
};

const RESULT = ({ label, resolved, L, R }) => {
  if (!resolved.rate) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{label}</p>
        <p className="flex items-center gap-1.5 text-sm text-amber-800 mt-1">
          <TriangleAlert className="w-4 h-4 shrink-0" /> {L.missing_rate}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">
          {Number(resolved.rate.amount).toFixed(2)}
          <span className="text-xs font-medium text-muted-foreground"> {resolved.rate.currency || "EUR"} {L.per} {R[resolved.rate.unit] || resolved.rate.unit}</span>
        </p>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        {L.level}: {R[resolved.levelName] || resolved.levelName}
        {resolved.rate.position ? ` · ${resolved.rate.position}` : ""}
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
  const employee = employees.find((e) => e.id === emp);
  const assignment = activeAssignments(assignments, { employeeId: emp, projectId: proj, date })[0];

  const base = {
    rates,
    employeeId: emp,
    projectId: proj,
    position: assignment?.position || employee?.position || "",
    assignmentId: assignment?.id,
    date,
  };

  const cost = resolveRate({ ...base, kind: "cost" });
  const revenue = resolveRate({ ...base, kind: "revenue" });

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
          <RESULT label={L.cost} resolved={cost} L={L} R={R} />
          <RESULT label={L.revenue} resolved={revenue} L={L} R={R} />
        </div>

        <p className="text-xs text-muted-foreground">{L.hint}</p>
      </CardContent>
    </Card>
  );
}