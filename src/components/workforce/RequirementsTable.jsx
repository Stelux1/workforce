// Spisak Required Workforce zahteva u prikazanom periodu, sa manjkom/viškom izračunatim iz pokrivenosti.
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import { useLang } from "@/lib/LanguageContext";
import { useL } from "@/lib/translations";
import { formatIsoDate } from "@/lib/dateFormat";
import { requirementRows } from "@/lib/workforceUi";
import { shiftTitle } from "./common";

export default function RequirementsTable({ data, from, to, projectId, canManage, onAdd, onEdit, onChanged }) {
  const L = useL();
  const { lang } = useLang();
  const [toDelete, setToDelete] = useState(null);
  const rows = useMemo(() => requirementRows({ requirements: data.requirements, coverageRows: data.coverageRows, from, to }), [data.requirements, data.coverageRows, from, to]);
  const projectName = (id) => data.projects.find((p) => p.id === id)?.name || "—";
  const roleTitle = (id) => data.roles.find((r) => r.id === id)?.title || "—";
  const shiftOf = (id) => data.shifts.find((s) => s.id === id);

  const remove = useMutation({
    mutationFn: (id) => base44.entities.WorkforceRequirement.delete(id),
    onSuccess: () => {
      toast.success(L("Requirement removed", "Zahtev je uklonjen", "Požiadavka bola odstránená"));
      onChanged?.();
    },
    onError: (e) => toast.error(describeError(e)),
  });

  if (!rows.length) {
    return (
      <div className="rounded-xl border bg-card shadow-card">
        <EmptyState
          icon={Users}
          title={L("No required workforce in this period", "Nema zadatog potrebnog broja radnika u ovom periodu", "V tomto období nie je zadaný potrebný počet pracovníkov")}
          description={L(
            "Define how many workers each Job Role needs per shift. Coverage, shortages and the Gantt are calculated from it.",
            "Zadajte koliko radnika treba svakom Job Role-u po smeni. Iz toga se računaju pokrivenost, manjak i Gantt.",
            "Zadajte, koľko pracovníkov potrebuje každá Job Role na zmenu. Z toho sa počíta pokrytie, nedostatok a Gantt."
          )}
          actionLabel={canManage ? L("Add required workforce", "Dodaj potreban broj", "Pridať potrebný počet") : undefined}
          onAction={onAdd}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-card overflow-x-auto" data-testid="requirements-table">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">{L("Required workforce", "Potreban broj radnika", "Potrebný počet pracovníkov")}</h3>
        {canManage && (
          <Button size="sm" onClick={onAdd} className="gap-1.5"><Plus className="h-4 w-4" />{L("Add", "Dodaj", "Pridať")}</Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {!projectId && <TableHead>{L("Project", "Projekat", "Projekt")}</TableHead>}
            <TableHead>Job Role</TableHead>
            <TableHead>{L("Shift", "Smena", "Zmena")}</TableHead>
            <TableHead>{L("Period", "Period", "Obdobie")}</TableHead>
            <TableHead className="text-right">{L("Required", "Potrebno", "Potrebné")}</TableHead>
            <TableHead>{L("Coverage in view", "Pokrivenost u prikazu", "Pokrytie v zobrazení")}</TableHead>
            {canManage && <TableHead className="w-24" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((q) => (
            <TableRow key={q.id}>
              {!projectId && <TableCell className="whitespace-nowrap">{projectName(q.project_id)}</TableCell>}
              <TableCell className="font-medium">{roleTitle(q.project_role_id)}</TableCell>
              <TableCell className="whitespace-nowrap">{shiftTitle(shiftOf(q.shift_id))}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatIsoDate(q.date_from, lang)} – {formatIsoDate(q.date_to, lang)}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{q.required_count}</TableCell>
              <TableCell>
                {q.deficitDays > 0 ? (
                  <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    {L("Shortage", "Manjak", "Nedostatok")}: {q.deficitDays} {L("days", "dana", "dní")} (max {q.maxDeficit})
                  </span>
                ) : q.surplusDays > 0 ? (
                  <span className="inline-flex rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                    {L("Surplus", "Višak", "Prebytok")}: {q.surplusDays} {L("days", "dana", "dní")}
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{L("Covered", "Pokriveno", "Pokryté")}</span>
                )}
              </TableCell>
              {canManage && (
                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" aria-label={L("Change", "Izmeni", "Zmeniť")} onClick={() => onEdit(q)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={L("Remove", "Ukloni", "Odstrániť")} onClick={() => setToDelete(q)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ConfirmDeleteDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => remove.mutate(toDelete.id)}
        message={L(
          "The whole period of this requirement will be removed. To change the number only from a date, use Change instead.",
          "Ukloniće se ceo period ovog zahteva. Ako broj menjate samo od nekog datuma, koristite Izmeni.",
          "Odstráni sa celé obdobie tejto požiadavky. Ak počet meníte len od určitého dátumu, použite Zmeniť."
        )}
      />
    </div>
  );
}
