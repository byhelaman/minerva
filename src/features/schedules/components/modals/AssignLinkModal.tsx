import { useMemo, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScheduleDataTable } from "@schedules/components/table/ScheduleDataTable";
import { getAssignmentColumns, AssignmentRow } from "@schedules/components/table/assignment-columns";
import { Schedule } from "@schedules/utils/excel-parser";
import { useZoomStore } from "@/features/matching/stores/useZoomStore";
import { useInstructors } from "@/features/schedules/hooks/useInstructors";
import { Loader2 } from "lucide-react";

interface AssignLinkModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    schedules: Schedule[];
}

export function AssignLinkModal({ open, onOpenChange, schedules }: AssignLinkModalProps) {
    const { fetchZoomData, runMatching, matchResults, meetings, users, isLoadingData } = useZoomStore();
    const instructorsList = useInstructors(schedules);
    const [isMatching, setIsMatching] = useState(false);

    // 1. Cargar datos de Zoom si no están cargados
    useEffect(() => {
        if (open && meetings.length === 0 && !isLoadingData) {
            fetchZoomData();
        }
    }, [open, meetings.length, isLoadingData, fetchZoomData]);

    // 2. Ejecutar Matching cuando se abre el modal o cambian los horarios
    // Solo si ya tenemos meetings cargados
    useEffect(() => {
        const doMatching = async () => {
            if (open && schedules.length > 0 && meetings.length > 0 && !isLoadingData) {
                setIsMatching(true);
                await runMatching(schedules);
                setIsMatching(false);
            }
        };
        doMatching();
    }, [open, schedules, meetings.length, runMatching, isLoadingData]);

    // Resetear estado cuando el modal se cierra
    useEffect(() => {
        if (!open) {
            setIsMatching(false);
        }
    }, [open]);

    // Función para refrescar los datos y re-ejecutar el matching
    const handleRefresh = async () => {
        setIsMatching(true);
        try {
            await fetchZoomData();
            const store = useZoomStore.getState();
            if (schedules.length > 0 && store.meetings.length > 0) {
                await runMatching(schedules);
            }
        } catch (error) {
            console.error("Refresh failed:", error);
        } finally {
            setIsMatching(false);
        }
    };

    // Create host ID to name map
    const hostMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const user of users) {
            map.set(user.id, user.display_name || `${user.first_name} ${user.last_name}`);
        }
        return map;
    }, [users]);

    const columns = useMemo(() => getAssignmentColumns(instructorsList, hostMap), [instructorsList, hostMap]);

    // 3. Mapear resultados del matching a filas de la tabla
    const tableData: AssignmentRow[] = useMemo(() => {
        return matchResults.map(r => ({
            ...r.schedule,
            id: r.schedule.code || r.meeting_id || Math.random().toString(), // Fallback ID
            meetingId: r.meeting_id || "-",
            time: `${r.schedule.start_time} - ${r.schedule.end_time}`,
            // instructor: r.schedule.instructor, // Ya en spread
            // program: r.schedule.program, // Ya en spread
            status: r.status,
            reason: r.reason || (r.status === 'not_found' ? 'No match found' : ''),
            detailedReason: r.detailedReason,
            originalSchedule: r.schedule,
            matchedCandidate: r.matchedCandidate,
            ambiguousCandidates: r.ambiguousCandidates
        }));
    }, [matchResults]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="!max-w-[1200px] max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Automatic Assignment</DialogTitle>
                    <DialogDescription>
                        Review and execute the automatic assignment.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 p-2 overflow-auto">
                    {isLoadingData || isMatching ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] space-y-4">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <div className="text-center space-y-2">
                                <p className="text-sm font-medium">
                                    {isLoadingData ? "Loading Zoom data..." : "Matching schedules..."}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {isLoadingData
                                        ? "Fetching meetings and users"
                                        : "Analyzing and matching meetings"}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <ScheduleDataTable
                            columns={columns}
                            data={tableData}
                            onRefresh={handleRefresh}
                            hideFilters={true}
                            hideUpload={true}
                            hideActions={true}
                            hideOverlaps={true}
                        />
                    )}
                </div>

                <DialogFooter className="mt-auto gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button>
                        Execute
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
