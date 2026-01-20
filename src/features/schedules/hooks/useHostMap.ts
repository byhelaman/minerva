import { useMemo } from "react";
import { useZoomStore } from "@/features/matching/stores/useZoomStore";

/**
 * Hook para crear un mapa de host_id -> display_name
 * Reutilizado en CreateLinkModal y AssignLinkModal
 */
export function useHostMap(): Map<string, string> {
    const { users } = useZoomStore();

    return useMemo(() => {
        const map = new Map<string, string>();
        for (const u of users) {
            const displayName = u.display_name || `${u.first_name} ${u.last_name}`.trim() || u.email;
            map.set(u.id, displayName);
        }
        return map;
    }, [users]);
}
