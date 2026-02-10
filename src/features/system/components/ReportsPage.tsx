import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { ScheduleDataTable } from "@/features/schedules/components/table/ScheduleDataTable";
import { getDataSourceColumns } from "./data-source-columns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, CloudUpload, RefreshCcw, ChevronDown, CalendarIcon, AlertCircle, CloudDownload, Download } from "lucide-react";
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
import type { Schedule } from "@/features/schedules/types";
import { mergeSchedulesWithIncidences } from "@/features/schedules/utils/merge-utils";
import { ImportReportsModal } from "./modals/ImportReportsModal";
import { UploadModal } from "@/features/schedules/components/modals/UploadModal";
import { AddScheduleModal } from "@/features/schedules/components/modals/AddScheduleModal";
import { SyncFromExcelModal } from "@/features/schedules/components/modals/SyncFromExcelModal";
import { scheduleEntriesService } from "@/features/schedules/services/schedule-entries-service";
import { secureSaveFile } from "@/lib/secure-export";
import { utils, write } from "xlsx";
import { formatTimeTo12Hour } from "@/features/schedules/utils/time-utils";
import { useSettings } from "@/components/settings-provider";

import { type DateRange } from "react-day-picker";
import { ScheduleInfo } from "@/features/schedules/components/modals/ScheduleInfo";

export function ReportsPage() {
    // State — default to today
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(),
        to: new Date(),
    });
    const [calendarOpen, setCalendarOpen] = useState(false);

    // Filter state
    const [showOnlyIncidences, setShowOnlyIncidences] = useState(false);

    const [importModalOpen, setImportModalOpen] = useState(false);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [syncFromExcelModalOpen, setSyncFromExcelModalOpen] = useState(false);
    const [importedData, setImportedData] = useState<Schedule[]>([]);

    // Store state
    const {
        baseSchedules,
        incidences,
        isLoading: isStoreLoading,
        fetchSchedulesForRange
    } = useScheduleDataStore();

    // Local loading state for initial fetch or manual refresh
    const [isLocalLoading, setIsLocalLoading] = useState(false);
    const isLoading = isStoreLoading || isLocalLoading;

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Sync store
    const { syncToExcel, refreshMsConfig } = useScheduleSyncStore();
    const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);

    // Load MS config on mount
    useEffect(() => {
        refreshMsConfig();
    }, [refreshMsConfig]);

    // Format date to YYYY-MM-DD for Supabase queries

    // Compute table data from store state (Reactive & Optimistic)
    const tableData = useMemo(() => {
        const merged = mergeSchedulesWithIncidences(baseSchedules, incidences);
        if (showOnlyIncidences) {
            return merged.filter(row => !!row.type);
        }
        return merged;
    }, [baseSchedules, incidences, showOnlyIncidences]);

    // Fetch data when date range changes
    const fetchData = useCallback(async () => {
        if (!dateRange?.from) return;

        setIsLocalLoading(true);
        try {
            const fromStr = format(dateRange.from, "yyyy-MM-dd");
            const toStr = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : fromStr;

            await fetchSchedulesForRange(fromStr, toStr);
        } catch (error) {
            console.error("Failed to fetch report data:", error);
            toast.error("Failed to load report data");
        } finally {
            setIsLocalLoading(false);
        }
    }, [dateRange, fetchSchedulesForRange]);

    // Initial fetch on date change
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // State for delete confirmation
    const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null);

    const columns = getDataSourceColumns(
        (schedule) => setScheduleToDelete(schedule),
        true // Enable HTML Copy
    );

    // Handle sync (Single date only)
    const handleSync = async () => {
        if (!dateRange?.from) return;
        const dateString = format(dateRange.from, "yyyy-MM-dd");
        await syncToExcel(dateString);
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

    const hasData = tableData.length > 0;
    const hasSchedules = hasData;
    const { settings } = useSettings();

    const onExportExcel = async () => {
        try {
            // Helper to prevent CSV Injection
            const sanitize = (val: unknown): unknown => {
                if (typeof val === 'string' && /^[=+\-@]/.test(val)) {
                    return `'${val}`;
                }
                return val;
            };

            const dataToExport = tableData.map((item) => {
                return {
                    ...item,
                    instructor: sanitize(item.instructor) as string,
                    program: sanitize(item.program) as string,
                    branch: sanitize(item.branch) as string,
                    start_time: formatTimeTo12Hour(item.start_time),
                    end_time: formatTimeTo12Hour(item.end_time),
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
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
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
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={2}
                                className="[--cell-size:--spacing(7.5)]"
                            />
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
                            hideFilters={true}
                            hideUpload={true}
                            hideOverlaps={true}
                            hideDefaultActions={true}
                            customFilterItems={
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowOnlyIncidences(!showOnlyIncidences)}
                                    className={cn(
                                        "border-dashed",
                                        showOnlyIncidences &&
                                        "border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 hover:text-amber-600 hover:border-amber-500/50 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 dark:hover:text-amber-400"
                                    )}
                                >
                                    <AlertCircle />
                                    Incidences
                                </Button>
                            }
                            customActionItems={
                                <>
                                    <RequirePermission permission="reports.manage">
                                        <DropdownMenuItem onClick={() => setUploadModalOpen(true)}>
                                            <CloudUpload />
                                            Import Data
                                        </DropdownMenuItem>
                                    </RequirePermission>
                                    <DropdownMenuItem onClick={onExportExcel} disabled={!hasSchedules}>
                                        <Download />
                                        Export Data
                                    </DropdownMenuItem>
                                    <RequirePermission permission="reports.manage">
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => setConfirmSyncOpen(true)}>
                                            <CloudUpload />
                                            Push to Excel
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setSyncFromExcelModalOpen(true)}>
                                            <CloudDownload />
                                            Pull from Excel
                                        </DropdownMenuItem>
                                        {/* <DropdownMenuSub>
                                            <DropdownMenuSubTrigger>
                                                <Cloud />
                                                OneDrive
                                            </DropdownMenuSubTrigger>
                                            <DropdownMenuSubContent>
                                                <DropdownMenuItem
                                                    disabled={!canSync}
                                                    onClick={() => setConfirmSyncOpen(true)}
                                                >
                                                    <CloudUpload />
                                                    <span>Push to Excel</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    disabled={!msConfig?.isConnected}
                                                    onClick={() => setSyncFromExcelModalOpen(true)}
                                                >
                                                    <CloudDownload />
                                                    <span>Pull from Excel</span>
                                                </DropdownMenuItem>
                                            </DropdownMenuSubContent>
                                        </DropdownMenuSub> */}
                                        <DropdownMenuSeparator />
                                    </RequirePermission>

                                    <RequirePermission permission="reports.manage">
                                        <DropdownMenuItem onClick={() => fetchData()} disabled={isLoading}>
                                            <RefreshCcw className={cn(isLoading && "animate-spin")} />
                                            Refresh Table
                                        </DropdownMenuItem>
                                    </RequirePermission>
                                </>
                            }
                            initialColumnVisibility={{
                                shift: false,
                                end_time: false,
                                code: false,
                                minutes: false,
                                units: false,
                                substitute: false,
                                subtype: false,
                                description: false,
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

            {/* Delete Schedule Confirmation */}
            <AlertDialog open={!!scheduleToDelete} onOpenChange={(open) => !open && setScheduleToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Schedule Entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this class? This action cannot be undone.
                        </AlertDialogDescription>
                        {scheduleToDelete && (
                            <ScheduleInfo schedule={scheduleToDelete} />
                        )}
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive"
                            onClick={async () => {
                                if (scheduleToDelete) {
                                    await useScheduleDataStore.getState().deleteSchedule(scheduleToDelete);
                                    setScheduleToDelete(null);
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
