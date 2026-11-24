// Delovi koje dele kartica „Costs" na projektu i centralna stranica Project Costs (isti entitet, isti prikaz — T13).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Download, FileText, History, Paperclip, Pencil, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";
import { costFxStatus, formatMoney } from "@/lib/projectCosts";
import { costInEur } from "@/lib/payroll/costs";

/** Osvežava svaki prikaz troškova: kartica projekta, centralna tabela, Financial Report i izveštaji koji čitaju ceo spisak. */
export function invalidateCosts(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["project-costs"] });
  queryClient.invalidateQueries({ queryKey: ["project-costs-all"] });
}

export const costProjectLabel = (project) => (project ? (project.project_number ? `${project.project_number} — ${project.name}` : project.name) : "—");
export const workerName = (e) => (e ? `${e.first_name || ""} ${e.last_name || ""}`.trim() || e.employee_id || "—" : "—");

/** Projekti, kategorije, radnici i dobavljači za forme i filtere (isti ključevi kao ostali ekrani gde postoje). */
export function useCostLookups(enabled = true) {
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list("name"), enabled });
  const categories = useQuery({ queryKey: ["cost-categories"], queryFn: () => base44.entities.CostCategory.list("name", 500), enabled });
  const employees = useQuery({ queryKey: ["employees", "cost-lookup"], queryFn: () => base44.entities.Employee.list("first_name"), enabled });
  const vendors = useQuery({ queryKey: ["vendors"], queryFn: () => base44.entities.Vendor.list("name", 500), enabled });
  return useMemo(() => ({
    projects: projects.data || [],
    categories: categories.data || [],
    employees: employees.data || [],
    vendors: vendors.data || [],
    isLoading: projects.isLoading || categories.isLoading,
  }), [projects.data, categories.data, employees.data, vendors.data, projects.isLoading, categories.isLoading]);
}

/** Izbor izvoza (Excel / CSV / PDF). `formats` je spisak koje ekran podržava. */
export function ExportMenu({ T, formats = ["excel", "csv"], onExport, disabled, busy }) {
  const items = { excel: T.exportExcel, csv: T.exportCsv, pdf: T.exportPdf };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={disabled || busy}>
          <Download className="w-4 h-4" />
          {T.export}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((f) => (
          <DropdownMenuItem key={f} onSelect={() => onExport(f)}>
            <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
            {items[f]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Iznos u svojoj valuti; za ne-EUR red ispod stoji EUR iznos po kursu i datumu kursa, ili razlog što ga nema. */
export function CostAmount({ cost, T, lang }) {
  const locale = intlLocale(lang);
  const cur = cost.currency || "EUR";
  const status = costFxStatus(cost);
  return (
    <div className="text-right whitespace-nowrap">
      <p className="font-semibold tabular-nums">{formatMoney(cost.amount, cur, locale)}</p>
      {status === "ok" && (
        <p className="text-xs text-muted-foreground tabular-nums">
          = {formatMoney(costInEur(cost), "EUR", locale)} · {T.rateAt} {Number(cost.eur_rsd_rate)} · {formatIsoDate(cost.fx_rate_date, lang)}
        </p>
      )}
      {status === "rate_without_date" && (
        <p className="text-xs font-medium text-warning flex items-center justify-end gap-1">
          <AlertTriangle className="w-3 h-3" />
          {T.rateNotRecorded}
        </p>
      )}
      {status === "missing_rate" && (
        <p className="text-xs font-medium text-destructive flex items-center justify-end gap-1">
          <AlertTriangle className="w-3 h-3" />
          {T.rateMissing}
        </p>
      )}
    </div>
  );
}

function SortHeader({ column, label, sort, onSort, align = "left", className = "" }) {
  const active = sort?.key === column;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      {onSort ? (
        <button type="button" onClick={() => onSort(column)} className={`inline-flex items-center gap-1 hover:text-primary ${active ? "text-primary" : ""}`}>
          {label}
          <Icon className="w-3 h-3" />
        </button>
      ) : label}
    </th>
  );
}

/**
 * Tabela troškova. Kartica na projektu ne prikazuje kolonu Project (`showProject={false}`), centralna prikazuje.
 * Akcije se prikazuju samo uz pravo costs.manage (server ionako odbija).
 */
export function CostsTable({ costs, lookup, T, lang, showProject = true, sort, onSort, onEdit, onDelete, onHistory, canManage, canHistory }) {
  const projectsById = useMemo(() => new Map(lookup.projects.map((p) => [p.id, p])), [lookup.projects]);
  const employeesById = useMemo(() => new Map(lookup.employees.map((e) => [e.id, e])), [lookup.employees]);
  const vendorsById = useMemo(() => new Map(lookup.vendors.map((v) => [v.id, v])), [lookup.vendors]);
  const showActions = canManage || canHistory;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <SortHeader column="cost_date" label={T.date} sort={sort} onSort={onSort} />
            {showProject && <SortHeader column="project" label={T.project} sort={sort} onSort={onSort} />}
            <SortHeader column="category" label={T.category} sort={sort} onSort={onSort} />
            <SortHeader column="subcategory" label={T.subcategory} sort={sort} onSort={onSort} className="hidden lg:table-cell" />
            <th className="px-4 py-3 text-left font-medium hidden md:table-cell">{T.description}</th>
            <SortHeader column="amount" label={`${T.amount} / ${T.currency}`} sort={sort} onSort={onSort} align="right" />
            {showActions && <th className="px-4 py-3 text-right font-medium w-28">{T.actions}</th>}
          </tr>
        </thead>
        <tbody>
          {costs.map((c) => {
            const project = projectsById.get(c.project_id);
            const employee = employeesById.get(c.employee_id);
            const vendor = vendorsById.get(c.vendor_id);
            return (
              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors align-top">
                <td className="px-4 py-3 whitespace-nowrap">{formatIsoDate(c.cost_date, lang)}</td>
                {showProject && (
                  <td className="px-4 py-3">
                    <p className="font-medium">{costProjectLabel(project)}</p>
                    {project?.client_name && <p className="text-xs text-muted-foreground">{project.client_name}</p>}
                  </td>
                )}
                <td className="px-4 py-3">
                  {c.cost_category_id ? (
                    <p className="font-medium">{c.category || "—"}</p>
                  ) : (
                    <p className="text-xs font-medium text-warning flex items-center gap-1" title={T.needsCategory}>
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      {c.category ? `${c.category} · ${T.uncategorized}` : T.uncategorized}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground lg:hidden">{c.subcategory}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.billable && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-accent text-accent-foreground" title={T.billableHint}>{T.billable}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{c.subcategory || "—"}</td>
                <td className="px-4 py-3 hidden md:table-cell max-w-[22rem]">
                  <p className="break-words">{c.description || "—"}</p>
                  {c.notes && <p className="text-xs text-muted-foreground break-words">{c.notes}</p>}
                  {(employee || vendor) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {employee ? `${T.worker}: ${workerName(employee)}` : `${T.vendor}: ${vendor?.name}`}
                    </p>
                  )}
                  {c.receipt_name && (c.receipt_url ? (
                    <a href={c.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-0.5 hover:underline">
                      <Paperclip className="w-3 h-3" />{c.receipt_name}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5"><Paperclip className="w-3 h-3" />{c.receipt_name}</span>
                  ))}
                </td>
                <td className="px-4 py-3"><CostAmount cost={c} T={T} lang={lang} /></td>
                {showActions && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {canHistory && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onHistory(c)} aria-label={T.history} title={T.history}>
                          <History className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canManage && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(c)} aria-label={T.edit} title={T.edit}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(c)} aria-label={T.delete} title={T.delete}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
