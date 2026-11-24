// Centralna tabela Project Assignments (§4.1): red = jedno angažovanje. Sortiranje kolona, strane i broj redova.
// B2C/B2B kolone postoje samo uz rates.view_b2c / rates.view_b2b (T26). Akcije A2 samo uz assignments.manage (T06):
// bez prava ostaje samo View — nema dugmadi koja lažno obećavaju izmenu.
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowRightLeft, Ban, CalendarX2, ChevronLeft, ChevronRight, Eye, MoreVertical, Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";
import { StatusPill } from "./status";

export const PAGE_SIZES = [10, 25, 50, 100];

export function initialsOf(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function formatRate(r, lang) {
  if (!r || r.error) return null;
  try {
    return new Intl.NumberFormat(intlLocale(lang), { style: "currency", currency: r.currency || "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.rate);
  } catch {
    return `${Number(r.rate).toFixed(2)} ${r.currency || ""}`.trim();
  }
}

export function RateCell({ value, lang, L }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  if (value.error) {
    return (
      <span className="text-xs font-medium text-warning" title={value.error === "unit"
        ? L("The winning rate isn't hourly", "Važeća tarifa nije po satu", "Platná sadzba nie je hodinová")
        : L("No rate applies on this date", "Nijedna tarifa ne važi na taj dan", "K tomuto dátumu neplatí žiadna sadzba")}>
        {value.error === "unit" ? L("not hourly", "nije po satu", "nie hodinová") : L("missing", "nema", "chýba")}
      </span>
    );
  }
  return <span className="tabular-nums">{formatRate(value, lang)}</span>;
}

export function EmployeeCell({ row }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {row.employeePhoto ? (
        <img src={row.employeePhoto} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initialsOf(row.employeeName)}</span>
      )}
      <div className="min-w-0">
        <p className="truncate font-medium">{row.employeeName || "—"}</p>
        {row.employeeCode && <p className="truncate text-xs text-muted-foreground">{row.employeeCode}</p>}
      </div>
    </div>
  );
}

function SortHeader({ k, label, sort, onSort, className }) {
  const active = sort.key === k;
  const Icon = active ? (sort.dir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <th className={cn("px-2 py-3 text-left font-medium", className)} aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 whitespace-nowrap rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {label}
        <Icon className={cn("h-3.5 w-3.5", active ? "text-primary" : "opacity-40")} />
      </button>
    </th>
  );
}

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…" + p);
    out.push(p);
  });
  return out;
}

/**
 * @param {object[]} props.rows      ceo filtriran i sortiran skup (strana se seče ovde)
 * @param {{key, dir}} props.sort
 * @param {{seeB2C, seeB2B, canManage}} props.access
 * @param {{onView, onEdit, onTransfer, onAdditional, onEnd, onCancel}} props.actions
 */
export default function AssignmentsTable({ rows, sort, onSort, page, pageSize, onPage, onPageSize, access, actions }) {
  const L = useL();
  const { lang } = useLang();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const slice = rows.slice((current - 1) * pageSize, current * pageSize);
  const first = total ? (current - 1) * pageSize + 1 : 0;
  const last = Math.min(current * pageSize, total);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-foreground/80">
              <SortHeader k="employee" label={L("Employee", "Radnik", "Zamestnanec")} sort={sort} onSort={onSort} className="pl-3" />
              <SortHeader k="project" label={L("Project", "Projekat", "Projekt")} sort={sort} onSort={onSort} />
              <SortHeader k="client" label={L("Client", "Klijent", "Klient")} sort={sort} onSort={onSort} className="hidden min-[1800px]:table-cell" />
              <SortHeader k="role" label={L("Job Role", "Job Role", "Pracovná rola")} sort={sort} onSort={onSort} />
              {access.seeB2C && <SortHeader k="b2c" label={L("B2C Rate", "B2C tarifa", "Sadzba B2C")} sort={sort} onSort={onSort} />}
              {access.seeB2B && <SortHeader k="b2b" label={L("B2B Rate", "B2B tarifa", "Sadzba B2B")} sort={sort} onSort={onSort} />}
              <SortHeader k="start" label={L("Start Date", "Početak", "Začiatok")} sort={sort} onSort={onSort} />
              <SortHeader k="end" label={L("End Date", "Kraj", "Koniec")} sort={sort} onSort={onSort} />
              <SortHeader k="status" label={L("Status", "Status", "Stav")} sort={sort} onSort={onSort} />
              <th className="px-2 py-3 pr-3 text-right font-medium">{L("Actions", "Akcije", "Akcie")}</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((a) => {
              const live = a.displayStatus !== "cancelled";
              const editable = access.canManage && live;
              return (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="max-w-[220px] px-2 py-2.5 pl-3"><EmployeeCell row={a} /></td>
                  <td className="max-w-[180px] px-2 py-2.5">
                    <p className="truncate">{a.projectName || "—"}</p>
                    {a.clientName && <p className="truncate text-xs text-muted-foreground min-[1800px]:hidden">{a.clientName}</p>}
                  </td>
                  <td className="hidden max-w-[160px] truncate px-2 py-2.5 text-muted-foreground min-[1800px]:table-cell">{a.clientName || "—"}</td>
                  <td className="px-2 py-2.5">
                    {a.roleName ? (
                      <span className="inline-flex max-w-[160px] truncate rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{a.roleName}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  {access.seeB2C && <td className="whitespace-nowrap px-2 py-2.5"><RateCell value={a.b2c} lang={lang} L={L} /></td>}
                  {access.seeB2B && <td className="whitespace-nowrap px-2 py-2.5"><RateCell value={a.b2b} lang={lang} L={L} /></td>}
                  <td className="whitespace-nowrap px-2 py-2.5 text-muted-foreground">{formatIsoDate(a.start_date, lang)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-muted-foreground">{a.end_date ? formatIsoDate(a.end_date, lang) : L("Open-ended", "Bez kraja", "Na neurčito")}</td>
                  <td className="px-2 py-2.5"><StatusPill status={a.displayStatus} /></td>
                  <td className="px-2 py-2.5 pr-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => actions.onView(a)}
                        aria-label={L("View assignment", "Detalji angažmana", "Detail pridelenia")} title={L("View", "Detalji", "Detail")}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {editable && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => actions.onEdit(a)}
                            aria-label={L("Edit assignment", "Izmeni angažman", "Upraviť pridelenie")} title={L("Edit", "Izmeni", "Upraviť")}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={L("More actions", "Još akcija", "Ďalšie akcie")}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {a.displayStatus !== "completed" && (
                                <DropdownMenuItem onSelect={() => actions.onTransfer(a)}>
                                  <ArrowRightLeft className="mr-2 h-4 w-4" /> {L("Transfer", "Transfer", "Presun")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => actions.onAdditional(a)}>
                                <UserPlus className="mr-2 h-4 w-4" /> {L("Additional assignment", "Dodatni angažman", "Ďalšie pridelenie")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => actions.onEnd(a)}>
                                <CalendarX2 className="mr-2 h-4 w-4" /> {L("End assignment", "Završi angažman", "Ukončiť pridelenie")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => actions.onCancel(a)} className="text-destructive focus:text-destructive">
                                <Ban className="mr-2 h-4 w-4" /> {L("Cancel assignment", "Poništi angažman", "Zrušiť pridelenie")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          {L(`Showing ${first}–${last} of ${total} assignments`, `Prikazano ${first}–${last} od ${total} angažmana`, `Zobrazené ${first}–${last} z ${total} pridelení`)}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span>{L("Rows per page:", "Redova po strani:", "Riadkov na stranu:")}</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-[72px] bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <nav className="flex items-center gap-1" aria-label={L("Pages", "Strane", "Strany")}>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={current <= 1} onClick={() => onPage(current - 1)} aria-label={L("Previous page", "Prethodna strana", "Predchádzajúca strana")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageList(current, pages).map((p) => typeof p === "string" ? (
              <span key={p} className="px-1">…</span>
            ) : (
              <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === current ? "page" : undefined}
                className={cn("h-8 min-w-8 rounded-full px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  p === current ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted")}>
                {p}
              </button>
            ))}
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={current >= pages} onClick={() => onPage(current + 1)} aria-label={L("Next page", "Sledeća strana", "Ďalšia strana")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </div>
    </div>
  );
}
