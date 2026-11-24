// Prikaz statusa angažmana (§4.4) — iste boje u tabeli, donut grafikonu i legendi (Teamora tokeni, bez hardkodovanih boja).
import { cn } from "@/lib/utils";
import { useAssignmentStatusLabels } from "@/components/rates/AssignmentTable";

export { useAssignmentStatusLabels };

export const STATUS_META = Object.freeze({
  active: { pill: "bg-success-soft text-success", dot: "bg-success", chart: "hsl(var(--chart-1))", swatch: "bg-chart-1" },
  upcoming: { pill: "bg-primary/10 text-primary", dot: "bg-primary", chart: "hsl(var(--chart-2))", swatch: "bg-chart-2" },
  ending_soon: { pill: "bg-warning-soft text-warning", dot: "bg-warning", chart: "hsl(var(--chart-4))", swatch: "bg-chart-4" },
  completed: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60", chart: "hsl(var(--border))", swatch: "bg-border" },
  cancelled: { pill: "bg-muted text-muted-foreground line-through", dot: "bg-muted-foreground/40", chart: "hsl(var(--muted))", swatch: "bg-muted" },
});

export function StatusPill({ status, className }) {
  const labels = useAssignmentStatusLabels();
  const meta = STATUS_META[status] || STATUS_META.completed;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", meta.pill, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden />
      {labels[status] || status}
    </span>
  );
}
