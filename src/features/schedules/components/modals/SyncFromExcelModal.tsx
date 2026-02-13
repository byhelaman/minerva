import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { Calendar } from "@/components/ui/calendar";
import { Loader2, ArrowLeft, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type DateRange } from "react-day-picker";

import { ScheduleDataTable } from "../table/ScheduleDataTable";
import { getDataSourceColumns } from "@/features/system/components/data-source-columns";
import { useScheduleSyncStore } from "../../stores/useScheduleSyncStore";
import {
    fetchAndValidateFromExcel,
    executeImport,
    getRowKey,
} from "../../services/microsoft-import-service";
import { supabase } from "@/lib/supabase";
import type { Schedule } from "../../types";
import { ensureTimeFormat } from "../../utils/time-utils";
import { getScheduleKey } from "../../utils/overlap-utils";

/** Trim + collapse internal whitespace for consistent comparison */
function normalizeField(val: string | undefined | null): string {
    return (val || '').trim().replace(/\s+/g, ' ');
}

/** Normalize composite key for a schedule — matches importSchedules logic */
function normalizeKey(s: Schedule): string {
    return `${s.date}|${normalizeField(s.program)}|${ensureTimeFormat(s.start_time)}|${normalizeField(s.instructor)}`;
}

type ModalStep = 'filter' | 'loading' | 'preview' | 'importing';

interface SyncFromExcelModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImportComplete?: () => void;
}

export function SyncFromExcelModal({ open, onOpenChange, onImportComplete }: SyncFromExcelModalProps) {
    const [step, setStep] = useState<ModalStep>('filter');

    // Date range filter - default to current day
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
        const now = new Date();
        return { from: now, to: now };
    });

    // Preview data state
    const [previewData, setPreviewData] = useState<Schedule[]>([]);
    const [errorMap, setErrorMap] = useState<Map<string, string[]>>(new Map());

    const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

    const { msConfig } = useScheduleSyncStore();

    // Columns with delete handler
    const columns = useMemo(() => getDataSourceColumns(handleDeleteRow), []);

    // Convert errorMap keys to Set for ScheduleDataTable
    const errorRowKeys = useMemo(() => new Set(errorMap.keys()), [errorMap]);

    // Detect intra-file duplicates (same composite key appears more than once)
    const { duplicateKeys, duplicateCount } = useMemo(() => {
        const keyCounts = new Map<string, number>();
        const keyToScheduleKeys = new Map<string, Set<string>>();

        for (const s of previewData) {
            const nk = normalizeKey(s);
            keyCounts.set(nk, (keyCounts.get(nk) || 0) + 1);

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
    }, [previewData]);

    // Merge error keys + duplicate keys for row highlighting
    const allErrorKeys = useMemo(() => {
        const merged = new Set(errorRowKeys);
        for (const k of duplicateKeys) merged.add(k);
        return merged;
    }, [errorRowKeys, duplicateKeys]);

    // Auto-reset filter when no more duplicates
    useEffect(() => {
        if (duplicateCount === 0 && showDuplicatesOnly) {
            setShowDuplicatesOnly(false);
        }
    }, [duplicateCount, showDuplicatesOnly]);

    // Filtered data for display
    const displayData = useMemo(() => {
        if (!showDuplicatesOnly) return previewData;

        const keyCounts = new Map<string, number>();
        for (const s of previewData) {
            const nk = normalizeKey(s);
            keyCounts.set(nk, (keyCounts.get(nk) || 0) + 1);
        }
        return previewData.filter(s => (keyCounts.get(normalizeKey(s)) || 0) > 1);
    }, [previewData, showDuplicatesOnly]);

    // Counts
    const validCount = previewData.length - errorMap.size;
    const invalidCount = errorMap.size;

    // Reset state when modal opens
    useEffect(() => {
        if (open) {
            setStep('filter');
            const now = new Date();
            setDateRange({ from: now, to: now });
            setPreviewData([]);
            setErrorMap(new Map());
            setShowDuplicatesOnly(false);
        }
    }, [open]);

    // Delete a row from preview
    function handleDeleteRow(schedule: Schedule) {
        const key = getRowKey(schedule);

        setPreviewData(prev => prev.filter(s => getRowKey(s) !== key));

        // Also remove from error map if it was there
        setErrorMap(prev => {
            const newMap = new Map(prev);
            newMap.delete(key);
            return newMap;
        });
    }

    const handleLoadData = async () => {
        setStep('loading');

        try {
            // Fetch all rows from Excel
            const result = await fetchAndValidateFromExcel(msConfig, undefined);

            let filteredSchedules = result.schedules;
            let filteredErrorMap = result.errorMap;

            // Apply date range filter
            if (dateRange?.from) {
                const fromStr = format(dateRange.from, "yyyy-MM-dd");
                const toStr = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : fromStr;

                // Filter schedules by date range
                filteredSchedules = result.schedules.filter(s =>
                    s.date >= fromStr && s.date <= toStr
                );

                // Filter error map to only include errors for remaining schedules
                const remainingKeys = new Set(filteredSchedules.map(s => getRowKey(s)));
                filteredErrorMap = new Map(
                    Array.from(result.errorMap.entries()).filter(([key]) => remainingKeys.has(key))
                );
            }

            setPreviewData(filteredSchedules);
            setErrorMap(filteredErrorMap);
            setStep('preview');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error(message);
            setStep('filter');
        }
    };

    const handleImport = async () => {
        if (errorMap.size > 0) return;

        setStep('importing');

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id || '';

            const { upsertedCount, duplicatesSkipped } = await executeImport(previewData, userId);

            const description = duplicatesSkipped > 0
                ? `${duplicatesSkipped} duplicate(s) were merged`
                : undefined;
            toast.success(`Successfully imported ${upsertedCount} schedules`, { description });

            onImportComplete?.();
            onOpenChange(false);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Import failed';
            toast.error(message);
            setStep('preview');
        }
    };

    const canImport = previewData.length > 0 && errorMap.size === 0 && duplicateCount === 0;

    // Column visibility for preview
    const initialColumnVisibility = {
        shift: false,
        branch: false,
        end_time: false,
        code: false,
        minutes: false,
        units: false,
        substitute: false,
        subtype: false,
        description: false,
        department: false,
        feedback: false,
    };

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
        <Dialog open={open} onOpenChange={(val) => step !== 'importing' && onOpenChange(val)}>
            <DialogContent className={cn(
                "flex flex-col max-h-[85vh]",
                step === 'filter' ? 'max-w-md' : 'max-w-7xl!',
                step === 'preview' && 'max-w-7xl!'
            )}>
                <DialogHeader>
                    <DialogTitle>Sync from Excel</DialogTitle>
                    <DialogDescription>
                        {step === 'filter' && "Select the date range to import"}
                        {step === 'loading' && "Fetching data from Excel..."}
                        {step === 'preview' && (
                            invalidCount > 0 || duplicateCount > 0
                                ? `Fix ${invalidCount > 0 ? `${invalidCount} errors` : ''}${invalidCount > 0 && duplicateCount > 0 ? ' and ' : ''}${duplicateCount > 0 ? `${duplicateCount} duplicates` : ''} before importing`
                                : `${validCount} schedules ready to import`
                        )}
                        {step === 'importing' && "Importing schedules..."}
                    </DialogDescription>
                </DialogHeader>

                {/* Date Range Picker */}
                {step === 'filter' && (
                    <div className="py-4">
                        {/* Date Picker Range */}
                        <Calendar
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={setDateRange}
                            numberOfMonths={2}
                            className="[--cell-size:--spacing(7.5)]"
                        />

                    </div>
                )}

                {/* Loading State */}
                {step === 'loading' && (
                    <div className="flex flex-col items-center justify-center gap-2 h-full border border-dashed rounded-lg bg-muted/10 p-8 min-h-100">
                        <div className="relative flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-sm font-medium">Loading schedules...</p>
                            <p className="text-xs text-muted-foreground">
                                Fetching data from Excel. This may take a moment.
                            </p>
                        </div>
                    </div>
                )}

                {/* Preview Table */}
                {step === 'preview' && (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden pr-2">
                        <ScheduleDataTable
                            columns={columns}
                            data={displayData}
                            errorRowKeys={allErrorKeys}
                            filterConfig={{
                                showStatus: false,
                                showIncidenceType: true,
                                showBranch: false,
                                showTime: false,
                            }}
                            hideActions
                            hideUpload
                            hideOverlaps
                            initialPageSize={100}
                            initialColumnVisibility={initialColumnVisibility}
                            customFilterItems={<>{duplicatesFilterButton}{resetFilterButton}</>}
                            hideBulkCopy
                            onBulkDelete={(rows) => {
                                const toRemove = new Set(rows);
                                setPreviewData(prev => prev.filter(s => !toRemove.has(s)));
                                // Also clean error map for removed rows
                                setErrorMap(prev => {
                                    const newMap = new Map(prev);
                                    for (const s of rows as Schedule[]) {
                                        newMap.delete(getRowKey(s));
                                    }
                                    return newMap;
                                });
                                toast.success(`${rows.length} row(s) removed`);
                            }}
                        />
                    </div>
                )}

                {/* Importing State */}
                {step === 'importing' && (
                    <div className="flex flex-col items-center justify-center gap-2 h-full border border-dashed rounded-lg bg-muted/10 p-8 min-h-100">
                        <div className="relative flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-sm font-medium">Importing schedules...</p>
                            <p className="text-xs text-muted-foreground">
                                Importing data from Excel. This may take a moment.
                            </p>
                        </div>
                    </div>
                )}

                <DialogFooter className="mt-auto flex-col sm:flex-row gap-4">
                    {step === 'filter' && (
                        <div className="flex gap-2 ml-auto">
                            <Button variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleLoadData} disabled={!dateRange?.from}>
                                Load Data
                            </Button>
                        </div>
                    )}

                    {(step === 'preview' || step === 'loading') && (
                        <div className="flex items-center gap-6 w-full">
                            {/* Stats */}
                            <div className="flex items-center gap-3 mr-auto text-sm text-muted-foreground">
                                <span>Valid: <strong className="text-foreground font-medium">{validCount}</strong></span>
                                {(invalidCount > 0 || step === 'loading') && (
                                    <>
                                        <span className="text-border">|</span>
                                        <span>Invalid: <strong className="text-foreground font-medium">{invalidCount}</strong></span>
                                    </>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => setStep('filter')} disabled={step === 'loading'}>
                                    <ArrowLeft />
                                    Back
                                </Button>
                                <Button onClick={handleImport} disabled={!canImport || step === 'loading'}>
                                    Import {validCount > 0 && `(${validCount})`}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
