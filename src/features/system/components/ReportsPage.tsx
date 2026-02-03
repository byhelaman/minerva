import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ScheduleDataTable } from "@/features/schedules/components/table/ScheduleDataTable";
import { getDataSourceColumns } from "./data-source-columns";
import { type ColumnDef } from "@tanstack/react-table";
import { IncidenceModal } from "@/features/schedules/components/modals/IncidenceModal";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Upload, CloudUpload } from "lucide-react";
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
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { scheduleEntriesService } from "@/features/schedules/services/schedule-entries-service";
import { useScheduleSyncStore } from "@/features/schedules/stores/useScheduleSyncStore";
import { useScheduleDataStore } from "@/features/schedules/stores/useScheduleDataStore";
import type { Schedule, DailyIncidence } from "@/features/schedules/types";
import { mergeSchedulesWithIncidences } from "@/features/schedules/utils/merge-utils";
import { ImportReportsModal } from "./modals/ImportReportsModal";
import { UploadModal } from "@/features/schedules/components/modals/UploadModal";

export function ReportsPage() {
    // Date state — default to today
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [importedData, setImportedData] = useState<Schedule[]>([]);

    // Data state
    const [tableData, setTableData] = useState<(Schedule | DailyIncidence)[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Incidence modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

    // Sync store
    const { isSyncing, syncToExcel, msConfig, refreshMsConfig } = useScheduleSyncStore();

    // Keep data store in sync for IncidenceModal
    const { setBaseSchedules } = useScheduleDataStore();

    // Load MS config on mount
    useEffect(() => {
        refreshMsConfig();
    }, [refreshMsConfig]);

    // Format date to YYYY-MM-DD for Supabase queries
    const dateString = format(selectedDate, "yyyy-MM-dd");

    // Fetch data when date changes
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const { schedules, incidences: inc } = await scheduleEntriesService.getSchedulesByDate(dateString);

            // Merge incidences on top of base schedules for display
            const merged = mergeSchedulesWithIncidences(schedules, inc);

            setTableData(merged);

            // Keep data store in sync so IncidenceModal can read existing incidences
            setBaseSchedules(schedules);
            useScheduleDataStore.setState({ incidences: inc });
        } catch (error) {
            console.error("Failed to fetch report data:", error);
            toast.error("Failed to load report data");
            setTableData([]);
        } finally {
            setIsLoading(false);
        }
    }, [dateString, setBaseSchedules]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Refetch after incidence changes (when modal closes and incidences mutate)
    const incidencesVersion = useScheduleDataStore(s => s.incidencesVersion);
    useEffect(() => {
        // Skip initial render (version 0) — only refetch when incidences actually change after mount
        if (incidencesVersion > 0) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [incidencesVersion]);

    // Build columns with row click handler
    const columns: ColumnDef<Schedule | DailyIncidence>[] = getDataSourceColumns(() => {
        // onDelete not needed here — we pass undefined
    }).map(col => {
        // Skip select and actions columns — they don't need click handlers
        if (col.id === "select" || col.id === "actions") return col;

        // Wrap cell renderer to add click-to-edit
        const originalCell = col.cell;
        return {
            ...col,
            cell: (props: any) => {
                const rendered = typeof originalCell === 'function' ? originalCell(props) : null;
                return (
                    <div
                        className="cursor-pointer"
                        onClick={() => {
                            setSelectedSchedule(props.row.original);
                            setModalOpen(true);
                        }}
                    >
                        {rendered}
                    </div>
                );
            }
        };
    });

    // Handle date selection
    const handleDateSelect = (date: Date | undefined) => {
        if (date) {
            setSelectedDate(date);
            setCalendarOpen(false);
        }
    };

    // Handle sync
    const handleSync = async () => {
        await syncToExcel(dateString);
    };

    const hasData = tableData.length > 0;
    const canSync = msConfig.isConnected && msConfig.schedulesFolderId;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex flex-row items-center justify-between py-8 my-4 gap-4 flex-none">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-bold tracking-tight">Reports</h1>
                    <p className="text-muted-foreground">View and edit daily reports</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Date Picker */}
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                    "justify-start text-left font-normal",
                                    !selectedDate && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon />
                                {format(selectedDate, "PPP")}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={handleDateSelect}
                                className="[--cell-size:--spacing(7)]"
                            />
                        </PopoverContent>
                    </Popover>



                    {/* Import Schedules (UI Only) */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUploadModalOpen(true)}
                    >
                        <CloudUpload />
                        Upload Data
                    </Button>

                    {/* Sync to Excel */}
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                disabled={isSyncing || !canSync || !hasData}
                                size="sm"
                            >
                                {isSyncing && (
                                    <Loader2 className="animate-spin" />
                                )}
                                <Upload />
                                {isSyncing ? "Syncing..." : "Sync to Excel"}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Sync to Excel?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action will overwrite any existing data for this date in the Excel file.
                                    Are you sure you want to proceed?
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleSync}>
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
                    <div className="flex flex-col items-center justify-center gap-2 h-full border border-dashed rounded-lg bg-muted/10 p-8 min-h-[400px]">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <div className="text-center space-y-2">
                            <p className="text-sm font-medium">Loading report data...</p>
                            <p className="text-xs text-muted-foreground">
                                Fetching schedules for {format(selectedDate, "PPP")}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto">
                        <ScheduleDataTable
                            columns={columns}
                            data={tableData}
                            hideFilters={true}
                            hideUpload={true}
                            hideActions={true}
                            hideOverlaps={true}
                            initialColumnVisibility={{
                                shift: false,
                                end_time: false,
                                code: false,
                                minutes: false,
                                units: false,
                                substitute: false,
                                description: false,
                                department: false,
                                feedback: false,
                            }}
                            initialPageSize={100}
                            onRefresh={fetchData}
                            disableRefresh={isLoading}
                        />
                    </div>
                )}
            </div>

            {/* Incidence Modal */}
            <IncidenceModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                schedule={selectedSchedule}
            />

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
        </div>
    );
}
