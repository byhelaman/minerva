import { useState, useMemo, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScheduleDataTable } from "@schedules/components/table/ScheduleDataTable";
import { getHistoryColumns } from "./pools-history-columns";
import { scheduleEntriesService } from "@/features/schedules/services/schedule-entries-service";
import type { Schedule } from "@/features/schedules/types";
import { getScheduleKey } from "@/features/schedules/utils/overlap-utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

interface PoolsHistoryModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    programQuery: string | null;
}

export function PoolsHistoryModal({ open, onOpenChange, programQuery }: PoolsHistoryModalProps) {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    // Only used when opened without a row context (from "Search History" button)
    const [manualQuery, setManualQuery] = useState("");

    const hasRowContext = !!programQuery;

    // Reset state when modal opens/closes
    useEffect(() => {
        if (open) {
            setManualQuery("");
        } else {
            setSchedules([]);
        }
    }, [open]);

    const fetchHistory = useCallback(async (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return;

        setIsLoading(true);
        try {
            const data = await scheduleEntriesService.getHistoricalSchedulesByProgram(trimmed, 100);
            setSchedules(data);
        } catch (error) {
            console.error("Failed to fetch historical schedules", error);
            toast.error("Failed to load history for this program.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Auto-load when opened with a row context
    useEffect(() => {
        if (open && programQuery) {
            fetchHistory(programQuery);
        }
    }, [open, programQuery, fetchHistory]);

    const columns = useMemo(() => getHistoryColumns(), []);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl! max-h-[85vh] flex flex-col gap-6">
                <DialogHeader>
                    <DialogTitle>Program History</DialogTitle>
                    <DialogDescription>
                        Showing the most recently published classes. Used to validate rotation limits.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-hidden">
                    {/* Show manual search only when opened without row context */}
                    {!hasRowContext && (
                        <div className="flex gap-2 items-center w-full p-1">
                            <Input
                                placeholder="Search by program..."
                                value={manualQuery}
                                onChange={(e) => setManualQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") fetchHistory(manualQuery);
                                }}
                                className="flex-1"
                            />
                            <Button
                                onClick={() => fetchHistory(manualQuery)}
                                disabled={isLoading || !manualQuery.trim()}
                            >
                                {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
                                Search
                            </Button>
                        </div>
                    )}

                    <div className="flex-1 min-h-[300px] overflow-hidden relative flex flex-col">
                        <ScheduleDataTable
                            columns={columns}
                            data={schedules}
                            getRowKey={(row) => getScheduleKey(row as Schedule)}
                            initialPageSize={50}
                            initialColumnVisibility={{ branch: false }}
                            hideActions
                            hideUpload
                            hideDefaultActions
                            hideOverlaps
                            hideBulkCopy
                            disablePersistence
                            hideFilters={hasRowContext}
                            isLiveLoading={isLoading}
                        />
                    </div>
                </div>

            </DialogContent>
        </Dialog>
    );
}
