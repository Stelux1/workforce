import { format } from "date-fns";
import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MONTH_LABELS, isoWeeksInYear } from "@/lib/timesheetReport";

const pad = (n) => String(n).padStart(2, "0");

export default function ReportFilters({ filters, onChange, years, vendors, projects, labels, lang = "en", range }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const weekNumbers = Array.from({ length: isoWeeksInYear(filters.year) }, (_, i) => i + 1);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5 col-span-2 lg:col-span-1">
          <Label className="text-xs text-muted-foreground">{labels.vendor}</Label>
          <Select value={filters.vendor} onValueChange={(v) => set({ vendor: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.allCompanies}</SelectItem>
              {vendors.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{labels.year}</Label>
          <Select value={String(filters.year)} onValueChange={(v) => set({ year: Number(v) })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{labels.periodType}</Label>
          <Select value={filters.periodType} onValueChange={(v) => set({ periodType: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weeks">{labels.weeks}</SelectItem>
              <SelectItem value="month">{labels.month}</SelectItem>
              <SelectItem value="custom">{labels.custom}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filters.periodType === "weeks" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{labels.weekFrom}</Label>
              <Select value={String(filters.weekFrom)} onValueChange={(v) => set({ weekFrom: Number(v) })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {weekNumbers.map((w) => <SelectItem key={w} value={String(w)}>W{pad(w)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{labels.weekTo}</Label>
              <Select value={String(filters.weekTo)} onValueChange={(v) => set({ weekTo: Number(v) })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {weekNumbers.map((w) => <SelectItem key={w} value={String(w)}>W{pad(w)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {filters.periodType === "month" && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{labels.month}</Label>
            <Select value={String(filters.month)} onValueChange={(v) => set({ month: Number(v) })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(MONTH_LABELS[lang] || MONTH_LABELS.en).map((m, i) => (
                  <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {filters.periodType === "custom" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{labels.dateFrom}</Label>
              <Input type="date" className="h-9" value={filters.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{labels.dateTo}</Label>
              <Input type="date" className="h-9" value={filters.dateTo} onChange={(e) => set({ dateTo: e.target.value })} />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{labels.project}</Label>
          <Select value={filters.project} onValueChange={(v) => set({ project: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.allProjects}</SelectItem>
              {projects.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs text-muted-foreground">{labels.search}</Label>
          <Input
            className="h-9"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder={labels.searchPlaceholder}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-3">
        <CalendarRange className="w-3.5 h-3.5 text-primary" />
        <span className="font-medium text-foreground">{labels.range}:</span>
        <span className="font-mono">{format(range.start, "dd.MM.yyyy")} – {format(range.end, "dd.MM.yyyy")}</span>
      </div>
    </div>
  );
}