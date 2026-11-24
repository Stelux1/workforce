// Storno isplate uz obavezan razlog (≥ 5 znakova). Isplata se ne menja i ne briše; ko i kada stornira upisuje baza.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { invalidatePayables, isoDate, money } from "./payablesShared";

export default function VoidPaymentDialog({ payment, open, onOpenChange, T, lang }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) { setReason(""); setTouched(false); }
  }, [open]);

  const valid = reason.trim().length >= 5;
  const save = useMutation({
    mutationFn: () => base44.entities.Payment.update(payment.id, { voided_at: new Date().toISOString(), void_reason: reason.trim() }),
    onSuccess: () => {
      invalidatePayables(queryClient);
      toast.success(T.voidSaved);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!payment) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); setTouched(true); if (valid) save.mutate(); }}
        >
          <DialogHeader>
            <DialogTitle>{T.voidTitle}</DialogTitle>
            <DialogDescription>
              {isoDate(payment.payment_date, lang)} · {money(payment.amount, payment.currency, lang)}
              {payment.reference ? ` · ${payment.reference}` : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{T.voidHint}</p>
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">{T.voidReason} *</Label>
            <Textarea id="void-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={T.voidReasonPlaceholder} autoFocus maxLength={500} />
          </div>
          {touched && !valid && <p className="text-sm text-destructive" role="alert">{T.reasonMin}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{T.back}</Button>
            <Button type="submit" variant="destructive" disabled={save.isPending}>{T.voidSave}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
