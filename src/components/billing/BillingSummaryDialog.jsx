// Nov Billing Summary (spec §9): klijent, opcioni projekat, period i valuta. Pregled živo pokazuje obračun
// (Approved Hours × B2B × Client Coef) i upozorava na preklapanje; baza ga ionako odbija (guard_billing_overlap).
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CURRENCIES } from "@/lib/finance/currency";
import { formatIsoDate } from "@/lib/dateFormat";
import { findOverlap, summaryCalculation } from "@/lib/billingOverview";
import { money, useInvalidateBilling } from "./billingShared";

const ALL = "__all__";

export default function BillingSummaryDialog({ open, onOpenChange, initial, data, T, lang, onCreated }) {
  const invalidate = useInvalidateBilling();
  const [form, setForm] = useState(initial);
  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const clientProjects = useMemo(
    () => data.projects.filter((p) => p.client_id && p.client_id === form?.client_id),
    [data.projects, form?.client_id]
  );
  const draft = form ? { ...form, project_id: form.project_id || null, status: "in_preparation" } : null;
  const valid = Boolean(draft?.client_id && draft.period_start && draft.period_end && draft.currency);
  const periodBad = valid && draft.period_end < draft.period_start;
  const overlap = valid && !periodBad ? findOverlap(draft, data.summaries) : null;
  const calc = valid && !periodBad ? summaryCalculation(draft, { laborLines: data.laborLines }) : null;

  const save = useMutation({
    mutationFn: () => base44.entities.BillingSummary.create({
      client_id: draft.client_id,
      project_id: draft.project_id,
      period_start: draft.period_start,
      period_end: draft.period_end,
      currency: draft.currency,
      notes: draft.notes?.trim() || null,
    }),
    onSuccess: (row) => {
      invalidate();
      toast.success(T.created);
      onOpenChange(false);
      onCreated?.(row);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!form) return null;
  const overlapText = overlap
    ? `${formatIsoDate(overlap.period_start, lang)} – ${formatIsoDate(overlap.period_end, lang)}, ${overlap.project_id ? data.lookup.projectName(overlap.project_id) : T.allProjectsOfClient}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{T.newSummary}</DialogTitle>
          <DialogDescription>{T.newSummaryHint}</DialogDescription>
        </DialogHeader>
        <form id="billing-summary-form" className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (valid && !periodBad && !overlap) save.mutate(); }}>
          <div className="space-y-1.5 col-span-2">
            <Label>{T.client} *</Label>
            <Select value={form.client_id || ""} onValueChange={(v) => set({ client_id: v, project_id: null })}>
              <SelectTrigger><SelectValue placeholder={T.client} /></SelectTrigger>
              <SelectContent>{data.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>{T.project}</Label>
            <Select value={form.project_id || ALL} onValueChange={(v) => set({ project_id: v === ALL ? null : v })} disabled={!form.client_id}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{T.allProjectsOfClient}</SelectItem>
                {clientProjects.map((p) => <SelectItem key={p.id} value={p.id}>{data.lookup.projectName(p.id)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bs-from">{T.from} *</Label>
            <Input id="bs-from" type="date" required value={form.period_start || ""} onChange={(e) => set({ period_start: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bs-to">{T.to} *</Label>
            <Input id="bs-to" type="date" required min={form.period_start || undefined} value={form.period_end || ""} onChange={(e) => set({ period_end: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{T.currency} *</Label>
            <Select value={form.currency || "EUR"} onValueChange={(v) => set({ currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">{T.preview}</p>
            <p className="text-lg font-semibold tabular-nums">{calc ? money(calc.amount, draft.currency, lang) : "—"}</p>
            {calc && <p className="text-xs text-muted-foreground">{calc.totals.hours} {T.hours.toLowerCase()}</p>}
          </div>
          <p className="col-span-2 text-xs text-muted-foreground -mt-1">{T.previewHint}</p>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="bs-notes">{T.notes}</Label>
            <Textarea id="bs-notes" rows={2} placeholder={T.notesPlaceholder} value={form.notes || ""} onChange={(e) => set({ notes: e.target.value })} />
          </div>
          {periodBad && <p className="col-span-2 text-sm text-destructive">{T.periodInvalid}</p>}
          {overlap && (
            <p className="col-span-2 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{T.overlapWarning(overlapText)}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>{T.cancel}</Button>
          <Button type="submit" form="billing-summary-form" disabled={!valid || periodBad || !!overlap || save.isPending}>{T.create}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
