import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";
import { findOverlappingAffiliations, resolveAffiliation } from "@/lib/rateEngine";
import AffiliationDialog from "@/components/employees/AffiliationDialog";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";

const LABELS = {
  en: {
    title: "Engagement & Vendor History", add: "Add Engagement", none: "No engagement history recorded yet.",
    current: "Current", direct: "Direct employee", subcontractor: "Subcontractor worker",
    vendor: "Vendor", open: "open-ended", overlap: "This engagement overlaps an existing one for this employee.",
    vendorRequired: "Choose the vendor for a subcontractor worker.", datesRequired: "Start date is required.",
    saved: "Engagement saved", deleted: "Engagement removed",
    confirm: "Delete this engagement record? Historical timesheets keep their own vendor snapshot.",
    noVendor: "No vendor set", review: "Needs review",
    hint: "Timesheets keep the vendor that was valid on the work date, so later transfers never rewrite history.",
    adminOnly: "Only an admin changes the engagement — tax, contributions and who gets paid depend on it.",
  },
  rs: {
    title: "Angažovanja i istorija dobavljača", add: "Dodaj angažovanje", none: "Još nema evidentiranih angažovanja.",
    current: "Trenutno", direct: "Direktan zaposleni", subcontractor: "Radnik podugovarača",
    vendor: "Dobavljač", open: "neograničeno", overlap: "Ovo angažovanje se preklapa sa postojećim za ovog zaposlenog.",
    vendorRequired: "Izaberite dobavljača za radnika podugovarača.", datesRequired: "Datum početka je obavezan.",
    saved: "Angažovanje sačuvano", deleted: "Angažovanje uklonjeno",
    confirm: "Obrisati zapis o angažovanju? Radni sati zadržavaju sopstvenu kopiju dobavljača.",
    noVendor: "Dobavljač nije postavljen", review: "Potrebna provera",
    hint: "Radni sati čuvaju dobavljača koji je važio na datum rada, pa kasniji prelasci ne menjaju istoriju.",
    adminOnly: "Angažovanje menja samo admin — od njega zavise porez, doprinosi i kome se plaća.",
  },
  sk: {
    title: "História pracovných vzťahov a dodávateľov", add: "Pridať pracovný vzťah", none: "Zatiaľ nie je zaznamenaná žiadna história pracovných vzťahov.",
    current: "Aktuálny", direct: "Priamy zamestnanec", subcontractor: "Pracovník subdodávateľa",
    vendor: "Dodávateľ", open: "na neurčito", overlap: "Tento pracovný vzťah sa prekrýva s existujúcim pracovným vzťahom tohto zamestnanca.",
    vendorRequired: "Vyberte dodávateľa pre pracovníka subdodávateľa.", datesRequired: "Dátum začiatku je povinný.",
    saved: "Pracovný vzťah bol uložený", deleted: "Pracovný vzťah bol odstránený",
    confirm: "Odstrániť tento záznam o pracovnom vzťahu? Historické pracovné výkazy si ponechávajú vlastný záznam o dodávateľovi.",
    noVendor: "Dodávateľ nie je nastavený", review: "Vyžaduje kontrolu",
    hint: "Pracovné výkazy si ponechávajú dodávateľa platného v deň práce, takže neskoršie presuny nikdy neprepíšu históriu.",
    adminOnly: "Pracovný vzťah mení iba administrátor — závisí od neho daň, odvody a to, komu sa platí.",
  },
};

export default function EmploymentHistoryCard({ employeeId, employeeName }) {
  const { lang } = useLang();
  const L = LABELS[lang] || LABELS.en;
  // Angažman određuje porez, doprinose i kome se plaća (D8, D17): upisuje ga samo admin (i baza, RLS). Operater ga vidi.
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({});
  const [deleteId, setDeleteId] = useState(null);

  const { data: history = [] } = useQuery({
    queryKey: ["employment-history", employeeId],
    queryFn: () => base44.entities.EmploymentHistory.filter({ employee_id: employeeId }, "-start_date", 100),
    enabled: !!employeeId,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => base44.entities.Vendor.list("name", 300),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (data.id) return base44.entities.EmploymentHistory.update(data.id, data);
      return base44.entities.EmploymentHistory.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employment-history", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employment-history-all"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success(L.saved);
      setDialogOpen(false);
      setForm({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EmploymentHistory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employment-history", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employment-history-all"] });
      toast.success(L.deleted);
    },
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const current = resolveAffiliation({ history, employeeId, date: today });

  const handleSave = () => {
    if (!form.start_date) return toast.error(L.datesRequired);
    if (form.engagement_type === "subcontractor_worker" && !form.vendor_id) return toast.error(L.vendorRequired);

    const overlaps = findOverlappingAffiliations(history, {
      employeeId,
      start: form.start_date,
      end: form.end_date,
      excludeId: form.id,
    });
    if (overlaps.length) return toast.error(L.overlap);

    const vendor = vendors.find((v) => v.id === form.vendor_id);
    saveMutation.mutate({
      ...form,
      employee_id: employeeId,
      employee_name: employeeName || "",
      vendor_name: form.engagement_type === "subcontractor_worker" ? vendor?.name || "" : "",
      vendor_id: form.engagement_type === "subcontractor_worker" ? form.vendor_id || "" : "",
    });
  };

  const sorted = [...history].sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));
  const fmt = (d) => (d ? format(parseISO(d), "dd.MM.yyyy") : "");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> {L.title}
          </CardTitle>
          {isAdmin && (
            <Button size="sm" className="gap-2" onClick={() => {
              setForm({ engagement_type: "direct_employee", status: "active", start_date: today });
              setDialogOpen(true);
            }}>
              <Plus className="w-4 h-4" /> {L.add}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {current ? (
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-2">{L.current}</span>
            {current.engagement_type === "subcontractor_worker" ? L.subcontractor : L.direct}
            {current.vendor_name ? ` · ${current.vendor_name}` : ""}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <TriangleAlert className="w-4 h-4 shrink-0" /> {L.noVendor}
          </div>
        )}

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">{L.none}</p>
        ) : (
          <div className="divide-y">
            {sorted.map((h) => (
              <div key={h.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${h.engagement_type === "subcontractor_worker" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {h.engagement_type === "subcontractor_worker" ? L.subcontractor : L.direct}
                    </span>
                    {h.vendor_name && <span className="text-sm font-medium">{h.vendor_name}</span>}
                    {h.status === "active" && !h.end_date && <span className="text-xs text-primary font-medium">● {L.current}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {fmt(h.start_date)} → {h.end_date ? fmt(h.end_date) : L.open}
                    {h.notes ? ` · ${h.notes}` : ""}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(h); setDialogOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(h.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground border-t pt-3">{L.hint}</p>
        {!isAdmin && <p className="text-xs text-muted-foreground">{L.adminOnly}</p>}
      </CardContent>

      <AffiliationDialog
        open={isAdmin && dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        onSave={handleSave}
        saving={saveMutation.isPending}
        vendors={vendors}
        lang={lang}
      />

      <ConfirmDeleteDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        message={L.confirm}
      />
    </Card>
  );
}