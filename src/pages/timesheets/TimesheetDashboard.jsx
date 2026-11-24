import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  endOfMonth,
  format,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  startOfMonth,
} from "date-fns";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/shared/PageHeader";
import SortSelect from "@/components/shared/SortSelect";
import { useLang } from "@/lib/LanguageContext";
import { buildDateColumns, buildView, buildWeekColumns, computeEntries, resolveRange } from "@/lib/timesheetReport";
import { exportReportExcel, exportReportPDF } from "@/lib/timesheetExport";
import { DASH_LABELS } from "@/components/timesheets/dashboard/labels";
import ReportFilters from "@/components/timesheets/dashboard/ReportFilters";
import KpiCards from "@/components/timesheets/dashboard/KpiCards";
import DashboardTable from "@/components/timesheets/dashboard/DashboardTable";

const makeInitialFilters = () => {
  const now = new Date();
  const week = getISOWeek(now);
  return {
    vendor: "all",
    year: getISOWeekYear(now),
    periodType: "weeks",
    weekFrom: week,
    weekTo: week,
    month: now.getMonth(),
    dateFrom: format(startOfMonth(now), "yyyy-MM-dd"),
    dateTo: format(endOfMonth(now), "yyyy-MM-dd"),
    search: "",
    project: "all",
  };
};

export default function TimesheetDashboard() {
  const { lang } = useLang();
  const L = DASH_LABELS[lang] || DASH_LABELS.en;

  const [filters, setFilters] = useState(makeInitialFilters);
  const [viewMode, setViewMode] = useState("daily");
  const [sort, setSort] = useState("name_asc");
  const [collapsed, setCollapsed] = useState(() => new Set());

  const { data: weekStarts = [] } = useQuery({
    queryKey: ["ts-week-starts"],
    queryFn: async () => {
      const res = await base44.entities.Timesheet.list({ distinct: "week_start" });
      return (res.items || res || []).filter(Boolean);
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["ts-vendors"],
    queryFn: async () => {
      // Ista firma po kojoj se grupiše (dobavljač, a za stare redove klijent) — ranije su opcije bile samo klijenti.
      const [byVendor, byClient] = await Promise.all([
        base44.entities.Timesheet.list({ distinct: "vendor_name" }),
        base44.entities.Timesheet.list({ distinct: "client_name" }),
      ]);
      return [...new Set([...(byVendor || []), ...(byClient || [])])].filter(Boolean).sort((a, b) => a.localeCompare(b, "sr"));
    },
  });

  const { data: projectList = [] } = useQuery({
    queryKey: ["ts-projects-distinct"],
    queryFn: async () => {
      const res = await base44.entities.Timesheet.list({ distinct: "project" });
      return (res.items || res || []).filter(Boolean).sort((a, b) => a.localeCompare(b, "sr"));
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("last_name"),
  });

  const years = useMemo(() => {
    const set = new Set(weekStarts.map((w) => getISOWeekYear(parseISO(w))));
    set.add(getISOWeekYear(new Date()));
    return [...set].sort((a, b) => b - a);
  }, [weekStarts]);

  // Start on the most recent recorded period
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || weekStarts.length === 0) return;
    didInit.current = true;
    const latest = [...weekStarts].sort().pop();
    const d = parseISO(latest);
    const week = getISOWeek(d);
    setFilters((f) => ({ ...f, year: getISOWeekYear(d), weekFrom: Math.max(1, week - 3), weekTo: week }));
  }, [weekStarts]);

  const range = useMemo(() => resolveRange(filters), [filters]);
  const dateColumns = useMemo(() => buildDateColumns(range.start, range.end), [range]);
  const weekColumns = useMemo(() => buildWeekColumns(dateColumns), [dateColumns]);
  const columns = viewMode === "daily" ? dateColumns : weekColumns;

  const fromStr = format(addDays(range.start, -6), "yyyy-MM-dd");
  const toStr = format(range.end, "yyyy-MM-dd");

  const { data: timesheets = [], isLoading } = useQuery({
    queryKey: ["ts-dashboard", fromStr, toStr],
    queryFn: async () => {
      const res = await base44.entities.Timesheet.filter(
        { week_start: { $gte: fromStr, $lte: toStr } },
        { limit: 5000, sort: "-week_start" }
      );
      return res.items || res;
    },
  });

  const entries = useMemo(
    () =>
      computeEntries({
        timesheets,
        employees,
        dateColumns,
        vendorFilter: filters.vendor,
        projectFilter: filters.project,
        search: filters.search,
      }),
    [timesheets, employees, dateColumns, filters.vendor, filters.project, filters.search]
  );

  const report = useMemo(() => buildView({ entries, columns, viewMode, sort }), [entries, columns, viewMode, sort]);

  const periodLabel = `${format(range.start, "dd.MM.yyyy")} – ${format(range.end, "dd.MM.yyyy")}`;
  const vendorLabel = filters.vendor === "all" ? L.allCompanies : filters.vendor;

  const buildMeta = (ext) => ({
    labels: L,
    lang,
    vendorLabel,
    periodLabel,
    generatedAt: format(new Date(), "dd.MM.yyyy HH:mm"),
    filename: `Timesheet_Report_${format(range.start, "yyyyMMdd")}-${format(range.end, "yyyyMMdd")}.${ext}`,
  });

  const handleExcel = () => {
    exportReportExcel({ report, columns, headGroups: weekColumns, viewMode, meta: buildMeta("xlsx") });
    toast.success(L.excelDone);
  };

  const handlePdf = async () => {
    await exportReportPDF({ report, columns, headGroups: weekColumns, viewMode, meta: buildMeta("pdf") });
    toast.success(L.pdfDone);
  };

  const toggleVendor = (vendor) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(vendor)) next.delete(vendor);
      else next.add(vendor);
      return next;
    });

  const sortOptions = [
    { value: "name_asc", label: L.sortName },
    { value: "number_asc", label: L.sortNumber },
    { value: "total_desc", label: L.sortHours },
  ];

  const hasData = report.vendorGroups.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader title={L.title} subtitle={L.subtitle}>
        <Button variant="outline" className="gap-2" onClick={handleExcel} disabled={!hasData}>
          <FileSpreadsheet className="w-4 h-4" /> {L.exportExcel}
        </Button>
        <Button variant="outline" className="gap-2" onClick={handlePdf} disabled={!hasData}>
          <FileDown className="w-4 h-4" /> {L.exportPdf}
        </Button>
      </PageHeader>

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        years={years}
        vendors={vendors}
        projects={projectList}
        labels={L}
        lang={lang}
        range={range}
      />

      <KpiCards
        labels={L}
        totalHours={report.grandTotal}
        employeeCount={report.employeeCount}
        vendorCount={report.vendorCount}
        avgHours={report.employeeCount ? report.grandTotal / report.employeeCount : 0}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-sm">
          {[
            { id: "daily", label: L.daily },
            { id: "weekly", label: L.weekly },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setViewMode(option.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                viewMode === option.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <SortSelect value={sort} onValueChange={setSort} options={sortOptions} />
      </div>

      <DashboardTable
        report={report}
        columns={columns}
        headGroups={weekColumns}
        viewMode={viewMode}
        labels={L}
        lang={lang}
        isLoading={isLoading}
        collapsed={collapsed}
        onToggleVendor={toggleVendor}
      />
    </div>
  );
}