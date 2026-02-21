import { useEffect, useMemo, useState } from "react";
import { ScheduleDataTable } from "@/features/schedules/components/table/ScheduleDataTable";
import { getDataSourceColumns } from "../data-source-columns";
import type { Schedule } from "@/features/schedules/types";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, AlertTriangle, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { scheduleEntriesService } from "@/features/schedules/services/schedule-entries-service";
import { ensureTimeFormat } from "@/features/schedules/utils/time-utils";
import { getScheduleKey } from "@/features/schedules/utils/overlap-utils";
import { cn } from "@/lib/utils";

interface ImportReportsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: Schedule[];
    onConfirm: () => void;
}

/** Trim + collapse internal whitespace for consistent comparison */
function normalizeField(val: string | undefined | null): string {
    return (val || '').trim().replace(/\s+/g, ' ');
}

/** Normalize composite key for a schedule — matches importSchedules logic */
function normalizeKey(s: Schedule): string {
    return `${s.date}|${ensureTimeFormat(s.start_time)}|${normalizeField(s.instructor)}|${normalizeField(s.program)}`;
}

export function ImportReportsModal({ open, onOpenChange, data, onConfirm }: ImportReportsModalProps) {
    const columns = useMemo(() => getDataSourceColumns(), []);
    const [isSaving, setIsSaving] = useState(false);
    const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

    // Working copy of data that the user can modify (remove rows)
    const [workingData, setWorkingData] = useState<Schedule[]>([]);

    // Reset working data when modal opens with new data
    useEffect(() => {
        if (open && data?.length > 0) {
            setWorkingData([...data]);
            setShowDuplicatesOnly(false);
        }
    }, [open, data]);

    const initialVisibility = {
        shift: false,
        branch: false,
        end_time: false,
        // instructor: false,
        code: false,
        minutes: false,
        units: false,
        status: false,
        substitute: false,
        description: false,
        department: false,
        feedback: false,
    };

    // Detect intra-file duplicates (same composite key appears more than once)
    const { duplicateKeys, duplicateCount } = useMemo(() => {
        const keyCounts = new Map<string, number>();
        const keyToScheduleKeys = new Map<string, Set<string>>();

        for (const s of workingData) {
            const nk = normalizeKey(s);
            keyCounts.set(nk, (keyCounts.get(nk) || 0) + 1);

            // Map the normalized key to all schedule keys (for row highlighting)
            if (!keyToScheduleKeys.has(nk)) keyToScheduleKeys.set(nk, new Set());
            keyToScheduleKeys.get(nk)!.add(getScheduleKey(s));
        }

        const duplicateScheduleKeys = new Set<string>();
        let count = 0;

        for (const [nk, c] of keyCounts) {
            if (c > 1) {
                count += c;
                const scheduleKeys = keyToScheduleKeys.get(nk);
                if (scheduleKeys) {
                    for (const sk of scheduleKeys) {
                        duplicateScheduleKeys.add(sk);
                    }
                }
            }
        }

        return { duplicateKeys: duplicateScheduleKeys, duplicateCount: count };
    }, [workingData]);

    // Auto-reset filter when no more duplicates
    useEffect(() => {
        if (duplicateCount === 0 && showDuplicatesOnly) {
            setShowDuplicatesOnly(false);
        }
    }, [duplicateCount, showDuplicatesOnly]);

    // Filtered data for display
    const displayData = useMemo(() => {
        if (!showDuplicatesOnly) return workingData;

        // Show only rows whose normalized key appears more than once
        const keyCounts = new Map<string, number>();
        for (const s of workingData) {
            const nk = normalizeKey(s);
            keyCounts.set(nk, (keyCounts.get(nk) || 0) + 1);
        }
        return workingData.filter(s => (keyCounts.get(normalizeKey(s)) || 0) > 1);
    }, [workingData, showDuplicatesOnly]);

    const handleSave = async () => {
        if (workingData.length === 0) {
            toast.warning("No data to save");
            return;
        }

        setIsSaving(true);
        const toastId = toast.loading("Saving data...");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const result = await scheduleEntriesService.importSchedules(workingData, user.id);

            const parts: string[] = [];
            if (result.upsertedCount > 0) parts.push(`${result.upsertedCount} saved`);
            if (result.duplicatesSkipped > 0) parts.push(`${result.duplicatesSkipped} duplicates skipped`);

            toast.success(parts.join(", ") || "Data imported", { id: toastId });
            onConfirm();
            onOpenChange(false);
        } catch (error) {
            console.error("Import failed:", error);
            toast.error("Failed to save data", { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    if (!data) return null;

    // "Duplicados" filter button — same style as overlaps filter
    const duplicatesFilterButton = duplicateCount > 0 ? (
        <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
            className={cn(
                "h-8 border-dashed border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive"
            )}
        >
            <AlertTriangle />
            Duplicados
            {showDuplicatesOnly && ` (${duplicateCount})`}
        </Button>
    ) : null;

    // Reset button when duplicates filter is active
    const resetFilterButton = showDuplicatesOnly ? (
        <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDuplicatesOnly(false)}
        >
            Reset
            <X />
        </Button>
    ) : null;

    return (
        <Dialog open={open} onOpenChange={(val) => !isSaving && onOpenChange(val)}>
            <DialogContent className="max-w-7xl! max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Preview Data</DialogTitle>
                    <DialogDescription>
                        Reviewing {workingData.length} records to import.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden pr-2">
                    <ScheduleDataTable
                        columns={columns}
                        data={displayData}
                        filterConfig={{
                            showStatus: false,
                            showIncidenceType: true,
                            showBranch: false,
                            showTime: false,
                        }}
                        hideActions
                        hideUpload
                        hideOverlaps
                        errorRowKeys={duplicateKeys}
                        initialPageSize={100}
                        initialColumnVisibility={initialVisibility}
                        customFilterItems={<>{duplicatesFilterButton}{resetFilterButton}</>}
                        hideBulkCopy
                        onBulkDelete={(rows) => {
                            const toRemove = new Set(rows);
                            setWorkingData(prev => prev.filter(s => !toRemove.has(s)));
                            toast.success(`${rows.length} row(s) removed`);
                        }}
                    />
                </div>

                <DialogFooter className="mt-auto flex-col sm:flex-row gap-4">
                    <div className="flex items-center gap-6 w-full">
                        <span className="text-sm text-muted-foreground mr-auto">
                            Total rows: <strong className="text-foreground font-medium">{workingData.length}</strong>
                        </span>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={isSaving || workingData.length === 0 || duplicateCount > 0}>
                                {isSaving ? (
                                    <>
                                        <Loader2 className="animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    "Save Data"
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
