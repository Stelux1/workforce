import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Users, UserCheck, Clock, FileWarning,
  CheckSquare, Calendar, Cake, AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate, longDatePattern } from "@/lib/dateFormat";
import { documentCategoryLabel } from "@/lib/documentCategories";

export default function Dashboard() {
  const t = useT();
  const { lang } = useLang();

  const { data: employees = [], isLoading: loadingEmp } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });

  const { data: documents = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["documents"],
    queryFn: () => base44.entities.Document.list("-created_date"),
  });

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list("-created_date"),
  });

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["leave-requests"],
    queryFn: () => base44.entities.LeaveRequest.list("-created_date"),
  });

  const activeEmps = employees.filter((e) => e.status === "active");
  const onLeaveEmps = employees.filter((e) => e.status === "on_leave");

  // Kalendarski dani od danas (ponoć), ne 24-časovni intervali od trenutnog vremena (QA 14.11.2026).
  const today = startOfDay(new Date());
  const daysFromToday = (iso) => differenceInCalendarDays(parseISO(iso), today);
  const expiringDocs = documents
    .filter((d) => d.expiration_date && daysFromToday(d.expiration_date) >= 0 && daysFromToday(d.expiration_date) <= 30)
    .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date));
  const expiredDocs = documents.filter((d) => d.expiration_date && daysFromToday(d.expiration_date) < 0);

  const openTasks = tasks.filter((t) => t.status !== "completed");
  const pendingLeaves = leaveRequests.filter((l) => l.status === "pending");

  // Rođendan danas = 0 dana (ranije je pomeren u sledeću godinu), sutra = 1 dan (ranije „Danas!").
  const allUpcomingBirthdays = employees
    .filter((e) => e.date_of_birth)
    .map((e) => {
      const dob = parseISO(e.date_of_birth);
      const nextBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
      if (nextBday < today) nextBday.setFullYear(nextBday.getFullYear() + 1);
      return { ...e, nextBirthday: nextBday, daysUntil: differenceInCalendarDays(nextBday, today) };
    })
    .filter((e) => e.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  const upcomingBirthdays = allUpcomingBirthdays.slice(0, 5);

  const isLoading = loadingEmp || loadingDocs || loadingTasks;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl md:text-3xl font-bold">{t("Dashboard")}</h1></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("Dashboard")}</h1>
        <p className="text-muted-foreground mt-1">{t("Workforce overview at a glance")}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("Total Employees")} value={employees.length} icon={Users} trend={`${activeEmps.length} ${t("active (count)")}`} />
        <StatCard title={t("Active Workers")} value={activeEmps.length} icon={UserCheck} />
        <StatCard title={t("On Leave")} value={onLeaveEmps.length} icon={Clock} />
        <StatCard title={t("Expiring Docs")} value={expiringDocs.length} icon={FileWarning} trend={t("Within 30 days")} />
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("Open Tasks")} value={openTasks.length} icon={CheckSquare} />
        <StatCard title={t("Pending Leaves")} value={pendingLeaves.length} icon={Calendar} />
        <StatCard title={t("Upcoming Birthdays")} value={allUpcomingBirthdays.length} icon={Cake} />
        {/* Ranije duplikat kartice „Dokumenti ističu"; sada istekli dokumenti. */}
        <StatCard title={t("Expired Docs")} value={expiredDocs.length} icon={AlertTriangle} trend={t("Need attention")} />
      </div>

      {/* Recent Activity Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Employees */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">{t("Recent Employees")}</CardTitle>
              <Link to="/employees" className="text-sm text-primary hover:underline">{t("View all")}</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {employees.slice(0, 5).map((emp) => (
              <Link
                key={emp.id}
                to={`/employees/${emp.id}`}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {emp.first_name?.[0]}{emp.last_name?.[0]}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{emp.first_name} {emp.last_name}</p>
                    <p className="text-xs text-muted-foreground">{emp.position || t("No position")}</p>
                  </div>
                </div>
                <StatusBadge status={emp.status} />
              </Link>
            ))}
            {employees.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t("No employees yet")}</p>}
          </CardContent>
        </Card>

        {/* Upcoming Birthdays & Expiring Docs */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Cake className="w-4 h-4 text-accent" /> {t("Upcoming Birthdays")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingBirthdays.map((emp) => (
                <div key={emp.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors">
                  <span className="text-sm font-medium">{emp.first_name} {emp.last_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {emp.daysUntil === 0 ? t("Today!") : emp.daysUntil === 1 ? t("Tomorrow") : `${t("in %d days").replace("%d", emp.daysUntil)}`}
                  </span>
                </div>
              ))}
              {upcomingBirthdays.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t("No upcoming birthdays")}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" /> {t("Expiring Documents")}
                </CardTitle>
                <Link to="/documents" className="text-sm text-primary hover:underline">{t("View all")}</Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {expiringDocs.slice(0, 5).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors">
                  <div>
                    <p className="text-sm font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{documentCategoryLabel(doc.category, lang)}</p>
                  </div>
                  <span className="text-xs text-destructive font-medium">
                    {formatDate(parseISO(doc.expiration_date), longDatePattern(lang), lang)}
                  </span>
                </div>
              ))}
              {expiringDocs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t("No expiring documents")}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}