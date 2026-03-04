import { useState, useEffect, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, ArrowLeft, Plus, Equal, FilePenLine } from "lucide-react";
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
import type { Schedule } from "@schedules/types";
import { getScheduleKey } from "@schedules/utils/overlap-utils";
import { getSchedulePrimaryKey } from "@schedules/utils/string-utils";
import { getFieldDiffs } from "@schedules/utils/diff-utils";
import { ISSUE_STYLE_GREEN, ISSUE_STYLE_AMBER, ISSUE_STYLE_BLUE, ROW_STYLE_NEW, ROW_STYLE_MODIFIED, ROW_STYLE_DUPLICATE } from "@schedules/utils/issue-styles";
import { scheduleEntriesService } from "../../services/schedule-entries-service";


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

    const [selectedForImport, setSelectedForImport] = useState<Schedule[]>([]);
    const [newCount, setNewCount] = useState<number>(0);
    const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
    const [modifiedKeys, setModifiedKeys] = useState<Set<string>>(new Set());
    const [identicalKeys, setIdenticalKeys] = useState<Set<string>>(new Set());
    const [modifiedReasons, setModifiedReasons] = useState<Map<string, string>>(new Map());



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
            const nk = getSchedulePrimaryKey(s);
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

    // Note: duplicate filtering is now handled by the IssueFilter in ScheduleDataTable,
    // so we just need the duplicate keys for issue categories.

    // External issue categories for the unified IssueFilter
    const externalIssueCategories = useMemo(() => {
        const cats: { key: string; label: string; count: number; icon?: React.ComponentType<{ className?: string }>; activeClassName?: string }[] = [];
        if (duplicateCount > 0) cats.push({ key: 'duplicates', label: 'Duplicados', count: duplicateCount });
        if (newCount > 0) cats.push({ key: 'new', label: 'New', count: newCount, icon: Plus, activeClassName: ISSUE_STYLE_GREEN });
        if (modifiedKeys.size > 0) cats.push({ key: 'modified', label: 'Modified', count: modifiedKeys.size, icon: FilePenLine, activeClassName: ISSUE_STYLE_AMBER });
        if (identicalKeys.size > 0) cats.push({ key: 'identical', label: 'Identical', count: identicalKeys.size, icon: Equal, activeClassName: ISSUE_STYLE_BLUE });
        return cats;
    }, [duplicateCount, newCount, modifiedKeys.size, identicalKeys.size]);

    // Issue row keys mapping for the unified IssueFilter
    const issueRowKeys = useMemo(() => {
        const map: Record<string, Set<string>> = {};
        if (duplicateCount > 0) {
            map.duplicates = duplicateKeys;
        }

        const newKeys = new Set<string>();
        const modKeys = new Set<string>();
        const idenKeys = new Set<string>();

        if (newCount > 0 || modifiedKeys.size > 0 || identicalKeys.size > 0) {
            for (const s of previewData) {
                const pk = getSchedulePrimaryKey(s);
                const sk = getScheduleKey(s);

                if (!existingKeys.has(pk)) newKeys.add(sk);
                else if (modifiedKeys.has(pk)) modKeys.add(sk);
                else if (identicalKeys.has(pk)) idenKeys.add(sk);
            }
        }

        if (newKeys.size > 0) map.new = newKeys;
        if (modKeys.size > 0) map.modified = modKeys;
        if (idenKeys.size > 0) map.identical = idenKeys;

        return map;
    }, [duplicateCount, duplicateKeys, previewData, existingKeys, modifiedKeys, identicalKeys, newCount]);

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
            setSelectedForImport([]);
            setNewCount(0);
            setExistingKeys(new Set());
            setModifiedKeys(new Set());
            setIdenticalKeys(new Set());
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
        setPreviewData([]);
        setErrorMap(new Map());
        setSelectedForImport([]);
        setNewCount(0);
        setExistingKeys(new Set());
        setModifiedKeys(new Set());
        setIdenticalKeys(new Set());

        try {
            // Fetch all rows from Excel
            const result = await fetchAndValidateFromExcel(msConfig, undefined);

            let filteredSchedules = result.schedules;
            let filteredErrorMap = result.errorMap;

            // Apply date range filter
            if (dateRange?.from) {
                const fromStr = dateRange.from.toISOString().split('T')[0]; // Using ISO string for consistent format
                const toStr = dateRange.to ? dateRange.to.toISOString().split('T')[0] : fromStr;

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

            // Compare against existing DB entries (full field comparison)
            const uniqueDates = [...new Set(filteredSchedules.map(s => s.date))];
            const dbMap = await scheduleEntriesService.getFullSchedulesByDates(uniqueDates);

            // Classify rows in a single pass
            const seenInFile = new Set<string>();
            const identical = new Set<string>();
            const modified = new Set<string>();
            const existing = new Set<string>();
            let newCountLocal = 0;
            const reasons = new Map<string, string>();

            for (const s of filteredSchedules) {
                const pk = getSchedulePrimaryKey(s);

                // Skip intra-file duplicates for DB comparison stats to avoid double-counting
                if (seenInFile.has(pk)) continue;
                seenInFile.add(pk);

                const dbRow = dbMap.get(pk);
                if (!dbRow) {
                    newCountLocal++;
                } else {
                    existing.add(pk);
                    const diffs = getFieldDiffs(s, dbRow);
                    if (diffs.length === 0) {
                        identical.add(pk);
                    } else {
                        modified.add(pk);
                        reasons.set(pk, `Modified: ${diffs.join(', ')}`);
                    }
                }
            }

            setPreviewData(filteredSchedules);
            setErrorMap(filteredErrorMap);
            setNewCount(newCountLocal);
            setExistingKeys(existing);
            setIdenticalKeys(identical);
            setModifiedKeys(modified);
            setModifiedReasons(reasons);
            setStep('preview');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error(message);
            setStep('filter');
        }
    };

    const handleImport = async () => {
        if (errorMap.size > 0 || selectedForImport.length === 0) return;

        const dataToImport = selectedForImport;

        setStep('importing');

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id || '';

            const { upsertedCount, duplicatesSkipped } = await executeImport(dataToImport, userId);

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

    const canImport = selectedForImport.length > 0 && errorMap.size === 0 && duplicateCount === 0;

    // Column visibility for preview
    const initialColumnVisibility = {
        shift: false,
        branch: false,
        end_time: false,
        code: false,
        minutes: false,
        units: false,
        subtype: false,
        description: false,
        department: false,
        feedback: false,
    };



    return (
        <Dialog open={open} onOpenChange={(val) => step !== 'importing' && onOpenChange(val)}>
            <DialogContent className={cn(
                "flex flex-col max-h-[85vh] gap-6",
                step === 'filter' ? 'max-w-md' : 'max-w-7xl!',
                step === 'preview' && 'max-w-7xl!'
            )}>
                <DialogHeader>
                    <DialogTitle>Sync from Excel</DialogTitle>
                    <DialogDescription>
                        {step === 'filter' && "Select the date range to import"}
                        {step === 'loading' && "Fetching data from Excel..."}
                        {step === 'preview' && "Review and select the rows to import"}
                        {step === 'importing' && "Importing schedules..."}
                    </DialogDescription>
                </DialogHeader>

                {/* Date Range Picker */}
                {step === 'filter' && (
                    <Calendar
                        mode="range"
                        defaultMonth={dateRange?.from}
                        selected={dateRange}
                        onSelect={setDateRange}
                        numberOfMonths={2}
                        className="[--cell-size:--spacing(7.5)]"
                    />
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
                            data={previewData}
                            getRowClassName={(row) => {
                                const key = getScheduleKey(row);
                                const pk = getSchedulePrimaryKey(row as Schedule);
                                // Errors and intra-file duplicates → red (highest priority)
                                if (allErrorKeys.has(key)) return ROW_STYLE_DUPLICATE; // Assuming ROW_STYLE_DUPLICATE is red or similar for errors/duplicates
                                // New (key not in DB) → green
                                if (!existingKeys.has(pk) && step === 'preview') return ROW_STYLE_NEW;
                                // Modified (key exists, values differ) → amber
                                if (modifiedKeys.has(pk)) return ROW_STYLE_MODIFIED;
                                // Identical (key exists, values match) → no highlight
                                if (identicalKeys.has(pk)) return undefined;
                                return undefined;
                            }}
                            getRowIssueTooltip={(row) => {
                                // 1. Specific validation errors (from Zod/schema)
                                const rowErrors = errorMap.get(getRowKey(row as Schedule));
                                if (rowErrors) return `Errores: ${rowErrors.join(', ')}`;
                                // 2. Intra-file duplicates
                                const key = getScheduleKey(row);
                                if (duplicateKeys.has(key)) return 'Duplicado: clave repetida en el archivo';
                                // 3. Modified vs DB
                                const pk = getSchedulePrimaryKey(row as Schedule);
                                if (modifiedKeys.has(pk)) return { type: 'mod', message: modifiedReasons.get(pk) || '' };
                                // 4. New record
                                if (!existingKeys.has(pk) && step === 'preview') return 'New: registro no existe en la base de datos';
                                return undefined;
                            }}
                            filterConfig={{
                                showStatus: false,
                                showBranch: false,
                                showTime: false,
                            }}
                            hideActions
                            hideUpload
                            hideOverlaps
                            initialPageSize={100}
                            initialColumnVisibility={initialColumnVisibility}
                            externalIssueCategories={externalIssueCategories}
                            issueRowKeys={issueRowKeys}
                            enableRowSelection={(row) => !errorMap.has(getRowKey(row as Schedule))}
                            hideBulkCopy
                            onSelectionChange={(rows) => setSelectedForImport(rows as Schedule[])}
                            onBulkDelete={(rows) => {
                                const toRemove = new Set(rows);
                                setPreviewData(prev => prev.filter(s => !toRemove.has(s)));
                                setSelectedForImport(prev => prev.filter(s => !toRemove.has(s)));
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
                                {step === 'loading' ? (
                                    <span className="text-muted-foreground">Processing...</span>
                                ) : (
                                    <>
                                        {(newCount > 0 || existingKeys.size > 0) ? (
                                            <>
                                                <span>New: <strong className="text-foreground font-medium">{newCount}</strong></span>
                                                <span className="text-border">|</span>
                                                <span>Modified: <strong className="text-foreground font-medium">{modifiedKeys.size}</strong></span>
                                                <span className="text-border">|</span>
                                                <span>Identical: <strong className="text-foreground font-medium">{identicalKeys.size}</strong></span>
                                            </>
                                        ) : (
                                            <span>Valid: <strong className="text-foreground font-medium">{validCount}</strong></span>
                                        )}
                                        {invalidCount > 0 && (
                                            <>
                                                <span className="text-border">|</span>
                                                <span>Invalid: <strong className="text-foreground font-medium">{invalidCount}</strong></span>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => setStep('filter')} disabled={step === 'loading'}>
                                    <ArrowLeft />
                                    Back
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button disabled={!canImport || step === 'loading'}>
                                            Import {selectedForImport.length > 0 && `(${selectedForImport.length})`}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="sm:max-w-100!">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirm import</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                You are about to import {selectedForImport.length} records to the database.
                                                {modifiedKeys.size > 0 ? ` This will overwrite existing records with the modifications.` : ""}
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleImport}>Confirm</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
