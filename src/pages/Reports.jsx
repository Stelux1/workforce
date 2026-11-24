import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/LanguageContext";
import { statusLabel } from "@/components/shared/StatusBadge";
import { documentStatus } from "@/lib/documentStatus";
import PageHeader from "@/components/shared/PageHeader";
import { useT } from "@/lib/translations";

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