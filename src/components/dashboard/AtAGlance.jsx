import { Link } from "react-router-dom";
import { Building2, CalendarDays, Clock, Layers, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/translations";

function Row({ icon: Icon, label, to, children }) {
  return (
    <li>
      <Link to={to} className="flex items-center justify-between gap-3 py-2.5 rounded-md hover:bg-muted/60 transition-colors px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="inline-flex items-center gap-3 text-sm text-muted-foreground">
          <Icon className="w-4 h-4" /> {label}
        </span>
        {children}
      </Link>
    </li>
  );
}

/** upcomingPayroll = null kad se ne prikazuje (operater nema pristup obračunu). overduePayroll = tekst meseca zakasnele isplate ili null. */
export default function AtAGlance({ employees, projects, clients, pendingTimesheets, upcomingPayroll, overduePayroll, employeesTo = "/employees", projectsTo = "/projects", pendingTo = "/timesheets" }) {
  const t = useT();
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{t("At a Glance")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60">
          <Row icon={Users} label={t("Active Employees")} to={employeesTo}><span className="text-sm font-semibold">{employees}</span></Row>
          <Row icon={Layers} label={t("Active Projects")} to={projectsTo}><span className="text-sm font-semibold">{projects}</span></Row>
          <Row icon={Building2} label={t("Active Clients")} to="/clients"><span className="text-sm font-semibold">{clients}</span></Row>
          <Row icon={Clock} label={t("Pending Timesheets")} to={pendingTo}>
            <span className="min-w-7 text-center rounded-full bg-warning-soft text-warning text-xs font-semibold px-2 py-0.5">{pendingTimesheets}</span>
          </Row>
          {upcomingPayroll && (
            <Row icon={CalendarDays} label={t("Upcoming Payroll")} to="/payroll/monthly">
              {overduePayroll ? (
                <span className="rounded-md bg-destructive/10 text-destructive text-xs font-semibold px-2 py-0.5">{t("Overdue")} · {overduePayroll}</span>
              ) : (
                <span className="rounded-md bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5">{upcomingPayroll}</span>
              )}
            </Row>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
