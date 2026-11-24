// Detalji jedne satnice (Phase 7, T-A2): dodela, tok statusa, problemi obračuna, tarife po danu (samo uz pravo na
// novac), intervali rada po danu (spec §6, T10) i korekcija odobrene satnice uz razlog (K11).
// Sva pravila sprovodi baza (guard_timesheet, timesheet_entries, reopen_timesheet); ovde je prikaz i unos.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useStaffDirectory } from "@/hooks/useStaffDirectory";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatIsoDate } from "@/lib/dateFormat";
import { addDays as addIsoDays, entryHours, overlappingEntries } from "@/lib/payroll/timesheetDays";
import { calcProblemText, groupedProblems, rateDays } from "@/lib/payroll/timesheetRow";

const HOUR_TYPE = {
  en: { redovni: "Regular", prekovremeni: "Overtime", vikend: "Weekend", praznik: "Holiday", praznik_vikend: "Holiday on weekend" },
  rs: { redovni: "Redovni", prekovremeni: "Prekovremeni", vikend: "Vikend", praznik: "Praznik", praznik_vikend: "Praznik vikendom" },
  sk: { redovni: "Bežné", prekovremeni: "Nadčas", vikend: "Víkend", praznik: "Sviatok", praznik_vikend: "Sviatok cez víkend" },
};
const NO_SHIFT = "__none__";
const rateText = (rate, currency) => (rate === null || rate === undefined ? "—" : `${Number(rate).toFixed(2)} ${currency || ""}/h`);
const timeText = (t) => (t ? String(t).slice(0, 5) : "");

export default function TimesheetDetailsDialog({ ts, open, onClose, lang, L, perms, assignment }) {
  const queryClient = useQueryClient();
  const staff = useStaffDirectory({ enabled: open });
  const [form, setForm] = useState({});
  const [reason, setReason] = useState("");
  const id = ts?.id;
  const approved = ts?.approval_status === "approved";
  const editable = !approved && perms.canEdit;

  const entriesQuery = useQuery({
    queryKey: ["timesheet-entries", id],
    queryFn: () => base44.entities.TimesheetEntry.filter({ timesheet_id: id }, "work_date"),
    enabled: open && Boolean(id),
  });
  const shiftsQuery = useQuery({
    queryKey: ["shifts", ts?.project_id || null],
    queryFn: () => base44.entities.Shift.filter({ active: true }, "sort"),
    enabled: open && Boolean(id),
  });
  const entries = entriesQuery.data || [];
  const shifts = (shiftsQuery.data || []).filter((s) => !s.project_id || s.project_id === ts?.project_id);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["timesheet-entries", id] });
    queryClient.invalidateQueries({ queryKey: ["timesheets"] });
  };

  const addEntry = useMutation({
    mutationFn: (data) => base44.entities.TimesheetEntry.create(data),
    onSuccess: () => { refresh(); setForm({}); toast.success(L("Interval added", "Interval je dodat", "Interval bol pridaný")); },
  });
  const deleteEntry = useMutation({
    mutationFn: (entryId) => base44.entities.TimesheetEntry.delete(entryId),
    onSuccess: () => { refresh(); toast.success(L("Interval removed", "Interval je uklonjen", "Interval bol odstránený")); },
  });
  const reopen = useMutation({
    mutationFn: () => base44.rpc("reopen_timesheet", { p_id: id, p_reason: reason.trim() }),
    onSuccess: () => {
      refresh();
      setReason("");
      toast.success(L("Timesheet returned to draft for correction", "Satnica je vraćena u nacrt radi korekcije", "Výkaz bol vrátený do konceptu na opravu"));
      onClose();
    },
  });

  if (!ts) return null;
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((i) => addIsoDays(String(ts.week_start).slice(0, 10), i));
  const problems = groupedProblems(ts);
  const showMoney = perms.seeB2C || perms.seeB2B;
  const days = showMoney ? rateDays(ts) : [];
  const HT = HOUR_TYPE[lang] || HOUR_TYPE.en;

  // Provera pre slanja (baza proverava i preklapanje sa satnicama drugih projekata).
  const shift = shifts.find((s) => s.id === form.shift_id);
  const draft = {
    timesheet_id: id,
    employee_id: ts.employee_id,
    work_date: form.work_date || "",
    shift_id: form.shift_id && form.shift_id !== NO_SHIFT ? form.shift_id : null,
    start_time: form.start_time || (shift ? shift.start_time : null),
    end_time: form.end_time || (shift ? shift.end_time : null),
    break_minutes: Number(form.break_minutes) || 0,
    notes: form.notes || null,
  };
  const draftHours = draft.start_time && draft.end_time ? entryHours(draft) : Number(form.hours) || null;
  const clash = draft.start_time && draft.end_time && overlappingEntries([...entries, { ...draft, id: "new" }])
    .some(([a, b]) => a.id === "new" || b.id === "new");
  const formError = !draft.work_date
    ? null
    : Boolean(draft.start_time) !== Boolean(draft.end_time)
      ? L("Enter both start and end time.", "Unesite i početak i kraj.", "Zadajte začiatok aj koniec.")
      : !(draftHours > 0)
        ? L("The interval must have more than 0 hours (break included).", "Interval mora imati više od 0 sati (sa pauzom).", "Interval musí mať viac ako 0 hodín (vrátane prestávky).")
        : clash
          ? L("Overlaps another interval of this timesheet.", "Preklapa se sa drugim intervalom ove satnice.", "Prekrýva sa s iným intervalom tohto výkazu.")
          : null;
  const canAdd = editable && draft.work_date && !formError && !addEntry.isPending;
  const submitEntry = () => addEntry.mutate({ ...draft, hours: draftHours });

  // §6/§7: ko je evidentirao, poslao, odobrio ili odbio (ime iz staff_directory(); bez imena ostaje samo datum).
  const by = (id) => (staff.name(id) ? ` · ${staff.name(id)}` : "");
  const statusLine = [
    staff.name(ts.created_by) && L(`Entered by ${staff.name(ts.created_by)}`, `Evidentirao ${staff.name(ts.created_by)}`, `Zaevidoval ${staff.name(ts.created_by)}`),
    ts.submitted_at && L(`Submitted ${formatIsoDate(ts.submitted_at, lang)}`, `Poslato ${formatIsoDate(ts.submitted_at, lang)}`, `Odoslané ${formatIsoDate(ts.submitted_at, lang)}`) + by(ts.submitted_by),
    ts.approved_date && L(`Approved ${formatIsoDate(ts.approved_date, lang)}`, `Odobreno ${formatIsoDate(ts.approved_date, lang)}`, `Schválené ${formatIsoDate(ts.approved_date, lang)}`) + by(ts.approved_by),
    ts.approval_status === "rejected" && ts.rejected_at && L(`Rejected ${formatIsoDate(ts.rejected_at, lang)}`, `Odbijeno ${formatIsoDate(ts.rejected_at, lang)}`, `Zamietnuté ${formatIsoDate(ts.rejected_at, lang)}`) + by(ts.rejected_by),
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ts.employee_name} · {ts.project || "—"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {formatIsoDate(weekDays[0], lang)} – {formatIsoDate(weekDays[6], lang)}
            {assignment && ` · ${assignment.position || L("Assignment", "Dodela", "Pridelenie")} (${formatIsoDate(assignment.start_date, lang)} – ${assignment.end_date ? formatIsoDate(assignment.end_date, lang) : "…"})`}
          </p>
        </DialogHeader>

        <div className="space-y-5">
          {/* Tok statusa */}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {statusLine.map((s) => <span key={s} className="rounded-md bg-muted px-2 py-1">{s}</span>)}
            {ts.correction_count > 0 && (
              <span className="rounded-md bg-warning-soft text-warning px-2 py-1">
                {L(`Corrections: ${ts.correction_count}`, `Korekcija: ${ts.correction_count}`, `Opravy: ${ts.correction_count}`)}
                {ts.last_correction_reason ? ` — ${ts.last_correction_reason}` : ""}
              </span>
            )}
          </div>
          {ts.approval_status === "rejected" && ts.rejection_reason && (
            <p className="text-sm rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <span className="font-medium">{L("Rejection reason", "Razlog odbijanja", "Dôvod zamietnutia")}:</span> {ts.rejection_reason}
            </p>
          )}

          {/* Problemi obračuna (bez iznosa — vide ih svi) */}
          {problems.length > 0 && (
            <div className="rounded-lg bg-warning-soft p-3 space-y-1" data-testid="timesheet-problems">
              <p className="text-sm font-medium text-warning flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                {L("This timesheet can't be approved yet", "Satnica još ne može da se odobri", "Výkaz zatiaľ nemožno schváliť")}
              </p>
              <ul className="list-disc pl-5 text-xs text-foreground space-y-0.5">
                {problems.map((p) => <li key={`${p.code}-${p.side}-${p.detail}`}>{calcProblemText(p, lang)}</li>)}
              </ul>
            </div>
          )}

          {/* Tarife po danu (T07) — samo uz pravo; za neodobren red to je procena */}
          {showMoney && days.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                {approved ? L("Rates applied per day", "Primenjene tarife po danu", "Uplatnené sadzby po dňoch")
                  : L("Rates per day (estimate — not approved)", "Tarife po danu (procena — nije odobreno)", "Sadzby po dňoch (odhad — neschválené)")}
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-1.5">{L("Date", "Datum", "Dátum")}</th>
                    <th className="text-left py-1.5">{L("Hour type", "Vrsta sati", "Druh hodín")}</th>
                    <th className="text-right py-1.5">{L("Hours", "Sati", "Hodiny")}</th>
                    {perms.seeB2C && <th className="text-right py-1.5">B2C</th>}
                    {perms.seeB2B && <th className="text-right py-1.5">B2B</th>}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={`${d.date}-${d.code}`} className="border-b last:border-0">
                      <td className="py-1.5">{formatIsoDate(d.date, lang)}</td>
                      <td className="py-1.5">{HT[d.code] || d.code}</td>
                      <td className="py-1.5 text-right">{d.hours}</td>
                      {perms.seeB2C && <td className="py-1.5 text-right">{rateText(d.workerRate, d.workerCurrency)}</td>}
                      {perms.seeB2B && <td className="py-1.5 text-right">{rateText(d.clientRate, d.clientCurrency)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Intervali rada po danu (spec §6, T10) */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><Clock className="w-4 h-4" />{L("Work intervals", "Intervali rada", "Pracovné intervaly")}</h3>
            <p className="text-xs text-muted-foreground">
              {L(
                "Optional. A day with intervals gets its hours from them; one employee can't have overlapping intervals, even on different projects.",
                "Opciono. Dan sa intervalima dobija sate iz njih; isti radnik ne može imati preklopljene intervale, ni na različitim projektima.",
                "Voliteľné. Deň s intervalmi má hodiny z nich; zamestnanec nemôže mať prekrývajúce sa intervaly ani na rôznych projektoch."
              )}
            </p>
            {entriesQuery.isLoading ? (
              <div className="h-10 rounded-lg bg-muted animate-pulse" />
            ) : entriesQuery.isError ? (
              <p className="text-xs text-destructive">{L("Intervals couldn't be loaded.", "Intervali nisu učitani.", "Intervaly sa nepodarilo načítať.")}</p>
            ) : entries.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{L("No intervals — hours are entered per day.", "Nema intervala — sati se unose po danu.", "Žiadne intervaly — hodiny sa zadávajú po dňoch.")}</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-28">{formatIsoDate(e.work_date, lang)}</span>
                    <span className="flex-1">
                      {e.start_time ? `${timeText(e.start_time)}–${timeText(e.end_time)}` : L("hours only", "samo sati", "iba hodiny")}
                      {e.break_minutes > 0 && <span className="text-muted-foreground"> · {L("break", "pauza", "prestávka")} {e.break_minutes} min</span>}
                      {e.notes && <span className="text-muted-foreground"> · {e.notes}</span>}
                      {staff.name(e.created_by) && <span className="text-muted-foreground"> · {staff.name(e.created_by)}</span>}
                    </span>
                    <Badge variant="outline">{Number(e.hours)} h</Badge>
                    {e.counts === false && <Badge variant="outline">{L("not counted (rejected)", "ne računa se (odbijeno)", "nepočíta sa (zamietnuté)")}</Badge>}
                    {editable && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={deleteEntry.isPending}
                        onClick={() => deleteEntry.mutate(e.id)} aria-label={L("Remove interval", "Ukloni interval", "Odstrániť interval")}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {editable && (
              <div className="rounded-lg border p-3 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">{L("Day", "Dan", "Deň")}</Label>
                    <Select value={form.work_date || ""} onValueChange={(v) => setForm((f) => ({ ...f, work_date: v }))}>
                      <SelectTrigger><SelectValue placeholder={L("Select day", "Izaberite dan", "Vyberte deň")} /></SelectTrigger>
                      <SelectContent>
                        {weekDays.map((d) => <SelectItem key={d} value={d}>{formatIsoDate(d, lang)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">{L("Shift", "Smena", "Zmena")}</Label>
                    <Select value={form.shift_id || NO_SHIFT} onValueChange={(v) => setForm((f) => ({ ...f, shift_id: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SHIFT}>{L("No shift", "Bez smene", "Bez zmeny")}</SelectItem>
                        {shifts.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.code} · {timeText(s.start_time)}–{timeText(s.end_time)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{L("Start", "Početak", "Začiatok")}</Label>
                    <Input type="time" value={form.start_time || ""} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{L("End", "Kraj", "Koniec")}</Label>
                    <Input type="time" value={form.end_time || ""} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{L("Break (min)", "Pauza (min)", "Prestávka (min)")}</Label>
                    <Input type="number" min={0} step={5} value={form.break_minutes || ""} onChange={(e) => setForm((f) => ({ ...f, break_minutes: e.target.value }))} />
                  </div>
                  {!(draft.start_time && draft.end_time) && (
                    <div className="space-y-1">
                      <Label className="text-xs">{L("Hours", "Sati", "Hodiny")}</Label>
                      <Input type="number" min={0.25} max={24} step={0.25} value={form.hours || ""} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} />
                    </div>
                  )}
                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs">{L("Note", "Napomena", "Poznámka")}</Label>
                    <Input value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-xs ${formError ? "text-destructive" : "text-muted-foreground"}`}>
                    {formError || (draftHours > 0 ? L(`${draftHours} h`, `${draftHours} h`, `${draftHours} h`) : "")}
                  </p>
                  <Button size="sm" className="gap-1.5" disabled={!canAdd} onClick={submitEntry}>
                    <Plus className="w-3.5 h-3.5" />{L("Add interval", "Dodaj interval", "Pridať interval")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Korekcija odobrene satnice (K11) */}
          {approved && perms.canCorrect && (
            <div className="rounded-lg border border-warning/40 p-3 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><RotateCcw className="w-4 h-4" />{L("Correct approved timesheet", "Korekcija odobrene satnice", "Oprava schváleného výkazu")}</h3>
              <p className="text-xs text-muted-foreground">
                {L(
                  "Returns the timesheet to draft. The reason is recorded in the audit trail. If payroll for the month is already approved, the correction goes through Payroll as a payable adjustment.",
                  "Vraća satnicu u nacrt. Razlog se beleži u reviziji. Ako je obračun meseca već odobren, korekcija ide kroz Payroll kao korekcija obaveze.",
                  "Vráti výkaz do konceptu. Dôvod sa zapíše do auditu. Ak je mzda za mesiac už schválená, oprava ide cez Payroll ako úprava záväzku."
                )}
              </p>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={L("Reason (at least 5 characters)", "Razlog (najmanje 5 znakova)", "Dôvod (aspoň 5 znakov)")} />
              <div className="flex justify-end">
                <Button variant="outline" className="gap-1.5" disabled={reason.trim().length < 5 || reopen.isPending} onClick={() => reopen.mutate()}>
                  <RotateCcw className="w-3.5 h-3.5" />{L("Return to draft", "Vrati u nacrt", "Vrátiť do konceptu")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
