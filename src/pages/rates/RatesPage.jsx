// Rate History — kartica „Rate History" na Project Assignments (/assignments?tab=rates; stara adresa /rates vodi
// ovamo). Istorija tarifa sa datumima važenja nad jednom evidencijom (rates): iste zapise menja i kartica projekta
// (Overview: Job Role tarife) i Edit Assignment (buduće tarife angažmana). Vidljivo uz rates.view_b2b / view_b2c / manage.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import RateDialog, { invalidateRateViews } from "@/components/rates/RateDialog";
import RateTable from "@/components/rates/RateTable";
import RateResolver from "@/components/rates/RateResolver";
import { useLang } from "@/lib/LanguageContext";
import { useL } from "@/lib/translations";
import { useAuth } from "@/lib/AuthContext";

export default function RateHistory({ employees = [], projects = [], assignments = [] }) {
  const { lang } = useLang();
  const L = useL();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canRates = Boolean(can?.("rates.manage"));

  const [search, setSearch] = useState("");
  const [rateDialog, setRateDialog] = useState(null); // { mode, rate? }
  const [deleteRateId, setDeleteRateId] = useState(null);

  const ratesQ = useQuery({ queryKey: ["rates"], queryFn: () => base44.entities.Rate.list("-effective_from") });
  const rates = ratesQ.data || [];

  const deleteRate = useMutation({
    mutationFn: (id) => base44.entities.Rate.delete(id),
    onSuccess: () => {
      invalidateRateViews(queryClient);
      toast.success(L("Rate deleted", "Tarifa obrisana", "Sadzba odstránená"));
    },
    onError: (e) => toast.error(e.message),
  });

  const q = search.trim().toLowerCase();
  const filteredRates = useMemo(
    () => rates.filter((r) => !q || [r.employee_name, r.project_name, r.position, r.change_reason].filter(Boolean).some((f) => String(f).toLowerCase().includes(q))),
    [rates, q]
  );
  const newRate = () => setRateDialog({ mode: "create" });

  return (
    <div className="space-y-4">
      <RateResolver employees={employees} projects={projects} assignments={assignments} rates={rates} lang={lang} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={L("Search rates...", "Pretraga tarifa...", "Hľadať sadzby...")} value={search} onChange={(e) => setSearch(e.target.value)} className="bg-card pl-10" />
        </div>
        {canRates && (
          <Button onClick={newRate} className="gap-2"><Plus className="h-4 w-4" />{L("New rate", "Nova tarifa", "Nová sadzba")}</Button>
        )}
      </div>

      {ratesQ.isLoading ? (
        <Card className="h-32 animate-pulse" />
      ) : ratesQ.isError ? (
        <Card className="p-4 text-sm text-destructive">{ratesQ.error?.message}</Card>
      ) : filteredRates.length === 0 ? (
        <EmptyState icon={Search} title={q ? L("No rates match the search", "Nijedna tarifa ne odgovara pretrazi", "Žiadna sadzba nezodpovedá hľadaniu") : L("No rates yet", "Nema tarifa", "Zatiaľ žiadne sadzby")}
          actionLabel={canRates && !q ? L("New rate", "Nova tarifa", "Nová sadzba") : undefined} onAction={canRates && !q ? newRate : undefined} />
      ) : (
        <Card className="overflow-hidden">
          <RateTable rates={filteredRates} canManage={canRates} lang={lang}
            onChange={(rate) => setRateDialog({ mode: "change", rate })}
            onEdit={(rate) => setRateDialog({ mode: "edit", rate })}
            onDelete={setDeleteRateId} />
        </Card>
      )}

      <RateDialog open={Boolean(rateDialog)} onOpenChange={(o) => !o && setRateDialog(null)} mode={rateDialog?.mode} rate={rateDialog?.rate}
        projects={projects} assignments={assignments} />
      <ConfirmDeleteDialog open={!!deleteRateId} onClose={() => setDeleteRateId(null)} onConfirm={() => deleteRate.mutate(deleteRateId)}
        message={L("Delete this rate? A rate already used in a timesheet can't be deleted — set it to Inactive instead.",
          "Obrisati tarifu? Tarifa koja je već korišćena u satnici se ne briše — postavite je na Neaktivna.",
          "Odstrániť sadzbu? Sadzbu použitú vo výkaze nemožno odstrániť — nastavte ju ako Neaktívnu.")} />
    </div>
  );
}
