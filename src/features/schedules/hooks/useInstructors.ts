import { useMemo } from "react";
import { useZoomStore } from "@/features/matching/stores/useZoomStore";

export interface Instructor {
    id: string;
    display_name: string;
    email: string;
}

export function useInstructors() {
    const { users } = useZoomStore();

    const instructors = useMemo(() => {
        const uniqueMap = new Map<string, Instructor>();

        // Solo usuarios de Zoom (los que están sincronizados)
        users.forEach(u => {
            if (u.display_name && !uniqueMap.has(u.display_name)) {
                uniqueMap.set(u.display_name, {
                    id: u.id,
                    display_name: u.display_name,
                    email: u.email
                });
            }
        });

        return Array.from(uniqueMap.values()).sort((a, b) =>
            a.display_name.localeCompare(b.display_name)
        );
    }, [users]);

    return instructors;
}
