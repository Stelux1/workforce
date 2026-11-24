// Evidentiranje isplate (spec §7): datum, iznos, valuta (uvek valuta obaveze), referenca, opis. Korisnik koji
// evidentira upisuje baza. Pre slanja proverava canRecordPayment (isto kao guard_payment); baza odlučuje.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { canRecordPayment } from "@/lib/finance/payables";
import { invalidatePayables, money } from "./payablesShared";

const parseAmount = (text) => Number(String(text ?? "").trim().replace(/\s/g, "").replace(",", "."));

export default function PaymentDialog({ row, open, onOpenChange, T, lang }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setDate(format(new Date(), "yyyy-MM-dd"));
    setAmount(row.balance.remaining > 0 ? row.balance.remaining.toFixed(2) : "");
    setReference("");
    setDescription("");
    setTouched(false);
  }, [open, row]);

  const check = row ? canRecordPayment(row.balance, parseAmount(amount), { currency: row.currency, payableStatus: row.payable.status }) : null;
  const error = !touched ? null
    : !date ? T.payDateRequired
    : check && !check.ok ? (check.reason === "overpayment" ? T.payErr_overpayment(money(check.maxAmount, row.currency, lang)) : T[`payErr_${check.reason}`])
    : null;

  const save = useMutation({
    mutationFn: () => base44.entities.Payment.create({
      payable_id: row.id, payment_date: date, amount: Math.round(parseAmount(amount) * 100) / 100, currency: row.currency,
      reference: reference.trim() || null, description: description.trim() || null,
    }),
    onSuccess: () => {
      invalidatePayables(queryClient);
      toast.success(T.paySaved);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!date || !check?.ok) return;
    save.mutate();
  };

  if (!row) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{T.payTitle}</DialogTitle>
            <DialogDescription>{row.payeeName || T.unknownPayee} · {T.payHint(money(row.balance.remaining, row.currency, lang))}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">{T.paymentDate} *</Label>
              <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">{T.payAmount} ({row.currency}) *</Label>
              <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular-nums" autoFocus />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">{T.reference}</Label>
            <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={T.referencePlaceholder} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-desc">{T.description}</Label>
            <Textarea id="pay-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={T.descriptionPlaceholder} maxLength={500} />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{T.back}</Button>
            <Button type="submit" disabled={save.isPending}>{T.paySave}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
