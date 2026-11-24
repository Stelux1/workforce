// Status obračuna (spec §9): ručna oznaka korisnika, NE izdavanje računa. Prelaz ide samo kroz RPC
// set_billing_status, koji proverava pravo (billing.manage), dozvoljen korak i beleži ko i kada (T29).
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BILLING_STATUS } from "@/lib/finance/billing";
import { canReturnToPreparation, nextBillingStatus } from "@/lib/billingOverview";
import { BillingStatusBadge, useInvalidateBilling } from "./billingShared";

export default function BillingStatusControl({ summary, canManage, T }) {
  const invalidate = useInvalidateBilling();
  const [confirm, setConfirm] = useState(null); // { to, back }
  const [reason, setReason] = useState("");
  const next = nextBillingStatus(summary.status);
  const canBack = canReturnToPreparation(summary);

  const change = useMutation({
    mutationFn: ({ to, note }) => base44.rpc("set_billing_status", { p_id: summary.id, p_status: to, p_note: note || null }),
    onSuccess: () => {
      invalidate();
      toast.success(T.statusChanged);
      setConfirm(null);
      setReason("");
    },
    onError: (e) => toast.error(e.message),
  });

  const open = (to, back = false) => {
    setReason("");
    setConfirm({ to, back });
  };
  const reasonOk = !confirm?.back || reason.trim().length >= 5;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <BillingStatusBadge status={summary.status} T={T} />
      {canManage && next && (
        <Button size="sm" className="gap-1.5" onClick={() => open(next)} disabled={change.isPending}>
          {T.nextStep(T.statuses[next])}
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      )}
      {canManage && canBack && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open(BILLING_STATUS.IN_PREPARATION, true)} disabled={change.isPending}>
          <ArrowLeft className="w-3.5 h-3.5" />
          {T.backToPreparation}
        </Button>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.back ? T.backToPreparation : T.nextStep(T.statuses[confirm?.to] || "")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.back ? T.backReasonHint : summary.status === BILLING_STATUS.IN_PREPARATION ? T.confirmFreeze : T.summariesHint}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm?.back && (
            <div className="space-y-2">
              <Label htmlFor="billing-back-reason">{T.backReason}</Label>
              <Textarea id="billing-back-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={change.isPending}>{T.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!reasonOk || change.isPending}
              onClick={(e) => {
                e.preventDefault();
                change.mutate({ to: confirm.to, note: confirm.back ? reason.trim() : null });
              }}
            >
              {T.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
