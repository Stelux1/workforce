import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, Search, Trash2, Handshake, Upload } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import { useAuth } from "@/lib/AuthContext";
import VendorDialog from "@/components/vendors/VendorDialog";
import ImportVendorsDialog from "@/components/vendors/ImportVendorsDialog";
import VendorDetail from "@/components/vendors/VendorDetail";
import { currentContract, workerCountMap } from "@/lib/vendorOverview";
import { formatIsoDate } from "@/lib/dateFormat";
import { useLang } from "@/lib/LanguageContext";
import { useT } from "@/lib/translations";

const LABELS = {
  en: {
    title: "Vendors", subtitle: "Subcontractor companies supplying workers",
    add: "Add Vendor", search: "Search vendors...", empty: "No vendors yet",
    vendor: "Vendor", country: "Country", contact: "Contact", currency: "Currency",
    workers: "Active Workers", contract: "Contract", openEnded: "open-ended", noContract: "No valid contract", open: "Open details", terms: "Terms", status: "Status", active: "Active", inactive: "Inactive",
    saved: "Vendor saved", deleted: "Vendor deleted",
    confirm: "Delete this vendor? A vendor with engagements can't be deleted — set it to Inactive instead.",
    nameRequired: "Vendor name is required",
  },
  rs: {
    title: "Dobavljači", subtitle: "Podugovaračke firme koje obezbeđuju radnike",
    add: "Dodaj dobavljača", search: "Pretraga dobavljača...", empty: "Nema dobavljača",
    vendor: "Dobavljač", country: "Država", contact: "Kontakt", currency: "Valuta",
    workers: "Aktivni radnici", contract: "Ugovor", openEnded: "bez roka", noContract: "Nema važećeg ugovora", open: "Otvori detalje", terms: "Rok plaćanja", status: "Status", active: "Aktivan", inactive: "Neaktivan",
    saved: "Dobavljač sačuvan", deleted: "Dobavljač obrisan",
    confirm: "Obrisati dobavljača? Dobavljač koji ima angažmane ne može da se obriše — tada ga postavite na Neaktivan.",
    nameRequired: "Naziv dobavljača je obavezan",
  },
  sk: {
    title: "Dodávatelia", subtitle: "Subdodávateľské firmy dodávajúce pracovníkov",
    add: "Pridať dodávateľa", search: "Hľadať dodávateľov...", empty: "Zatiaľ žiadni dodávatelia",
    vendor: "Dodávateľ", country: "Krajina", contact: "Kontakt", currency: "Mena",
    workers: "Aktívni pracovníci", contract: "Zmluva", openEnded: "neurčito", noContract: "Bez platnej zmluvy", open: "Otvoriť detail", terms: "Podmienky", status: "Stav", active: "Aktívny", inactive: "Neaktívny",
    saved: "Dodávateľ bol uložený", deleted: "Dodávateľ bol odstránený",
    confirm: "Odstrániť tohto dodávateľa? Dodávateľa s pracovnými vzťahmi nemožno odstrániť — nastavte ho radšej ako Neaktívny.",
    nameRequired: "Názov dodávateľa je povinný",
  },
};

export default function Vendors() {
  const { lang } = useLang();
  const L = LABELS[lang] || LABELS.en;
  const T = useT();
  const { can } = useAuth();
  const canManage = can("vendors.manage") || can("engagement.manage");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => base44.entities.Vendor.list("name", 300),
  });

  // Aktivni radnici po vendoru: view vendor_worker_counts (angažmani koji važe danas, bez ograničenja broja redova).
  const countsQ = useQuery({
    queryKey: ["vendor-worker-counts"],
    queryFn: () => base44.entities.VendorWorkerCount.list(),
  });
  const workerCounts = useMemo(() => workerCountMap(countsQ.data), [countsQ.data]);

  const { data: contracts = [] } = useQuery({
    queryKey: ["vendor-contracts", "all"],
    queryFn: () => base44.entities.VendorContract.list("-start_date"),
  });
  const today = format(new Date(), "yyyy-MM-dd");
  const currentByVendor = useMemo(() => {
    const byVendor = new Map();
    for (const c of contracts) {
      if (!byVendor.has(c.vendor_id)) byVendor.set(c.vendor_id, []);
      byVendor.get(c.vendor_id).push(c);
    }
    return new Map([...byVendor.entries()].map(([id, list]) => [id, currentContract(list, today)]));
  }, [contracts, today]);
  const [detailId, setDetailId] = useState(null);
  const detailVendor = vendors.find((v) => v.id === detailId) || null;

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
    // Vendor ID dodeljuje baza (VEN-001, …) i ne menja se sa ekrana.
    const { vendor_id: _vendorId, ...rest } = form;
    saveMutation.mutate({ ...rest, name: form.name.trim() });
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
        actionLabel={canManage ? L.add : undefined}
        onAction={() => { setForm({ status: "active", default_currency: "EUR", payroll_cycle: "monthly" }); setDialogOpen(true); }}
      >
        {canManage && (
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" />
            {T("Import CSV")}
          </Button>
        )}
      </PageHeader>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={L.search} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <Card className="h-40 animate-pulse" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={L.empty}
          actionLabel={canManage ? L.add : undefined}
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
                  <th className="text-left px-4 py-3 font-medium hidden xl:table-cell">{L.contract}</th>
                  <th className="text-center px-4 py-3 font-medium hidden md:table-cell">{L.currency}</th>
                  <th className="text-left px-4 py-3 font-medium">{L.status}</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((vendor) => (
                  <tr key={vendor.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setDetailId(vendor.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Handshake className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <button type="button" className="font-semibold text-left hover:text-primary hover:underline" onClick={(e) => { e.stopPropagation(); setDetailId(vendor.id); }} aria-label={`${L.open}: ${vendor.name}`}>{vendor.name}</button>
                          <p className="text-xs text-muted-foreground">
                            {[vendor.vendor_id && `ID: ${vendor.vendor_id}`, vendor.vat_number && `VAT: ${vendor.vat_number}`].filter(Boolean).join(" · ")}
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
                      {countsQ.isLoading ? "…" : countsQ.error ? "—" : workerCounts.get(vendor.id) || 0}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {(() => {
                        const c = currentByVendor.get(vendor.id);
                        if (!c) return <span className="text-muted-foreground">{L.noContract}</span>;
                        return (
                          <>
                            <p className="font-medium">{c.reference}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">{formatIsoDate(c.start_date, lang)} – {c.end_date ? formatIsoDate(c.end_date, lang) : L.openEnded}</p>
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">{vendor.default_currency || "EUR"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${vendor.status === "inactive" ? "bg-muted text-muted-foreground" : "bg-success-soft text-success"}`}>
                        {vendor.status === "inactive" ? L.inactive : L.active}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canManage && (
                        <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(vendor); setDialogOpen(true); }}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(vendor.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
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

      <VendorDetail
        vendor={detailVendor}
        open={!!detailVendor}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        onEdit={canManage ? () => { setForm(detailVendor); setDialogOpen(true); } : undefined}
        lang={lang}
      />

      <ImportVendorsDialog open={importOpen} onOpenChange={setImportOpen} existingVendors={vendors} />

      <ConfirmDeleteDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        message={L.confirm}
      />
    </div>
  );
}