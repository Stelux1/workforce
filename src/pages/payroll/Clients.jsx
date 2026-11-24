import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Building2, Search, Trash2, Edit, Mail, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import ClientDialog from "@/components/clients/ClientDialog";
import EmptyState from "@/components/shared/EmptyState";
import ViewToggle from "@/components/shared/ViewToggle";
import { useViewPreference } from "@/hooks/useViewPreference";
import SortSelect from "@/components/shared/SortSelect";
import { useT, pick } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import { totalsByClient } from "@/lib/payroll/reports";

export default function Clients() {
  const t = useT();
  const { lang } = useLang();
  const L = (en, sr, sk) => pick(lang, en, sr, sk);
  const queryClient = useQueryClient();
  const [deleteClient, setDeleteClient] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState("");
  const [view, setView] = useViewPreference("clients", "grid");
  const [sort, setSort] = useState("name_asc");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list("-created_date", 200),
  });

  // Odobrene satnice i projekti: klijent satnice je klijent njenog projekta (po ID-u), pa preimenovanje
  // klijenta ne menja brojke ni pre osvežavanja stranice (QA 14.11.2026).
  const { data: timesheets = [] } = useQuery({
    queryKey: ["timesheets", "approved"],
    queryFn: () => base44.entities.Timesheet.filter({ approval_status: "approved" }, "-week_start"),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("name"),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => form.id ? base44.entities.Client.update(form.id, data) : base44.entities.Client.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(form.id ? L("Saved", "Sačuvano", "Uložené") : L("Client added", "Klijent dodat", "Klient bol pridaný"));
      setDialogOpen(false);
      setForm({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Client.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); toast.success(L("Client deleted", "Klijent obrisan", "Klient bol odstránený")); },
  });

  // Zbir po client_id (project_id → projects.client_id), u centima — src/lib/payroll/reports.js.
  // Ime klijenta se ne koristi za brojke, pa preimenovanje ne menja ni sate ni iznose.
  const statsByClient = new Map(totalsByClient(timesheets, projects, clients).map((row) => [row.id, row]));
  const NO_STATS = { hours: 0, revenue: 0, profit: 0 };
  const getClientStats = (client) => statsByClient.get(client.id) || NO_STATS;

  const SORT_OPTIONS = [
    { value: "name_asc", label: t("Name A → Z") || "Name A → Z" },
    { value: "name_desc", label: t("Name Z → A") || "Name Z → A" },
    { value: "newest", label: t("Newest First") || "Newest First" },
  ];

  const filtered = [...clients].filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === "name_asc") return (a.name || "").localeCompare(b.name || "");
      if (sort === "name_desc") return (b.name || "").localeCompare(a.name || "");
      return 0;
    });

  return (
    <div className="space-y-6">
      <PageHeader title={L("Clients", "Klijenti", "Klienti")} subtitle={L("Manage B2B client accounts", "Upravljanje klijentima (B2B)", "Správa klientov (B2B)")} actionLabel={L("Add Client", "Dodaj klijenta", "Pridať klienta")} onAction={() => { setForm({}); setDialogOpen(true); }}>
        <ViewToggle view={view} onViewChange={setView} />
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("Search clients...") || "Search clients..."} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <SortSelect value={sort} onValueChange={setSort} options={SORT_OPTIONS} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title={t("No clients yet") || "No clients yet"} actionLabel={t("Add Client") || "Add Client"} onAction={() => setDialogOpen(true)} />
      ) : view === "grid" ? (
        /* ── GRID VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => {
            const stats = getClientStats(client);
            return (
              <Card key={client.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setForm(client); setDialogOpen(true); }}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteClient(client)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <h3 className="font-semibold">{client.name}</h3>
                  {client.contact_name && <p className="text-xs text-muted-foreground">{client.contact_name}</p>}
                  {client.default_b2b_rate && <p className="text-xs text-primary mt-1">€{client.default_b2b_rate}/h {L("billing rate", "tarifa za klijenta", "fakturačná sadzba")}</p>}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">{t("Hours") || "Hours"}</p>
                      <p className="text-sm font-semibold">{stats.hours.toFixed(1)}h</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("Revenue") || "Revenue"}</p>
                      <p className="text-sm font-semibold">€{stats.revenue.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("Profit")}</p>
                      <p className="text-sm font-semibold text-emerald-600">€{stats.profit.toFixed(0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ── LIST VIEW ── */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">{t("Client")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">{t("Contact") || "Contact"}</th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">{t("Rate") || "Rate"}</th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">{t("Hours") || "Hours"}</th>
                  <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">{t("Revenue") || "Revenue"}</th>
                  <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">{t("Profit")}</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => {
                  const stats = getClientStats(client);
                  return (
                    <tr key={client.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold">{client.name}</p>
                            {client.vat_number && <p className="text-xs text-muted-foreground">VAT: {client.vat_number}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="text-xs space-y-0.5">
                          {client.contact_name && <p className="font-medium">{client.contact_name}</p>}
                          {client.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail className="w-3 h-3" />{client.email}</div>}
                          {client.phone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="w-3 h-3" />{client.phone}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm hidden md:table-cell">
                        {client.default_b2b_rate ? `€${client.default_b2b_rate}/h` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium hidden md:table-cell">{stats.hours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right font-medium hidden lg:table-cell">€{stats.revenue.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 hidden lg:table-cell">€{stats.profit.toFixed(0)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(client); setDialogOpen(true); }}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteClient(client)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ClientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        onSave={() => saveMutation.mutate(form)}
        isSaving={saveMutation.isPending}
        t={t}
      />
      <ConfirmDeleteDialog
        open={!!deleteClient}
        onClose={() => setDeleteClient(null)}
        onConfirm={() => deleteMutation.mutate(deleteClient.id)}
        message={L(`Delete client "${deleteClient?.name}"? This cannot be undone.`, `Obrisati klijenta „${deleteClient?.name}"? Ova akcija se ne može poništiti.`, `Odstrániť klienta „${deleteClient?.name}“? Túto akciu nemožno vrátiť späť.`)}
      />
    </div>
  );
}