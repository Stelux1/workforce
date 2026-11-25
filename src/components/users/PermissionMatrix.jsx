import { ShieldCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useL } from "@/lib/translations";
import { MATRIX_COLUMNS, PERMISSION_MATRIX, PERMISSION_PRESETS, matrixColumnCodes, permissionLabel, presetCodes } from "@/lib/permissions";

// Matrica prava jednog korisnika (D31, kao u Blitzkriegu): oblast × Vidi / Dodaje i menja / Odobrava / Dodatno.
// `value` su konačna prava (niz kodova); `onChange` dobija nov niz. `roleDefaults` služi za oznaku „izmenjeno"
// i preset „Kao uloga". Pravila sprovodi baza (RLS, has_permission) — ovo je samo izbor.
export default function PermissionMatrix({ value = [], onChange, roleDefaults = [], lang = "en", disabled = false }) {
  const L = useL();
  const set = new Set(value);
  const def = new Set(roleDefaults);
  const t = (o) => o?.[lang] || o?.en;

  const toggle = (code, on) => {
    const next = new Set(set);
    if (on) next.add(code);
    else next.delete(code);
    onChange([...next]);
  };
  const setMany = (codes, on) => {
    const next = new Set(set);
    for (const c of codes) (on ? next.add(c) : next.delete(c));
    onChange([...next]);
  };

  const cell = (code, label) => {
    if (!code) return <span className="text-muted-foreground" aria-hidden="true">—</span>;
    const on = set.has(code);
    const changed = on !== def.has(code);
    return (
      <label key={code} className={`inline-flex items-center gap-1.5 ${disabled ? "" : "cursor-pointer"}`} title={permissionLabel(code, lang)}>
        <Checkbox
          checked={on}
          disabled={disabled}
          onCheckedChange={(v) => toggle(code, v === true)}
          aria-label={permissionLabel(code, lang)}
          data-testid={`perm-${code}`}
        />
        {label && <span className="text-xs leading-tight">{t(label)}</span>}
        {changed && <span className="h-1.5 w-1.5 rounded-full bg-primary" title={L("Changed from role", "Izmenjeno u odnosu na ulogu", "Zmenené oproti role")} />}
      </label>
    );
  };

  const columnState = (key) => {
    const codes = matrixColumnCodes(key);
    const n = codes.filter((c) => set.has(c)).length;
    return { codes, checked: n === codes.length }; // delimično = neoznačeno (klik označi celu kolonu)
  };

  return (
    <div className="space-y-3" data-testid="permission-matrix">
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{L("Quick choice:", "Brzi izbor:", "Rýchla voľba:")}</span>
          {PERMISSION_PRESETS.map((p) => (
            <Button key={p.key} type="button" variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => onChange(presetCodes(p.key, roleDefaults))} data-testid={`preset-${p.key}`}>
              {t(p.label)}
            </Button>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5" />
            {L(`${set.size} permissions`, `${set.size} prava`, `${set.size} oprávnení`)}
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium min-w-[12rem]">{L("Area", "Oblast", "Oblasť")}</th>
              {MATRIX_COLUMNS.map((c) => {
                const st = columnState(c.key);
                return (
                  <th key={c.key} className="text-left px-3 py-2 font-medium whitespace-nowrap">
                    <label className={`inline-flex items-center gap-1.5 ${disabled ? "" : "cursor-pointer"}`}>
                      {!disabled && (
                        <Checkbox checked={st.checked} onCheckedChange={(v) => setMany(st.codes, v === true)}
                          aria-label={L(`All: ${t(c.label)}`, `Sve: ${t(c.label)}`, `Všetko: ${t(c.label)}`)} />
                      )}
                      {t(c.label)}
                    </label>
                  </th>
                );
              })}
            </tr>
          </thead>
          {PERMISSION_MATRIX.map((g) => (
            <tbody key={g.key}>
              <tr className="bg-muted/30">
                <td colSpan={MATRIX_COLUMNS.length + 1} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(g.label)}
                </td>
              </tr>
              {g.areas.map((a) => (
                <tr key={a.key} className="border-t hover:bg-muted/20" data-testid={`matrix-row-${a.key}`}>
                  <td className="px-3 py-2">{t(a.label)}</td>
                  <td className="px-3 py-2">{cell(a.view)}</td>
                  <td className="px-3 py-2">{cell(a.edit)}</td>
                  <td className="px-3 py-2">{cell(a.approve)}</td>
                  <td className="px-3 py-2">
                    {a.extra.length ? (
                      <div className="flex flex-col gap-1">{a.extra.map((e) => cell(e.code, e.label))}</div>
                    ) : (
                      cell(null)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {L(
          "“View” shows the section in the menu; without it the page is hidden. “Add & edit” without “View” still allows changes from other pages (e.g. project detail). A dot marks a change from the role.",
          "„Vidi\" prikazuje sekciju u meniju; bez toga je stranica sakrivena. „Dodaje i menja\" bez „Vidi\" i dalje dozvoljava izmene sa drugih stranica (npr. detalj projekta). Tačka označava razliku u odnosu na ulogu.",
          "„Vidí\" zobrazí sekciu v menu; bez toho je stránka skrytá. „Pridáva a mení\" bez „Vidí\" stále dovoľuje zmeny z iných stránok. Bodka označuje zmenu oproti role."
        )}
      </p>
    </div>
  );
}
