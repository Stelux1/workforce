// Ručna evidencija eksterno izdatog računa (spec §9): referenca/broj iz drugog programa, datum, iznos, valuta, dospeće.
// Samo za praćenje i povezivanje sa internim obračunom — Teamora ne pravi, ne numeriše i ne šalje račune (T29).
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileCheck2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES } from "@/lib/finance/currency";
import { formatIsoDate } from "@/lib/dateFormat";
import { isPreparation } from "@/lib/billingOverview";
import { money, useInvalidateBilling } from "./billingShared";

const fromSummary = (s) => ({
  ext_invoice_reference: s.ext_invoice_reference || "",
  ext_invoice_date: s.ext_invoice_date || "",
  ext_invoice_amount: s.ext_invoice_amount ?? "",
  ext_invoice_currency: s.ext_invoice_currency || s.currency || "EUR",
  ext_due_date: s.ext_due_date || "",
});

export default function ExternalInvoiceForm({ summary, canManage, T, lang }) {
  const invalidate = useInvalidateBilling();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => fromSummary(summary));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const recorded = summary.ext_invoice_reference || summary.ext_invoice_amount !== null && summary.ext_invoice_amount !== undefined;
  const locked = isPreparation(summary);

  const save = useMutation({
    mutationFn: () => {
      const amount = form.ext_invoice_amount === "" ? null : Number(form.ext_invoice_amount);
      if (amount !== null && !(amount > 0)) throw new Error(T.amountPositive);
      return base44.entities.BillingSummary.update(summary.id, {
        ext_invoice_reference: form.ext_invoice_reference.trim() || null,
        ext_invoice_date: form.ext_invoice_date || null,
        ext_invoice_amount: amount,
        ext_invoice_currency: amount === null ? null : form.ext_invoice_currency,
        ext_due_date: form.ext_due_date || null,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success(T.saved);
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-primary" />{T.extTitle}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{T.extHint}</p>
        </div>
        {canManage && !editing && !locked && (
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => { setForm(fromSummary(summary)); setEditing(true); }}>
            <Pencil className="w-3.5 h-3.5" />{recorded ? T.extChange : T.extEdit}
          </Button>
        )}
      </div>

      {editing ? (
        <form
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ext-ref">{T.extReference}</Label>
            <Input id="ext-ref" value={form.ext_invoice_reference} onChange={(e) => set("ext_invoice_reference", e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ext-date">{T.extDate}</Label>
            <Input id="ext-date" type="date" value={form.ext_invoice_date} onChange={(e) => set("ext_invoice_date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ext-due">{T.extDue}</Label>
            <Input id="ext-due" type="date" value={form.ext_due_date} min={form.ext_invoice_date || undefined} onChange={(e) => set("ext_due_date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ext-amount">{T.extAmount}</Label>
            <Input id="ext-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.ext_invoice_amount} onChange={(e) => set("ext_invoice_amount", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{T.extCurrency}</Label>
            <Select value={form.ext_invoice_currency} onValueChange={(v) => set("ext_invoice_currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={save.isPending}>{T.cancel}</Button>
            <Button type="submit" disabled={save.isPending}>{T.save}</Button>
          </div>
        </form>
      ) : locked ? (
        <p className="text-sm text-muted-foreground">{T.extNotAllowed}</p>
      ) : recorded ? (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">{T.extReference}</dt><dd className="font-medium break-all">{summary.ext_invoice_reference || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{T.extDate}</dt><dd>{summary.ext_invoice_date ? formatIsoDate(summary.ext_invoice_date, lang) : "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{T.extAmount}</dt><dd className="font-semibold tabular-nums">{money(summary.ext_invoice_amount, summary.ext_invoice_currency || summary.currency, lang)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{T.extDue}</dt><dd>{summary.ext_due_date ? formatIsoDate(summary.ext_due_date, lang) : "—"}</dd></div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{T.extNone}</p>
      )}
    </section>
  );
}
