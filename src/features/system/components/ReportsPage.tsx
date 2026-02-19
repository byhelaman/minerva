import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import { ScheduleDataTable } from "@/features/schedules/components/table/ScheduleDataTable";
import { getDataSourceColumns } from "./data-source-columns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, CloudUpload, ChevronDown, CalendarIcon, AlertCircle, FileInput, FileOutput } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/components/auth-provider";

import { useScheduleSyncStore } from "@/features/schedules/stores/useScheduleSyncStore";
import { useScheduleDataStore } from "@/features/schedules/stores/useScheduleDataStore";
import type { Schedule, DailyIncidence } from "@/features/schedules/types";
import { mergeSchedulesWithIncidences } from "@/features/schedules/utils/merge-utils";
import { ImportReportsModal } from "./modals/ImportReportsModal";
import { UploadModal } from "@/features/schedules/components/modals/UploadModal";
import { AddScheduleModal } from "@/features/schedules/components/modals/AddScheduleModal";
import { SyncFromExcelModal } from "@/features/schedules/components/modals/SyncFromExcelModal";
import { scheduleEntriesService } from "@/features/schedules/services/schedule-entries-service";
import { secureSaveFile } from "@/lib/secure-export";
import { utils, write } from "xlsx";
import { useSettings } from "@/components/settings-provider";

import { type DateRange } from "react-day-picker";
import { ScheduleInfo } from "@/features/schedules/components/modals/ScheduleInfo";

// Module-level cache: persists across mount/unmount (page navigation)
let reportCache: {
    key: string; // "from|to"
    schedules: Schedule[];
    incidences: DailyIncidence[];
    dateRange: DateRange;
} | null = null;

function getDateRangeKey(range: DateRange | undefined): string {
    if (!range?.from) return "";
    const from = format(range.from, "yyyy-MM-dd");
    const to = range.to ? format(range.to, "yyyy-MM-dd") : from;
    return `${from}|${to}`;
}

export function ReportsPage() {
    // State — restore last date range or default to today
    const defaultDateRange: DateRange = { from: new Date(), to: new Date() };
    const initialDateRange = reportCache?.dateRange ?? defaultDateRange;
    const initialKey = getDateRangeKey(initialDateRange);
    const hasCachedData = reportCache?.key === initialKey;

    const [dateRange, setDateRange] = useState<DateRange | undefined>(initialDateRange);
    const [pendingRange, setPendingRange] = useState<DateRange | undefined>(initialDateRange);
    const [calendarOpen, setCalendarOpen] = useState(false);

    // Filter state
    const [showOnlyIncidences, setShowOnlyIncidences] = useState(false);

    const [importModalOpen, setImportModalOpen] = useState(false);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [syncFromExcelModalOpen, setSyncFromExcelModalOpen] = useState(false);
    const [importedData, setImportedData] = useState<Schedule[]>([]);

    // Local state for report data (isolated from Management's draft store)
    // Initialize from cache if available for the current date range
    const [reportSchedules, setReportSchedules] = useState<Schedule[]>(
        hasCachedData ? reportCache!.schedules : []
    );
    const [reportIncidences, setReportIncidences] = useState<DailyIncidence[]>(
        hasCachedData ? reportCache!.incidences : []
    );

    const [isLoading, setIsLoading] = useState(false);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Sync store
    const { syncToExcel, refreshMsConfig } = useScheduleSyncStore();
    const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);

    // Subscribe to incidence changes from the shared store
    // This ensures Reports refreshes when incidences are saved via modal
    const incidencesVersion = useScheduleDataStore(s => s.incidencesVersion);

    // Load MS config on mount
    useEffect(() => {
        refreshMsConfig();
    }, [refreshMsConfig]);

    // Re-fetch when incidences change in the shared store (effect defined below after fetchData)

    // Format date to YYYY-MM-DD for Supabase queries

    // Optimistic delete — keys of rows currently being deleted
    const [pendingDeleteKeys, setPendingDeleteKeys] = useState<Set<string>>(new Set());

    // Compute table data from local state (exclude pending deletes)
    const tableData = useMemo(() => {
        const merged = mergeSchedulesWithIncidences(reportSchedules, reportIncidences);
        const filtered = showOnlyIncidences ? merged.filter(row => !!row.type) : merged;
        if (pendingDeleteKeys.size === 0) return filtered;
        return filtered.filter(row => !pendingDeleteKeys.has(`${row.date}|${row.program}|${row.start_time}|${row.instructor}`));
    }, [reportSchedules, reportIncidences, showOnlyIncidences, pendingDeleteKeys]);

    // Fetch data when date range changes (into local state, not shared store)
    const fetchData = useCallback(async () => {
        if (!dateRange?.from) return;

        const fromStr = format(dateRange.from, "yyyy-MM-dd");
        const toStr = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : fromStr;
        const key = `${fromStr}|${toStr}`;

        // Only show loading if no cached data for this range
        const hasCached = reportCache?.key === key;
        if (!hasCached) {
            setIsLoading(true);
        }

        try {
            const { schedules, incidences } = await scheduleEntriesService.getSchedulesByDateRange(fromStr, toStr);
            setReportSchedules(schedules);
            setReportIncidences(incidences);

            // Update module-level cache
            reportCache = { key, schedules, incidences, dateRange };
        } catch (error) {
            console.error("Failed to fetch report data:", error);
            toast.error("Failed to load report data");
        } finally {
            setIsLoading(false);
        }
    }, [dateRange]);

    // Initial fetch on date change
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Keep a stable ref to the latest fetchData to avoid stale closure in the incidences effect
    const fetchDataRef = useRef(fetchData);
    useEffect(() => { fetchDataRef.current = fetchData; });

    // Re-fetch when incidences change in the shared store
    useEffect(() => {
        if (incidencesVersion > 0) {
            fetchDataRef.current();
        }
    }, [incidencesVersion]);

    const handleDateSelect = (range: DateRange | undefined) => {
        setPendingRange(range);
    };

    const handleApplyDateRange = () => {
        setDateRange(pendingRange);
        setCalendarOpen(false);
    };

    // State for delete confirmation (supports single + bulk)
    const [schedulesToDelete, setSchedulesToDelete] = useState<Schedule[]>([]);

    const columns = getDataSourceColumns(
        (schedule) => setSchedulesToDelete([schedule]),
    );

    // Handle sync
    const handleSync = async () => {
        if (!dateRange?.from) return;
        const dateString = format(dateRange.from, "yyyy-MM-dd");
        const endDateString = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;
        await syncToExcel(dateString, endDateString);
    };

    const { user } = useAuth();

    const handleAddSchedule = async (newSchedule: Schedule) => {
        try {
            await scheduleEntriesService.addScheduleEntry(newSchedule, user?.id || "");
            toast.success("Schedule added");
            // Refresh data
            fetchData();
        } catch (error) {
            console.error("Failed to add schedule:", error);
            toast.error("Failed to add schedule");
        }
    };

    const { settings } = useSettings();

    // Custom export: receives data already filtered by getActionData() (respects actionsRespectFilters)
    const handleExportData = async (data: Schedule[]) => {
        try {
            // Helper to prevent CSV Injection
            const sanitize = (val: unknown): unknown => {
                if (typeof val === 'string' && /^[=+\-@]/.test(val)) {
                    return `'${val}`;
                }
                return val;
            };

            const dataToExport = data.map((item) => {
                return {
                    ...item,
                    instructor: sanitize(item.instructor) as string,
                    program: sanitize(item.program) as string,
                    branch: sanitize(item.branch) as string,
                    start_time: item.start_time, // Keep 24h format for re-import compatibility
                    end_time: item.end_time,     // Keep 24h format
                };
            });

            const ws = utils.json_to_sheet(dataToExport, {
                header: [
                    "date", "shift", "branch", "start_time", "end_time", "code",
                    "instructor", "program", "minutes", "units", "status", "substitute", "type", "subtype", "description", "department", "feedback"
                ]
            });

            const wb = utils.book_new();
            utils.book_append_sheet(wb, ws, "Schedule");

            const now = new Date();
            const dateStr = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
            const defaultName = `schedule-report-${dateStr}.xlsx`;

            const excelBuffer = write(wb, { bookType: "xlsx", type: "array" });

            const saved = await secureSaveFile({
                title: "Save Report",
                defaultName: defaultName,
                content: new Uint8Array(excelBuffer),
                openAfterExport: settings.openAfterExport
            });

            if (saved) {
                toast.success("Report exported to Excel successfully");
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to export Excel");
        }
    };

    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Header */}
            <div className="flex flex-row items-center justify-between py-8 my-4 gap-4 flex-none">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-bold tracking-tight">Reports</h1>
                    <p className="text-muted-foreground text-sm">View and edit daily reports</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Date Picker Range */}
                    <Popover open={calendarOpen} onOpenChange={(open) => {
                        setCalendarOpen(open);
                        if (open) setPendingRange(dateRange);
                    }}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                    "justify-start text-left font-normal gap-2",
                                    !dateRange && "text-muted-foreground",
                                )}
                            >
                                <CalendarIcon className="opacity-50" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                            {format(dateRange.from, "PP")} -{" "}
                                            {format(dateRange.to, "PP")}
                                        </>
                                    ) : (
                                        format(dateRange.from, "PP")
                                    )
                                ) : (
                                    <span>Pick a date</span>
                                )}
                                <ChevronDown className="opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="range"
                                defaultMonth={pendingRange?.from}
                                selected={pendingRange}
                                onSelect={handleDateSelect}
                                numberOfMonths={2}
                                className="[--cell-size:--spacing(7.5)]"
                            />
                            <div className="flex justify-end border-t p-3 gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setCalendarOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={!pendingRange?.from}
                                    onClick={handleApplyDateRange}
                                >
                                    Apply
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>



                    {/* Import Schedules (UI Only) */}
                    {/* Moved to Table Actions */}

                    {/* Sync to Excel */}
                    <AlertDialog open={confirmSyncOpen} onOpenChange={setConfirmSyncOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Sync to Excel?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will push schedules for{" "}
                                    <span className="font-semibold text-foreground">
                                        {dateRange?.from ? format(dateRange.from, "PP") : "—"}
                                        {dateRange?.to && dateRange.to.getTime() !== dateRange.from?.getTime()
                                            ? ` - ${format(dateRange.to, "PP")}`
                                            : ""}
                                    </span>{" "}
                                    to the Excel file. Existing data for {dateRange?.to && dateRange.to.getTime() !== dateRange.from?.getTime() ? "these dates" : "this date"} will be overwritten.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => {
                                    handleSync();
                                    setConfirmSyncOpen(false);
                                }}>
                                    Confirm Sync
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center gap-2 h-full border border-dashed rounded-lg bg-muted/10 p-8 min-h-100">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <div className="text-center space-y-2">
                            <p className="text-sm font-medium">Loading report data...</p>
                            <p className="text-xs text-muted-foreground">
                                Fetching schedules...
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col min-h-0">
                        <ScheduleDataTable
                            columns={columns}
                            data={tableData}
                            onRefresh={() => {
                                reportCache = null;
                                fetchData();
                            }}
                            disableRefresh={isLoading}
                            hideFilters={true}
                            hideUpload={true}
                            hideOverlaps={true}
                            hideDefaultActions={true}
                            customExportFn={handleExportData as (data: unknown[]) => Promise<void>}
                            onBulkDelete={(rows) => setSchedulesToDelete(rows as Schedule[])}
                            customFilterItems={
                                reportIncidences.length > 0 ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowOnlyIncidences(!showOnlyIncidences)}
                                        className="border-dashed
                                            border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 hover:text-amber-600 hover:border-amber-500/50 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 dark:hover:text-amber-400"
                                    >
                                        <AlertCircle />
                                        Incidences
                                        {showOnlyIncidences && ` (${reportIncidences.length})`}
                                    </Button>
                                ) : undefined
                            }
                            customActionItems={
                                <>
                                    <RequirePermission permission="reports.manage">
                                        <DropdownMenuItem onClick={() => setUploadModalOpen(true)}>
                                            <CloudUpload />
                                            Import Data
                                        </DropdownMenuItem>
                                    </RequirePermission>
                                    <RequirePermission permission="reports.manage">
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => setConfirmSyncOpen(true)}>
                                            <FileInput />
                                            Push to Excel
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setSyncFromExcelModalOpen(true)}>
                                            <FileOutput />
                                            Pull from Excel
                                        </DropdownMenuItem>
                                    </RequirePermission>


                                </>
                            }
                            initialColumnVisibility={{
                                shift: false,
                                branch: false,
                                end_time: false,
                                code: false,
                                minutes: false,
                                units: false,
                                subtype: false,
                                department: false,
                                feedback: false,
                            }}
                            initialPageSize={100}
                            filterConfig={{
                                showStatus: false,
                                showIncidenceType: true,
                            }}
                            onAddRow={() => setIsAddModalOpen(true)}
                        />
                    </div>
                )}
            </div>

            {/* Upload Modal (Reusable) */}
            <UploadModal
                open={uploadModalOpen}
                onOpenChange={setUploadModalOpen}
                onUploadComplete={(schedules) => {
                    setImportedData(schedules);
                    setUploadModalOpen(false);
                    setImportModalOpen(true);
                }}
                strictValidation
            />

            {/* Import Data Preview Modal */}
            <ImportReportsModal
                open={importModalOpen}
                onOpenChange={setImportModalOpen}
                data={importedData}
                onConfirm={fetchData}
            />

            {/* Delete Schedule Confirmation (single + bulk) */}
            <AlertDialog open={schedulesToDelete.length > 0} onOpenChange={(open) => !open && setSchedulesToDelete([])}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {schedulesToDelete.length === 1 ? "Delete Schedule Entry?" : `Delete ${schedulesToDelete.length} entries?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {schedulesToDelete.length === 1
                                ? "Are you sure you want to delete this class? This action cannot be undone."
                                : `Are you sure you want to delete ${schedulesToDelete.length} entries? This action cannot be undone.`
                            }
                        </AlertDialogDescription>
                        {schedulesToDelete.length === 1 && schedulesToDelete[0] && (
                            <ScheduleInfo schedule={schedulesToDelete[0]} />
                        )}
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive"
                            onClick={async () => {
                                // Optimistic: hide rows immediately
                                const keys = new Set(schedulesToDelete.map(s => `${s.date}|${s.program}|${s.start_time}|${s.instructor}`));
                                const entriesToDelete = [...schedulesToDelete];
                                setPendingDeleteKeys(keys);
                                setSchedulesToDelete([]); // Close dialog

                                try {
                                    if (entriesToDelete.length === 1) {
                                        await scheduleEntriesService.deleteScheduleEntry(entriesToDelete[0]);
                                    } else {
                                        await scheduleEntriesService.batchDeleteScheduleEntries(entriesToDelete);
                                    }
                                    toast.success(`${entriesToDelete.length} ${entriesToDelete.length === 1 ? "entry" : "entries"} deleted`);
                                    fetchData();
                                } catch (error) {
                                    console.error("Failed to delete:", error);
                                    toast.error("Failed to delete entries");
                                } finally {
                                    setPendingDeleteKeys(new Set());
                                }
                            }}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Add Schedule Modal */}
            <AddScheduleModal
                open={isAddModalOpen}
                onOpenChange={setIsAddModalOpen}
                onSubmit={handleAddSchedule}
                allowAnyDate={true}
            />

            {/* Sync from Excel Modal */}
            <SyncFromExcelModal
                open={syncFromExcelModalOpen}
                onOpenChange={setSyncFromExcelModalOpen}
                onImportComplete={fetchData}
            />
        </div>
    );
}
