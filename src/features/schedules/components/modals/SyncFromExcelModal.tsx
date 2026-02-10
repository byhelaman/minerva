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
import { Loader2, ArrowLeft } from "lucide-react";
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

    const { msConfig } = useScheduleSyncStore();

    // Columns with delete handler
    const columns = useMemo(() => getDataSourceColumns(handleDeleteRow), []);

    // Convert errorMap keys to Set for ScheduleDataTable
    const errorRowKeys = useMemo(() => new Set(errorMap.keys()), [errorMap]);

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

    const canImport = previewData.length > 0 && errorMap.size === 0;

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
                            invalidCount > 0
                                ? `Fix ${invalidCount} errors before importing`
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
                    <div className="flex-1 pr-2 overflow-auto">
                        <ScheduleDataTable
                            columns={columns}
                            data={previewData}
                            errorRowKeys={errorRowKeys}
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
