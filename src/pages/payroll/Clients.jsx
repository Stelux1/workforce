// Clients / Billing Overview (spec §9, W2-F). Kartica „Billing Overview" (billing.view): interni B2B obračun,
// obračuni sa statusom, eksterni račun, uplate i billable troškovi. Kartica „Klijenti": šifarnik klijenata —
// čitaju ga svi, menja billing.manage; tarifa klijenta samo uz rates.view_b2b (client_money).
// Brojke klijenata: src/lib/finance (odobreni sati, po valuti — nikad „€" zbir preko valuta, T28).
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Building2, Search, Trash2, Edit, Mail, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import ClientDialog from "@/components/clients/ClientDialog";
import EmptyState from "@/components/shared/EmptyState";
import ViewToggle from "@/components/shared/ViewToggle";
import { useViewPreference } from "@/hooks/useViewPreference";
import SortSelect from "@/components/shared/SortSelect";
import { useT, pick } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import BillingOverviewPanel from "@/components/billing/BillingOverviewPanel";
import { MoneyList, money } from "@/components/billing/billingShared";
import { useBillingLabels } from "@/components/billing/billingLabels";
import { aggregateLabor, laborDayLines } from "@/lib/finance/laborLines";
import { subtractByCurrency } from "@/lib/finance/currency";
import { readListParams } from "@/lib/listLinks";

const NO_STATS = { hours: 0, revenue: {}, cost: {}, missingRevenueRate: 0 };

export default function Clients() {
  const { T: B } = useBillingLabels();
  const { can } = useAuth();
  const canBilling = can("billing.view");
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => readListParams(searchParams), [searchParams]);
  const tab = searchParams.get("tab") === "clients" || !canBilling ? "clients" : "billing";
  const setTab = (v) => {
    const sp = new URLSearchParams(searchParams);
    if (v === "clients") sp.set("tab", "clients");
    else sp.delete("tab");
    setSearchParams(sp, { replace: true });
  };
  const { lang } = useLang();

  return (
    <div className="space-y-6">
      <PageHeader title={canBilling ? B.pageTitle : pick(lang, "Clients", "Klijenti", "Klienti")} subtitle={canBilling ? B.pageSubtitle : undefined} />
      {canBilling ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="billing">{B.tabBilling}</TabsTrigger>
            <TabsTrigger value="clients">{B.tabClients}</TabsTrigger>
          </TabsList>
          <TabsContent value="billing" className="mt-6">
            <BillingOverviewPanel T={B} lang={lang} canManage={can("billing.manage")} params={params} />
          </TabsContent>
          <TabsContent value="clients" className="mt-6">
            <ClientsList />
          </TabsContent>
        </Tabs>
      ) : (
        <ClientsList />
      )}
    </div>
  );
}

function ClientsList() {
  const t = useT();
  const { lang } = useLang();
  const L = (en, sr, sk) => pick(lang, en, sr, sk);
  const { can } = useAuth();
  const canManage = can("billing.manage");
  const canB2B = can("rates.view_b2b");
  const canProfit = canB2B && can("rates.view_b2c");
  const queryClient = useQueryClient();
  const [deleteClient, setDeleteClient] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState("");
  const [view, setView] = useViewPreference("clients", "grid");
  const [sort, setSort] = useState("name_asc");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list("-created_date", 1000),
  });
  // Odobrene satnice → dnevne linije (T-E); klijent linije je klijent projekta po ID-u, pa preimenovanje ne menja brojke (T25).
  const { data: timesheets = [] } = useQuery({
    queryKey: ["timesheets", "approved"],
    queryFn: () => base44.entities.Timesheet.filter({ approval_status: "approved" }, "-week_start"),
    enabled: canB2B,
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list("name") });

  const statsByClient = useMemo(() => {
    if (!canB2B) return new Map();
    const { lines } = laborDayLines(timesheets, { projects });
    return new Map(aggregateLabor(lines.filter((l) => l.clientId), "client").map((r) => [r.key, r]));
  }, [timesheets, projects, canB2B]);
  const getClientStats = (client) => statsByClient.get(client.id) || NO_STATS;
  const profitOf = (s) => subtractByCurrency(s.revenue, s.cost);

  const saveMutation = useMutation({
    mutationFn: (data) => (form.id ? base44.entities.Client.update(form.id, data) : base44.entities.Client.create(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      toast.success(form.id ? L("Saved", "Sačuvano", "Uložené") : L("Client added", "Klijent dodat", "Klient bol pridaný"));
      setDialogOpen(false);
      setForm({});
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Client.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); toast.success(L("Client deleted", "Klijent obrisan", "Klient bol odstránený")); },
    onError: (e) => toast.error(e.message),
  });

  const SORT_OPTIONS = [
    { value: "name_asc", label: t("Name A → Z") || "Name A → Z" },
    { value: "name_desc", label: t("Name Z → A") || "Name Z → A" },
    { value: "newest", label: t("Newest First") || "Newest First" },
  ];

  const filtered = [...clients].filter((c) => !search || c.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === "name_asc") return (a.name || "").localeCompare(b.name || "");
      if (sort === "name_desc") return (b.name || "").localeCompare(a.name || "");
      return 0;
    });

  const rateText = (client) => (client.default_b2b_rate ? `${money(client.default_b2b_rate, "EUR", lang)}/h` : "—");
  const actions = (client, size) => canManage && (
    <div className="flex gap-1 justify-end">
      <Button variant="ghost" size="icon" className={size} aria-label={t("Edit")} onClick={() => { setForm(client); setDialogOpen(true); }}>
        <Edit className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className={size} aria-label={L("Delete", "Obriši", "Odstrániť")} onClick={() => setDeleteClient(client)}>
        <Trash2 className="w-3.5 h-3.5 text-destructive" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("Search clients...") || "Search clients..."} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <SortSelect value={sort} onValueChange={setSort} options={SORT_OPTIONS} />
        <ViewToggle view={view} onViewChange={setView} />
        {canManage && (
          <Button className="sm:ml-auto" onClick={() => { setForm({}); setDialogOpen(true); }}>{L("Add Client", "Dodaj klijenta", "Pridať klienta")}</Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title={t("No clients yet") || "No clients yet"}
          actionLabel={canManage ? t("Add Client") || "Add Client" : undefined} onAction={() => setDialogOpen(true)} />
      ) : view === "grid" ? (
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
                    {actions(client, "h-8 w-8")}
                  </div>
                  <h3 className="font-semibold">{client.name}</h3>
                  {client.contact_name && <p className="text-xs text-muted-foreground">{client.contact_name}</p>}
                  {canB2B && client.default_b2b_rate ? <p className="text-xs text-primary mt-1">{rateText(client)} {L("billing rate", "tarifa za klijenta", "fakturačná sadzba")}</p> : null}
                  {canB2B && (
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground">{t("Hours") || "Hours"}</p>
                        <p className="text-sm font-semibold">{stats.hours.toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("Revenue") || "Revenue"}</p>
                        <MoneyList byCurrency={stats.revenue} lang={lang} className="text-sm font-semibold" />
                      </div>
                      {canProfit && (
                        <div>
                          <p className="text-xs text-muted-foreground">{t("Profit")}</p>
                          <MoneyList byCurrency={profitOf(stats)} lang={lang} className="text-sm font-semibold text-success" />
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">{t("Client")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">{t("Contact") || "Contact"}</th>
                  {canB2B && <th className="text-right px-4 py-3 font-medium hidden md:table-cell">{t("Rate") || "Rate"}</th>}
                  {canB2B && <th className="text-right px-4 py-3 font-medium hidden md:table-cell">{t("Hours") || "Hours"}</th>}
                  {canB2B && <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">{t("Revenue") || "Revenue"}</th>}
                  {canProfit && <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">{t("Profit")}</th>}
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
                      {canB2B && <td className="px-4 py-3 text-right text-sm hidden md:table-cell">{rateText(client)}</td>}
                      {canB2B && <td className="px-4 py-3 text-right font-medium hidden md:table-cell">{stats.hours.toFixed(1)}h</td>}
                      {canB2B && <td className="px-4 py-3 text-right font-medium hidden lg:table-cell"><MoneyList byCurrency={stats.revenue} lang={lang} className="items-end" /></td>}
                      {canProfit && <td className="px-4 py-3 text-right font-semibold text-success hidden lg:table-cell"><MoneyList byCurrency={profitOf(stats)} lang={lang} className="items-end" /></td>}
                      <td className="px-4 py-3">{actions(client, "h-7 w-7")}</td>
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
        showRate={canB2B && canManage}
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
