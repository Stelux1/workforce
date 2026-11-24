// Approve / Reject zahteva za odsustvo (spec §14.1, T24). Pre odluke prikazuje simulaciju kapaciteta (RPC
// `leave_shortage`). Odluka ide isključivo kroz RPC `decide_leave_request`: uz manjak traži pravo
// leave.approve_shortage i razlog od najmanje 5 znakova — isto proverava baza, ovde je samo jasno unapred.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { snapshotRows } from "@/lib/replacements";
import CapacityImpact from "./CapacityImpact";
import { errorText } from "./common";

export const MIN_REASON = 5;

export default function DecisionDialog({ leave, open, onOpenChange, lookups, canApproveShortage, leaveTypeLabel, onApprovedWithShortage }) {
  const L = useL();
  const { lang } = useLang();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const shortageQ = useQuery({
    queryKey: ["leave-shortage", leave?.id],
    queryFn: () => base44.rpc("leave_shortage", { p_leave: leave.id }),
    enabled: open && !!leave?.id,
    staleTime: 0,
  });
  const rows = snapshotRows(shortageQ.data);
  const hasShortage = rows.length > 0;
  const reasonOk = reason.trim().length >= MIN_REASON;
  const approveBlocked = hasShortage && (!canApproveShortage || !reasonOk);

  const decide = useMutation({
    mutationFn: (decision) => base44.rpc("decide_leave_request", { p_id: leave.id, p_decision: decision, p_reason: reason.trim() || null }),
    onSuccess: (res, decision) => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-shortage"] });
      queryClient.invalidateQueries({ queryKey: ["workforce"] });
      queryClient.invalidateQueries({ queryKey: ["leave-replacement-data"] });
      toast.success(decision === "approved"
        ? (res?.shortage_override ? L("Leave approved despite the shortage", "Odsustvo odobreno uprkos manjku", "Neprítomnosť schválená napriek nedostatku") : L("Leave approved", "Odsustvo odobreno", "Neprítomnosť schválená"))
        : L("Leave rejected", "Odsustvo odbijeno", "Neprítomnosť zamietnutá"));
      setReason("");
      onOpenChange(false);
      if (decision === "approved" && res?.shortage_override) onApprovedWithShortage?.(leave.id);
    },
    onError: (e) => toast.error(errorText(e)),
  });

  if (!leave) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!decide.isPending) { onOpenChange(v); if (!v) setReason(""); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{L("Leave decision", "Odluka o odsustvu", "Rozhodnutie o neprítomnosti")}</DialogTitle>
          <DialogDescription>
            {lookups.employee(leave.employee_id) !== "—" ? lookups.employee(leave.employee_id) : leave.employee_name} · {leaveTypeLabel(leave.leave_type)} ·{" "}
            {formatIsoDate(leave.start_date, lang)} – {formatIsoDate(leave.end_date, lang)}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{L("Capacity check", "Provera kapaciteta", "Kontrola kapacity")}</h3>
          <CapacityImpact rows={rows} loading={shortageQ.isLoading} error={shortageQ.error} lookups={lookups} />
        </section>

        {hasShortage && !canApproveShortage && (
          <div className="flex items-start gap-2 rounded-lg border p-3 text-sm text-muted-foreground" data-testid="no-shortage-permission">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {L("Approving despite a shortage requires the “Approve leave despite shortage” permission. You can still reject, or ask an authorised manager.",
                "Odobrenje uprkos manjku traži pravo „Odobravanje odsustva uprkos manjku”. Možete da odbijete ili zamolite ovlašćenog menadžera.",
                "Schválenie napriek nedostatku vyžaduje oprávnenie „Schválenie neprítomnosti napriek nedostatku”. Môžete zamietnuť alebo požiadať oprávneného manažéra.")}
            </span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="leave-decision-reason">
            {hasShortage
              ? L("Reason (required to approve despite the shortage)", "Razlog (obavezan za odobrenje uprkos manjku)", "Dôvod (povinný pri schválení napriek nedostatku)")
              : L("Reason (optional)", "Razlog (opciono)", "Dôvod (voliteľné)")}
          </Label>
          <Textarea id="leave-decision-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder={L("Why — kept in the audit log", "Zašto — čuva se u audit logu", "Prečo — uloží sa do auditného záznamu")} />
          {hasShortage && canApproveShortage && !reasonOk && (
            <p className="text-xs text-muted-foreground">{L(`At least ${MIN_REASON} characters.`, `Najmanje ${MIN_REASON} znakova.`, `Aspoň ${MIN_REASON} znakov.`)}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={decide.isPending}>{L("Cancel", "Otkaži", "Zrušiť")}</Button>
          <Button variant="outline" className="text-destructive" onClick={() => decide.mutate("rejected")} disabled={decide.isPending || shortageQ.isLoading}>
            <X className="w-4 h-4 mr-1" />{L("Reject", "Odbij", "Zamietnuť")}
          </Button>
          <Button onClick={() => decide.mutate("approved")} disabled={decide.isPending || shortageQ.isLoading || !!shortageQ.error || approveBlocked}>
            <Check className="w-4 h-4 mr-1" />
            {hasShortage ? L("Approve despite shortage", "Odobri uprkos manjku", "Schváliť napriek nedostatku") : L("Approve", "Odobri", "Schváliť")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
