// Hook nad RPC-om `staff_directory()` (migracija 20261125160000): imena osoblja za prikaz „ko je odobrio/evidentirao/
// odlučio". Greška RPC-a ne ruši ekran — tada se prikazuju samo datumi (i sopstveno ime iz sesije).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { staffLookup } from "@/lib/staffDirectory";

export function useStaffDirectory({ enabled = true } = {}) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["staff-directory"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => base44.rpc("staff_directory", {}),
  });
  return useMemo(() => staffLookup(Array.isArray(q.data) ? q.data : [], { self: user }), [q.data, user]);
}
