// Reassign Employee (§4.5): Transfer zatvara stari angažman dan pre datuma i otvara novi (transfer_assignment);
// Additional Assignment dodaje novi bez ukidanja starog (additional_assignment). Sati ostaju na angažmanu na koji su
// uneti — nijedna opcija ne gubi istorijske sate. Preklapanje istog radnika na istom projektu odbija baza.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, UserPlus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { addDays } from "@/lib/assignments";
import RateField, { emptyRate, rateInput } from "./RateFields";
import { invalidateAssignmentHistory } from "./EditAssignmentDialog";

/**
 * @param {"transfer"|"additional"} props.mode  početni režim (može se promeniti u dijalogu)
 */
export default function ReassignDialog({ open, onOpenChange, assignment, mode: initialMode = "transfer", projects = [], today }) {
  const L = useL();
  const { lang } = useLang();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canRates = Boolean(can?.("rates.manage"));
  const todayIso = today || new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({});
  const [b2c, setB2c] = useState(emptyRate());
  const [b2b, setB2b] = useState(emptyRate());
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open || !assignment) return;
    setMode(assignment.displayStatus === "completed" ? "additional" : initialMode);
    const afterStart = addDays(String(assignment.start_date).slice(0, 10), 1);
    setForm({
      project_id: assignment.project_id,
      project_role_id: assignment.project_role_id || "",
      date: todayIso > afterStart ? todayIso : afterStart,
      end_date: "",
      notes: "",
      reason: "",
    });
    setB2c(emptyRate());
    setB2b(emptyRate());
  }, [open, assignment, initialMode, todayIso]);

  const projectId = form.project_id;
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["project-roles", projectId],
    queryFn: () => base44.entities.ProjectRole.filter({ project_id: projectId }, "sort"),
    enabled: open && Boolean(projectId),
  });
  const activeRoles = roles.filter((r) => r.status === "active");

  const run = useMutation({
    mutationFn: () => {
      const rates = canRates ? { b2c: rateInput(b2c), b2b: rateInput(b2b) } : null;
      if (mode === "transfer") {
        return base44.rpc("transfer_assignment", {
          p_id: assignment.id, p_date: form.date, p_project: form.project_id, p_role: form.project_role_id,
          p_rates: rates && (rates.b2c || rates.b2b) ? rates : null, p_reason: form.reason,
        });
      }
      return base44.rpc("additional_assignment", {
        p_id: assignment.id,
        p: {
          project_id: form.project_id, project_role_id: form.project_role_id, start_date: form.date,
          end_date: form.end_date || null, notes: form.notes || null, ...(rates || {}),
        },
        p_reason: form.reason,
      });
    },
    onSuccess: () => {
      invalidateAssignmentHistory(queryClient, assignment);
      queryClient.invalidateQueries({ queryKey: ["project", form.project_id] });
      toast.success(mode === "transfer"
        ? L("Employee transferred — hours stay on the previous assignment", "Radnik je prebačen — sati ostaju na prethodnom angažmanu", "Zamestnanec presunutý — hodiny ostávajú na predchádzajúcom pridelení")
        : L("Additional assignment created", "Dodatni angažman je napravljen", "Ďalšie pridelenie vytvorené"));
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!assignment) return null;
  const transfer = mode === "transfer";
  const minDate = transfer ? addDays(String(assignment.start_date).slice(0, 10), 1) : undefined;
  const problem = !form.project_id
    ? L("Choose a project", "Izaberite projekat", "Vyberte projekt")
    : !form.project_role_id
      ? L("Choose a job role", "Izaberite Job Role", "Vyberte pracovnú rolu")
      : !form.date
        ? L("Choose the date", "Izaberite datum", "Vyberte dátum")
        : transfer && form.date < minDate
          ? L(`The transfer date must be after ${formatIsoDate(assignment.start_date, lang)}`, `Datum transfera mora biti posle ${formatIsoDate(assignment.start_date, lang)}`, `Dátum presunu musí byť po ${formatIsoDate(assignment.start_date, lang)}`)
          : !transfer && form.end_date && form.end_date < form.date
            ? L("The end date can't be before the start date.", "Datum završetka ne može biti pre datuma početka.", "Dátum ukončenia nemôže byť pred dátumom začiatku.")
            : (form.reason || "").trim().length < 5
              ? L("Reason: at least 5 characters", "Razlog: najmanje 5 znakova", "Dôvod: aspoň 5 znakov")
              : null;

  const modes = [
    { key: "transfer", icon: ArrowRightLeft, title: L("Transfer", "Transfer", "Presun"),
      text: L("Ends this assignment the day before and starts a new one.", "Završava ovaj angažman dan ranije i otvara novi.", "Ukončí toto pridelenie deň predtým a začne nové."),
      disabled: assignment.displayStatus === "completed" },
    { key: "additional", icon: UserPlus, title: L("Additional assignment", "Dodatni angažman", "Ďalšie pridelenie"),
      text: L("Keeps this assignment and adds another one.", "Zadržava ovaj angažman i dodaje još jedan.", "Ponechá toto pridelenie a pridá ďalšie.") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{L("Reassign employee", "Preraspodela radnika", "Presunúť zamestnanca")}</DialogTitle>
          <DialogDescription>
            {assignment.employeeName || assignment.employee_name} · {assignment.projectName || assignment.project_name} · {assignment.roleName || assignment.position}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
          {modes.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} disabled={m.disabled} onClick={() => setMode(m.key)}
              className={cn("flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                mode === m.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}>
              <m.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="block text-sm font-semibold">{m.title}</span>
                <span className="block text-xs text-muted-foreground">{m.text}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{L("Project", "Projekat", "Projekt")} *</Label>
            <Select value={form.project_id || ""} onValueChange={(v) => setForm((p) => ({ ...p, project_id: v, project_role_id: "" }))}>
              <SelectTrigger><SelectValue placeholder={L("Select project", "Izaberite projekat", "Vyberte projekt")} /></SelectTrigger>
              <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{L("Job role", "Job Role", "Pracovná rola")} *</Label>
            <Select value={form.project_role_id || ""} onValueChange={(v) => set("project_role_id", v)} disabled={!projectId || rolesLoading}>
              <SelectTrigger><SelectValue placeholder={L("Select job role", "Izaberite Job Role", "Vyberte pracovnú rolu")} /></SelectTrigger>
              <SelectContent>{activeRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
            </Select>
            {projectId && !rolesLoading && activeRoles.length === 0 && (
              <p className="text-xs text-warning">{L("The project has no job roles yet — add one on the project's Overview tab.", "Projekat još nema Job Role — dodajte ga na kartici Pregled projekta.", "Projekt zatiaľ nemá pracovné roly — pridajte ju na karte Prehľad projektu.")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{transfer ? L("Transfer date (first day on the new assignment)", "Datum transfera (prvi dan na novom angažmanu)", "Dátum presunu (prvý deň na novom pridelení)") : L("Start date", "Datum početka", "Dátum začiatku")} *</Label>
            <Input type="date" value={form.date || ""} min={minDate} onChange={(e) => set("date", e.target.value)} />
            {transfer && form.date && (
              <p className="text-xs text-muted-foreground">
                {L(`The current assignment ends on ${formatIsoDate(addDays(form.date, -1), lang)}.`, `Trenutni angažman se završava ${formatIsoDate(addDays(form.date, -1), lang)}.`, `Aktuálne pridelenie končí ${formatIsoDate(addDays(form.date, -1), lang)}.`)}
              </p>
            )}
          </div>
          {!transfer && (
            <div className="space-y-1.5">
              <Label>{L("End date", "Datum završetka", "Dátum ukončenia")}</Label>
              <Input type="date" value={form.end_date || ""} min={form.date} onChange={(e) => set("end_date", e.target.value)} />
              <p className="text-xs text-muted-foreground">{L("Empty = open-ended", "Prazno = bez kraja", "Prázdne = na neurčito")}</p>
            </div>
          )}
          {canRates && (
            <>
              <RateField id="re-b2c" label={L("B2C rate (worker, per hour)", "B2C tarifa (radnik, po satu)", "Sadzba B2C (pracovník, za hodinu)")}
                hint={L("Empty = the job role's B2C applies.", "Prazno = važi B2C Job Role.", "Prázdne = platí B2C pracovnej roly.")} value={b2c} onChange={setB2c} />
              <RateField id="re-b2b" label={L("B2B exception (client, per hour)", "B2B izuzetak (klijent, po satu)", "Výnimka B2B (klient, za hodinu)")}
                hint={L("Only if billed differently from the job role.", "Samo ako se naplaćuje drugačije od Job Role.", "Iba ak sa fakturuje inak ako rola.")} value={b2b} onChange={setB2b} />
            </>
          )}
          {!transfer && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{L("Notes", "Napomena", "Poznámka")}</Label>
              <Textarea rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{L("Reason", "Razlog", "Dôvod")} *</Label>
            <Input value={form.reason || ""} onChange={(e) => set("reason", e.target.value)} />
            <p className="text-xs text-muted-foreground">{L("At least 5 characters; saved in the audit trail.", "Najmanje 5 znakova; čuva se u istoriji izmena.", "Aspoň 5 znakov; uloží sa do histórie zmien.")}</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {problem && <p className="mr-auto self-center text-xs text-muted-foreground">{problem}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L("Cancel", "Odustani", "Zrušiť")}</Button>
          <Button onClick={() => run.mutate()} disabled={Boolean(problem) || run.isPending}>
            {run.isPending ? L("Saving...", "Čuvanje...", "Ukladá sa...") : transfer ? L("Transfer employee", "Prebaci radnika", "Presunúť zamestnanca") : L("Create assignment", "Napravi angažman", "Vytvoriť pridelenie")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
