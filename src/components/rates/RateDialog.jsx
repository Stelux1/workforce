// Rate History (spec §5, docs/TEAMORA-DATA-MODEL.md §2.5): nova tarifa (set_rate), promena cene od datuma
// (change_rate — stari red se zatvara dan pre, odobrene satnice čuvaju svoj snimak) i izmena kraja/statusa/napomene.
// Iznos, valuta i početak postojećeg reda se ne menjaju (baza: guard_rate_history).
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { CURRENCIES, RATE_LABELS, RATE_UNITS } from "@/lib/rateEngine";

const today = () => new Date().toISOString().slice(0, 10);

/** Ključevi upita koje tarifa menja (Rate History, projekat, Workers, provera tarife). */
export function invalidateRateViews(queryClient) {
  for (const queryKey of [["rates"], ["project-rates"], ["project-assignments"]]) queryClient.invalidateQueries({ queryKey });
}

/**
 * @param {"create"|"change"|"edit"} props.mode
 * @param {object} [props.rate]      postojeći red (change / edit)
 * @param {object} [props.defaults]  za create: { scope, kind, assignment_id, project_id, project_role_id, lockTarget }
 */
export default function RateDialog({ open, onOpenChange, mode = "create", rate, defaults = {}, projects = [], assignments = [] }) {
  const L = useL();
  const { lang } = useLang();
  const R = RATE_LABELS[lang] || RATE_LABELS.en;
  const queryClient = useQueryClient();
  const [form, setForm] = useState({});
  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  useEffect(() => {
    if (!open) return;
    if (mode === "create") {
      setForm({ scope: "role", kind: "revenue", unit: "hourly", currency: "EUR", effective_from: today(), amount: "", effective_to: "", notes: "", reason: "", ...defaults });
    } else if (mode === "change") {
      const from = rate.effective_from > today() ? rate.effective_from : today();
      setForm({ effective_from: from, amount: "", currency: rate.currency || "EUR", reason: "" });
    } else {
      setForm({ effective_to: rate.effective_to || "", status: rate.status || "active", notes: rate.notes || "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, rate]);

  const projectId = form.project_id;
  const { data: roles = [] } = useQuery({
    queryKey: ["project-roles", projectId],
    queryFn: () => base44.entities.ProjectRole.filter({ project_id: projectId }, "sort"),
    enabled: open && mode === "create" && form.scope === "role" && Boolean(projectId),
  });
  const projectAssignments = useMemo(
    () => assignments.filter((a) => a.status !== "cancelled" && (!projectId || a.project_id === projectId)),
    [assignments, projectId]
  );

  const save = useMutation({
    mutationFn: () => {
      if (mode === "change") {
        return base44.rpc("change_rate", {
          p_rate: rate.id, p_effective_from: form.effective_from, p_amount: Number(form.amount), p_currency: form.currency, p_reason: form.reason,
        });
      }
      if (mode === "edit") {
        return base44.entities.Rate.update(rate.id, { effective_to: form.effective_to || null, status: form.status, notes: form.notes || null });
      }
      const scope = form.scope === "assignment" ? "assignment" : "project";
      return base44.rpc("set_rate", {
        p: {
          scope,
          kind: form.kind,
          unit: form.unit,
          amount: Number(form.amount),
          currency: form.currency,
          assignment_id: form.scope === "assignment" ? form.assignment_id : null,
          project_id: form.project_id || null,
          project_role_id: form.scope === "role" ? form.project_role_id : null,
          effective_from: form.effective_from,
          effective_to: form.effective_to || null,
          notes: form.notes || null,
          reason: form.reason || null,
        },
      });
    },
    onSuccess: () => {
      invalidateRateViews(queryClient);
      toast.success(L("Rate saved", "Tarifa sačuvana", "Sadzba uložená"));
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const amountOk = Number(form.amount) > 0;
  let problem = null;
  if (mode === "change") {
    if (!amountOk) problem = L("Enter the new amount", "Unesite novi iznos", "Zadajte novú sumu");
    else if (!form.effective_from || form.effective_from < rate.effective_from || (rate.effective_to && form.effective_from > rate.effective_to))
      problem = L("The change date must be within the rate's validity", "Datum promene mora biti u periodu važenja tarife", "Dátum zmeny musí byť v období platnosti sadzby");
    else if ((form.reason || "").trim().length < 5) problem = L("Reason: at least 5 characters", "Razlog: najmanje 5 znakova", "Dôvod: aspoň 5 znakov");
  } else if (mode === "create") {
    if (!form.project_id) problem = L("Choose a project", "Izaberite projekat", "Vyberte projekt");
    else if (form.scope === "role" && !form.project_role_id) problem = L("Choose a job role", "Izaberite Job Role", "Vyberte pracovnú rolu");
    else if (form.scope === "assignment" && !form.assignment_id) problem = L("Choose an assignment", "Izaberite dodelu", "Vyberte pridelenie");
    else if (!amountOk) problem = L("The amount must be greater than 0", "Iznos mora biti veći od 0", "Suma musí byť väčšia ako 0");
    else if (!form.effective_from) problem = L("Effective date is required", "Datum važenja je obavezan", "Dátum platnosti je povinný");
    else if (form.effective_to && form.effective_to < form.effective_from)
      problem = L("The end date can't be before the start date.", "Datum završetka ne može biti pre datuma početka.", "Dátum ukončenia nemôže byť pred dátumom začiatku.");
  } else if (form.effective_to && form.effective_to < rate.effective_from) {
    problem = L("The end date can't be before the start date.", "Datum završetka ne može biti pre datuma početka.", "Dátum ukončenia nemôže byť pred dátumom začiatku.");
  }

  const title = mode === "change"
    ? L("Change rate from a date", "Promeni tarifu od datuma", "Zmeniť sadzbu od dátumu")
    : mode === "edit" ? L("Edit rate", "Izmena tarife", "Upraviť sadzbu") : L("New rate", "Nova tarifa", "Nová sadzba");
  const kindLabel = (k) => (k === "revenue" ? L("B2B — client (revenue)", "B2B — klijent (prihod)", "B2B — klient (tržba)") : L("B2C — worker (cost)", "B2C — radnik (trošak)", "B2C — pracovník (náklad)"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {rate && (
            <DialogDescription>
              {kindLabel(rate.kind)} · {Number(rate.amount).toFixed(2)} {rate.currency} / {R[rate.unit] || rate.unit} ·{" "}
              {formatIsoDate(rate.effective_from, lang)} → {rate.effective_to ? formatIsoDate(rate.effective_to, lang) : "∞"}
            </DialogDescription>
          )}
        </DialogHeader>

        {mode === "change" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{L("New amount", "Novi iznos", "Nová suma")} *</Label>
              <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{L("Currency", "Valuta", "Mena")}</Label>
              <Select value={form.currency || "EUR"} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{L("Valid from", "Važi od", "Platí od")} *</Label>
              <Input type="date" value={form.effective_from || ""} min={rate.effective_from} max={rate.effective_to || undefined}
                onChange={(e) => set("effective_from", e.target.value)} />
              <p className="text-xs text-muted-foreground">
                {form.effective_from && form.effective_from > rate.effective_from
                  ? L(`The current rate stays valid until the day before ${formatIsoDate(form.effective_from, lang)}; approved timesheets keep their rate.`,
                      `Trenutna tarifa važi do dana pre ${formatIsoDate(form.effective_from, lang)}; odobrene satnice zadržavaju svoju tarifu.`,
                      `Aktuálna sadzba platí do dňa pred ${formatIsoDate(form.effective_from, lang)}; schválené výkazy si ponechajú svoju sadzbu.`)
                  : L("Same start date: the current rate becomes inactive and is replaced.", "Isti početak: trenutna tarifa postaje neaktivna i zamenjuje se.", "Rovnaký začiatok: aktuálna sadzba sa stane neaktívnou a nahradí sa.")}
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{L("Reason", "Razlog", "Dôvod")} *</Label>
              <Textarea rows={2} value={form.reason || ""} onChange={(e) => set("reason", e.target.value)} />
            </div>
          </div>
        )}

        {mode === "edit" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{L("Valid to", "Važi do", "Platí do")}</Label>
              <Input type="date" value={form.effective_to || ""} min={rate.effective_from} onChange={(e) => set("effective_to", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{L("Status", "Status", "Stav")}</Label>
              <Select value={form.status || "active"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{L("Active", "Aktivna", "Aktívna")}</SelectItem>
                  <SelectItem value="inactive">{L("Inactive", "Neaktivna", "Neaktívna")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{L("Notes", "Napomena", "Poznámka")}</Label>
              <Textarea rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {L("To change the price use “Change from date” — the history keeps both rates.", "Za promenu cene koristite „Promeni od datuma” — istorija čuva obe tarife.", "Na zmenu ceny použite „Zmeniť od dátumu” — história si ponechá obe sadzby.")}
            </p>
          </div>
        )}

        {mode === "create" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{L("Applies to", "Primenjuje se na", "Platí pre")} *</Label>
              <Select value={form.scope} onValueChange={(v) => setForm((p) => ({ ...p, scope: v, assignment_id: "", project_role_id: "" }))} disabled={defaults.lockTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">{L("Job role on the project", "Job Role na projektu", "Pracovná rola na projekte")}</SelectItem>
                  <SelectItem value="assignment">{L("One assignment (exception)", "Jedna dodela (izuzetak)", "Jedno pridelenie (výnimka)")}</SelectItem>
                  <SelectItem value="project">{L("Whole project", "Ceo projekat", "Celý projekt")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{L("Type", "Vrsta", "Typ")} *</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", v)} disabled={defaults.lockKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">{kindLabel("revenue")}</SelectItem>
                  <SelectItem value="cost">{kindLabel("cost")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{L("Project", "Projekat", "Projekt")} *</Label>
              <Select value={form.project_id || ""} onValueChange={(v) => setForm((p) => ({ ...p, project_id: v, assignment_id: "", project_role_id: "" }))} disabled={defaults.lockTarget}>
                <SelectTrigger><SelectValue placeholder={L("Select project", "Izaberite projekat", "Vyberte projekt")} /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.scope === "role" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{L("Job role", "Job Role", "Pracovná rola")} *</Label>
                <Select value={form.project_role_id || ""} onValueChange={(v) => set("project_role_id", v)} disabled={defaults.lockTarget || !projectId}>
                  <SelectTrigger><SelectValue placeholder={L("Select job role", "Izaberite Job Role", "Vyberte pracovnú rolu")} /></SelectTrigger>
                  <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.scope === "assignment" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{L("Assignment", "Dodela", "Pridelenie")} *</Label>
                <Select value={form.assignment_id || ""} onValueChange={(v) => set("assignment_id", v)} disabled={defaults.lockTarget}>
                  <SelectTrigger><SelectValue placeholder={L("Select assignment", "Izaberite dodelu", "Vyberte pridelenie")} /></SelectTrigger>
                  <SelectContent>
                    {projectAssignments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{`${a.employee_name || ""} · ${a.position || ""} (${formatIsoDate(a.start_date, lang)})`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{L("Amount", "Iznos", "Suma")} *</Label>
              <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{L("Currency", "Valuta", "Mena")}</Label>
                <Select value={form.currency || "EUR"} onValueChange={(v) => set("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{L("Unit", "Jedinica", "Jednotka")}</Label>
                <Select value={form.unit || "hourly"} onValueChange={(v) => set("unit", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RATE_UNITS.map((u) => <SelectItem key={u} value={u}>{R[u]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{L("Valid from", "Važi od", "Platí od")} *</Label>
              <Input type="date" value={form.effective_from || ""} onChange={(e) => set("effective_from", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{L("Valid to", "Važi do", "Platí do")}</Label>
              <Input type="date" value={form.effective_to || ""} onChange={(e) => set("effective_to", e.target.value)} />
            </div>
            {form.unit && form.unit !== "hourly" && (
              <p className="text-xs text-warning sm:col-span-2">
                {L("Timesheets are calculated per hour — a non-hourly rate blocks approval until it is fixed.", "Satnice se obračunavaju po satu — tarifa koja nije po satu blokira odobravanje dok se ne ispravi.", "Výkazy sa počítajú za hodinu — sadzba, ktorá nie je hodinová, blokuje schválenie, kým sa neopraví.")}
              </p>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{L("Notes", "Napomena", "Poznámka")}</Label>
              <Textarea rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {problem && <p className="text-xs text-muted-foreground mr-auto self-center">{problem}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L("Cancel", "Odustani", "Zrušiť")}</Button>
          <Button onClick={() => save.mutate()} disabled={Boolean(problem) || save.isPending}>
            {save.isPending ? L("Saving...", "Čuvanje...", "Ukladá sa...") : L("Save", "Sačuvaj", "Uložiť")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
