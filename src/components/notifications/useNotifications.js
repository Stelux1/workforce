import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { requireSupabase } from "@/api/supabase";

// Obaveštenja izračunava baza (refresh_notifications). Klijent je osvežava najviše jednom u REFRESH_MIN_MS
// po otvorenoj kartici, da zvonce i ekran ne bi opterećivali bazu; „Osveži" na ekranu je uvek odmah.
const REFRESH_MIN_MS = 2 * 60 * 1000;
let lastRefresh = 0;
let inflight = null;

export function refreshNotifications({ force = false } = {}) {
  if (inflight) return inflight;
  if (!force && Date.now() - lastRefresh < REFRESH_MIN_MS) return Promise.resolve(null);
  inflight = base44
    .rpc("refresh_notifications")
    .then((n) => {
      lastRefresh = Date.now();
      return n;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Broj nepročitanih za prijavljenog korisnika (notification_reads), za zvonce. */
export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      try {
        await refreshNotifications();
      } catch {
        // Osvežavanje ne sme da sakrije već postojeća obaveštenja; broj se čita svakako.
      }
      return (await base44.rpc("unread_notification_count")) ?? 0;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Vidljiva obaveštenja (RLS) i id-jevi koje je ovaj korisnik pročitao. */
export function useNotificationList() {
  return useQuery({
    queryKey: ["notifications", "list"],
    queryFn: async () => {
      let refreshError = null;
      try {
        await refreshNotifications();
      } catch (e) {
        refreshError = e;
      }
      const [items, reads] = await Promise.all([
        base44.entities.Notification.list("-created_date", 500),
        requireSupabase().from("notification_reads").select("notification_id").limit(5000),
      ]);
      if (reads.error) throw reads.error;
      return { items, readIds: new Set((reads.data || []).map((r) => r.notification_id)), refreshError };
    },
    staleTime: 15_000,
  });
}

export function useNotificationActions() {
  const qc = useQueryClient();
  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ["notifications"] }), [qc]);
  const markRead = useMutation({
    mutationFn: (ids) => base44.rpc("mark_notifications_read", { p_ids: ids ?? null }),
    onSuccess: invalidate,
  });
  const markUnread = useMutation({
    mutationFn: (ids) => base44.rpc("mark_notifications_unread", { p_ids: ids }),
    onSuccess: invalidate,
  });
  return { markRead, markUnread, invalidate };
}
