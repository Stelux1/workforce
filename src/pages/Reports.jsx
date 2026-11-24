import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/LanguageContext";
import { statusLabel } from "@/components/shared/StatusBadge";
import { documentStatus } from "@/lib/documentStatus";
import PageHeader from "@/components/shared/PageHeader";
import { useT, useL } from "@/lib/translations";
import { Link } from "react-router-dom";
import { ChevronRight, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { canAccessPath } from "@/lib/access";
import { pageTitle } from "@/lib/pageTitles";

// Centralni, kontrolisani izveštaji i izvoz (spec §1 Reports, §10). Svaka veza vodi na modul koji ima svoj izvoz
// CSV/PDF; prikazuje se samo ono na šta korisnik ima pravo (iste provere kao meni, a baza ionako ne vraća podatke).
const REPORT_LINKS = [
  { path: "/payroll/reports", nav: "Payroll Reports",
    hint: ["Profitability by currency, filters, PDF/CSV", "Profitabilnost po valuti, filteri, PDF/CSV", "Ziskovosť podľa meny, filtre, PDF/CSV"] },
  { path: "/project-costs", nav: "Project Costs",
    hint: ["All project costs, Excel/CSV/PDF", "Svi troškovi projekata, Excel/CSV/PDF", "Všetky náklady projektov, Excel/CSV/PDF"] },
  { path: "/clients", nav: "Clients",
    hint: ["Internal billing, external invoices, client payments", "Interni obračun, eksterni računi, uplate klijenata", "Interné vyúčtovanie, externé faktúry, platby klientov"] },
  { path: "/payroll/payables", nav: "Payables",
    hint: ["Calculated, paid and remaining per payee", "Obračunato, isplaćeno i preostalo po primaocu", "Vypočítané, vyplatené a zostávajúce podľa príjemcu"] },
  { path: "/timesheet-dashboard", nav: "Timesheet Dashboard",
    hint: ["Approved hours by worker and day, Excel/PDF", "Odobreni sati po radniku i danu, Excel/PDF", "Schválené hodiny podľa pracovníka a dňa, Excel/PDF"] },
  { path: "/assignments", nav: "Project Assignments",
    hint: ["Filtered assignments, CSV/XLSX/PDF", "Filtrirani angažmani, CSV/XLSX/PDF", "Filtrované pridelenia, CSV/XLSX/PDF"] },
];

function ReportLinks() {
  const L = useL();
  const { lang } = useLang();
  const { permissions } = useAuth();
  const links = REPORT_LINKS.filter((r) => canAccessPath(r.path, permissions));
  if (!links.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-primary" />{L("Reports & exports", "Izveštaji i izvoz", "Prehľady a exporty")}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {links.map((r) => (
          <Link key={r.path} to={r.path} className="group flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50 transition-colors">
            <span>
              <span className="block text-sm font-medium">{r.nav ? pageTitle(r.nav, lang) : L(...r.label)}</span>
              <span className="block text-xs text-muted-foreground">{L(...r.hint)}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

const COLORS = ["hsl(222, 47%, 20%)", "hsl(174, 62%, 47%)", "hsl(262, 52%, 55%)", "hsl(43, 96%, 56%)", "hsl(0, 72%, 51%)"];

export default function Reports() {
  const t = useT();
  const { lang } = useLang();

  const { data: employees = [], isLoading: loadEmp } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });

  const { data: attendance = [], isLoading: loadAtt } = useQuery({
    queryKey: ["attendance"],
    queryFn: () => base44.entities.AttendanceRecord.list("-date", 500),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: () => base44.entities.Document.list("-created_date", 500),
  });

  const isLoading = loadEmp || loadAtt;

  const deptCounts = {};
  employees.forEach((e) => {
    const d = e.department || (lang === "rs" ? "Bez odeljenja" : lang === "sk" ? "Bez oddelenia" : "Unassigned");
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  });
  const deptData = Object.entries(deptCounts).map(([name, value]) => ({ name, value }));

  const statusCounts = {};
  employees.forEach((e) => {
    const s = statusLabel(e.status || "active", lang);
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const typeCounts = {};
  employees.forEach((e) => {
    const TYPES = { rs: { full_time: "Puno radno vreme", part_time: "Skraćeno radno vreme", temporary: "Privremeno", contractor: "Ugovorac", unknown: "Nije uneto" },
  sk: { full_time: "Plný úväzok", part_time: "Čiastočný úväzok", temporary: "Dočasný", contractor: "Dodávateľ", unknown: "Nezadané" },
      en: { full_time: "Full time", part_time: "Part time", temporary: "Temporary", contractor: "Contractor", unknown: "Not set" } };
    const tp = (TYPES[lang] || TYPES.en)[e.employment_type || "unknown"] || e.employment_type;
    typeCounts[tp] = (typeCounts[tp] || 0) + 1;
  });
  const typeData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

  const docStatusCounts = {};
  documents.forEach((d) => {
    // Status iz roka važenja (ranije: dokument bez statusa se brojao kao „valid").
    const s = statusLabel(documentStatus(d.expiration_date), lang);
    docStatusCounts[s] = (docStatusCounts[s] || 0) + 1;
  });
  const docStatusData = Object.entries(docStatusCounts).map(([name, value]) => ({ name, value }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("Reports")} subtitle={t("Workforce analytics")} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-80 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("Reports")} subtitle={t("Workforce analytics and insights")} />
      <ReportLinks />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("Employees by Department")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(222, 47%, 20%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("Employee Status")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("Employment Type")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={typeData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                  {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("Document Status")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={docStatusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(174, 62%, 47%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}