// Fajl otpremljen u formi koja se ne sačuva (Otkaži, zatvaranje, zamena drugim fajlom) briše se iz skladišta.
// `saving` = da li je čuvanje u toku. Dok traje, odbacivanje se odlaže: ako čuvanje uspe (commit), fajl ostaje;
// ako ne uspe, briše se tek tada. Tako se nikad ne obriše fajl na koji je sačuvan red upravo upućen.
import { useCallback, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

export function useUnsavedUpload(saving = false) {
  const pending = useRef(null);
  const deferred = useRef(false);
  const busy = useRef(saving);
  busy.current = saving;

  const remove = (url) => { if (url) base44.integrations.Core.DiscardUpload({ file_url: url }); };

  const discard = useCallback(() => {
    if (busy.current) { deferred.current = true; return; }
    const url = pending.current;
    pending.current = null;
    remove(url);
  }, []);

  const track = useCallback((url) => {
    const prev = pending.current;
    pending.current = url || null;
    deferred.current = false;
    if (prev && prev !== url) remove(prev);
  }, []);

  const commit = useCallback(() => { pending.current = null; deferred.current = false; }, []);

  // Čuvanje se završilo: ako je u međuvremenu traženo odbacivanje, a red nije sačuvan — obriši sada.
  useEffect(() => {
    if (!saving && deferred.current) { deferred.current = false; discard(); }
  }, [saving, discard]);

  // Napuštanje stranice: briše nesačuvan fajl, osim ako čuvanje još traje (bolje zaostao fajl nego red bez fajla).
  useEffect(() => () => { if (!busy.current) { remove(pending.current); pending.current = null; } }, []);

  return { track, discard, commit };
}
