import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, Search, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import VendorDialog from "@/components/vendors/VendorDialog";
import { useLang } from "@/lib/LanguageContext";

const LABELS = {
  en: {
    title: "Vendors", subtitle: "Subcontractor companies supplying workers",
    add: "Add Vendor", search: "Search vendors...", empty: "No vendors yet",
    vendor: "Vendor", country: "Country", contact: "Contact", currency: "Currency",
    workers: "Active Workers", terms: "Terms", status: "Status", active: "Active", inactive: "Inactive",
    saved: "Vendor saved", deleted: "Vendor deleted",
    confirm: "Delete this vendor? A vendor with engagements can't be deleted — set it to Inactive instead.",
    nameRequired: "Vendor name is required",
  },
  rs: {
    title: "Dobavljači", subtitle: "Podugovaračke firme koje obezbeđuju radnike",
    add: "Dodaj dobavljača", search: "Pretraga dobavljača...", empty: "Nema dobavljača",
    vendor: "Dobavljač", country: "Država", contact: "Kontakt", currency: "Valuta",
    workers: "Aktivni radnici", terms: "Rok plaćanja", status: "Status", active: "Aktivan", inactive: "Neaktivan",
    saved: "Dobavljač sačuvan", deleted: "Dobavljač obrisan",
    confirm: "Obrisati dobavljača? Dobavljač koji ima angažmane ne može da se obriše — tada ga postavite na Neaktivan.",
    nameRequired: "Naziv dobavljača je obavezan",
  },
};

export default function Vendors() {
  const { lang } = useLang();
  const L = LABELS[lang] || LABELS.en;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({});
  const [deleteId, setDeleteId] = useState(null);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => base44.entities.Vendor.list("name", 300),
  });

  const { data: history = [] } = useQuery({
    queryKey: ["employment-history-all"],
    queryFn: () => base44.entities.EmploymentHistory.list("-start_date", 500),
  });

  const workerCounts = useMemo(() => {
    const map = new Map();
    history.forEach((h) => {
      if (!h.vendor_id || h.status !== "active") return;
      map.set(h.vendor_id, (map.get(h.vendor_id) || 0) + 1);
    });
    return map;
  }, [history]);

  const saveMutation = useMutation({
    mutationFn: (data) => (data.id ? base44.entities.Vendor.update(data.id, data) : base44.entities.Vendor.create(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success(L.saved);
      setDialogOpen(false);
      setForm({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Vendor.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success(L.deleted);
    },
  });

  const handleSave = () => {
    if (!form.name?.trim()) {
      toast.error(L.nameRequired);
      return;
    }
    saveMutation.mutate({ ...form, name: form.name.trim() });
  };

  const filtered = vendors
    .filter((v) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return [v.name, v.legal_name, v.vendor_id, v.country, v.contact_name, v.email]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(q));
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "sr"));

  return (
    <div className="space-y-6">
      <PageHeader
        title={L.title}
        subtitle={L.subtitle}
        actionLabel={L.add}
        onAction={() => { setForm({ status: "active", default_currency: "EUR", payroll_cycle: "monthly" }); setDialogOpen(true); }}
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={L.search} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <Card className="h-40 animate-pulse" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={L.empty}
          actionLabel={L.add}
          onAction={() => { setForm({ status: "active", default_currency: "EUR" }); setDialogOpen(true); }}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">{L.vendor}</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{L.country}</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">{L.contact}</th>
                  <th className="text-center px-4 py-3 font-medium hidden sm:table-cell">{L.workers}</th>
                  <th className="text-center px-4 py-3 font-medium hidden md:table-cell">{L.currency}</th>
                  <th className="text-left px-4 py-3 font-medium">{L.status}</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((vendor) => (
                  <tr key={vendor.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Truck className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">{vendor.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[vendor.vendor_id, vendor.vat_number && `VAT: ${vendor.vat_number}`].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                      {[vendor.city, vendor.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p>{vendor.contact_name || "—"}</p>
                      {vendor.email && <p className="text-xs text-muted-foreground">{vendor.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell font-medium">
                      {workerCounts.get(vendor.id) || 0}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">{vendor.default_currency || "EUR"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${vendor.status === "inactive" ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-700"}`}>
                        {vendor.status === "inactive" ? L.inactive : L.active}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(vendor); setDialogOpen(true); }}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(vendor.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <VendorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        onSave={handleSave}
        saving={saveMutation.isPending}
        lang={lang}
      />

      <ConfirmDeleteDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        message={L.confirm}
      />
    </div>
  );
}