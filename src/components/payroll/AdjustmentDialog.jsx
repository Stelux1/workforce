// Korekcija obaveze (adjustment) sa razlogom: jedini način da se potvrđena obaveza promeni (npr. razlika do neta
// iz srpskog obračuna, odbitak, prekovremeni van satnice). Obračunati iznos ostaje; menja se ukupno.
// Ista pravila kao baza (guard_payable_line / sync_payable_totals): razlog ≥ 5, iznos ≠ 0, ukupno ≥ 0 i ≥ isplaćeno.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { round2 } from "@/lib/payroll/money";
import { invalidatePayables, money } from "./payablesShared";

const parseAmount = (text) => Number(String(text ?? "").trim().replace(/\s/g, "").replace(",", "."));

export default function AdjustmentDialog({ row, workers = [], open, onOpenChange, T, lang, initialAmount = null, initialReason = "" }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [workerId, setWorkerId] = useState("none");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(initialAmount === null ? "" : String(initialAmount));
    setWorkerId("none");
    setReason(initialReason || "");
    setTouched(false);
  }, [open, initialAmount, initialReason]);

  const n = parseAmount(amount);
  const save = useMutation({
    mutationFn: () => base44.entities.PayableLine.create({
      payable_id: row.id, kind: "adjustment", amount: round2(n), currency: row.currency, reason: reason.trim(),
      employee_id: row.payeeType === "employee" ? row.payeeId : workerId === "none" ? null : workerId,
    }),
    onSuccess: () => {
      invalidatePayables(queryClient);
      toast.success(T.adjSaved);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!row) return null;
  const newTotal = Number.isFinite(n) ? round2(row.balance.total + n) : row.balance.total;
  const newRemaining = round2(newTotal - row.balance.paid);
  const error = !Number.isFinite(n) || round2(n) === 0 ? T.adjErr_zero
    : newTotal < 0 ? T.adjErr_negative
    : newTotal < row.balance.paid ? T.adjErr_belowPaid(money(row.balance.paid, row.currency, lang))
    : reason.trim().length < 5 ? T.reasonMin
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!error) save.mutate(); }}>
          <DialogHeader>
            <DialogTitle>{T.adjTitle}</DialogTitle>
            <DialogDescription>{row.payeeName || T.unknownPayee}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{T.adjHint}</p>
          <div className="space-y-1.5">
            <Label htmlFor="adj-amount">{T.adjAmount} ({row.currency}) *</Label>
            <Input id="adj-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-25.00" className="tabular-nums" autoFocus />
          </div>
          {row.payeeType === "vendor" && workers.length > 0 && (
            <div className="space-y-1.5">
              <Label>{T.adjWorker}</Label>
              <Select value={workerId} onValueChange={setWorkerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{T.adjNoWorker}</SelectItem>
                  {workers.map((w) => <SelectItem key={w.employeeId} value={w.employeeId}>{w.name || "—"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">{T.reason} *</Label>
            <Textarea id="adj-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={T.adjReasonPlaceholder} maxLength={500} />
          </div>
          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <dt className="text-muted-foreground">{T.newTotal}</dt>
            <dd className="text-right font-semibold tabular-nums">{money(newTotal, row.currency, lang)}</dd>
            <dt className="text-muted-foreground">{T.newRemaining}</dt>
            <dd className="text-right tabular-nums">{money(newRemaining, row.currency, lang)}</dd>
          </dl>
          {touched && error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{T.back}</Button>
            <Button type="submit" disabled={save.isPending}>{T.adjSave}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
