import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabase";

// Broj satnica koje čekaju odobrenje (approval_status = 'submitted'), za značku u meniju.
export function usePendingTimesheets() {
  const { data } = useQuery({
    queryKey: ["pending-timesheets-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("timesheets")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "submitted");
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return data || 0;
}
