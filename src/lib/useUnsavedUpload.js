import { useCallback, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

// Prati fajl otpremljen u otvorenoj formi a još nesačuvan, da se obriše iz Storage-a ako forma
// bude otkazana/zatvorena/napuštena, ili ako se fajl zameni ili ukloni pre čuvanja (QA 14.11.2026).
//   track(url)  - novi otpremljen fajl; prethodni nesačuvan se briše
//   discard()   - briše nesačuvan fajl (Otkaži, X, zatvaranje)
//   commit()    - zapis je sačuvan: fajl se zadržava
// Pri napuštanju stranice (unmount) nesačuvan fajl se briše sam.
export function useUnsavedUpload() {
  const pending = useRef(null);

  const discard = useCallback(() => {
    const url = pending.current;
    pending.current = null;
    if (url) base44.integrations.Core.DiscardUpload({ file_url: url });
  }, []);

  const track = useCallback((url) => {
    const prev = pending.current;
    pending.current = url || null;
    if (prev && prev !== url) base44.integrations.Core.DiscardUpload({ file_url: prev });
  }, []);

  const commit = useCallback(() => { pending.current = null; }, []);

  useEffect(() => discard, [discard]);

  return { track, discard, commit };
}
