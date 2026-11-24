// Evidencija uplate klijenta i storno (spec §9, T16). Uplata se vezuje za obračun: klijent, projekat, period i
// valuta dolaze iz obračuna (baza ih proverava u guard_client_payment). Više delimičnih uplata; korekcija je
// storno uz razlog — uplata se nikad ne briše.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money, useInvalidateBilling } from "./billingShared";

const today = () => new Date().toISOString().slice(0, 10);

export function ClientPaymentDialog({ open, onOpenChange, summary, balance, T, lang }) {
  const invalidate = useInvalidateBilling();
  const [form, setForm] = useState({ payment_date: today(), amount: "", reference: "", ext_invoice_reference: "", notes: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const currency = balance?.currency || summary?.currency;
  const max = balance?.outstanding ?? null;

  const save = useMutation({
    mutationFn: () => {
      const amount = Number(form.amount);
      if (!(amount > 0)) throw new Error(T.amountPositive);
      return base44.entities.ClientPayment.create({
        billing_summary_id: summary.id,
        client_id: summary.client_id,
        payment_date: form.payment_date,
        amount,
        currency,
        reference: form.reference.trim() || null,
        ext_invoice_reference: form.ext_invoice_reference.trim() || null,
        notes: form.notes.trim() || null,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success(T.paymentSaved);
      onOpenChange(false);
      setForm({ payment_date: today(), amount: "", reference: "", ext_invoice_reference: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{T.addPayment}</DialogTitle>
          <DialogDescription>{T.paymentCurrencyNote(currency)}</DialogDescription>
        </DialogHeader>
        <form id="client-payment-form" className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="cp-date">{T.paymentDate} *</Label>
            <Input id="cp-date" type="date" required value={form.payment_date} onChange={(e) => set("payment_date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-amount">{T.amount} ({currency}) *</Label>
            <Input id="cp-amount" type="number" inputMode="decimal" required min="0.01" step="0.01" max={max ?? undefined}
              value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </div>
          {max !== null && <p className="col-span-2 text-xs text-muted-foreground -mt-1">{T.maxPayment(money(max, currency, lang))}</p>}
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="cp-ref">{T.reference}</Label>
            <Input id="cp-ref" value={form.reference} onChange={(e) => set("reference", e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="cp-ext">{T.extInvoiceRef}</Label>
            <Input id="cp-ext" value={form.ext_invoice_reference} placeholder={summary?.ext_invoice_reference || ""} onChange={(e) => set("ext_invoice_reference", e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="cp-notes">{T.notes}</Label>
            <Textarea id="cp-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>{T.cancel}</Button>
          <Button type="submit" form="client-payment-form" disabled={save.isPending}>{T.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VoidPaymentDialog({ payment, onOpenChange, T, lang }) {
  const invalidate = useInvalidateBilling();
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 5;
  const save = useMutation({
    mutationFn: () => base44.entities.ClientPayment.update(payment.id, { voided_at: new Date().toISOString(), void_reason: reason.trim() }),
    onSuccess: () => {
      invalidate();
      toast.success(T.voidDone);
      setReason("");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={!!payment} onOpenChange={(o) => { if (!o) setReason(""); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{T.voidTitle}</DialogTitle>
          <DialogDescription>{T.voidHint}</DialogDescription>
        </DialogHeader>
        {payment && (
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{money(payment.amount, payment.currency, lang)}</span>
            {payment.reference ? ` · ${payment.reference}` : ""}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="cp-void">{T.voidReason}</Label>
          <Textarea id="cp-void" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>{T.cancel}</Button>
          <Button variant="destructive" onClick={() => save.mutate()} disabled={!ok || save.isPending}>{T.voidPayment}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ClientPaymentDialog;
