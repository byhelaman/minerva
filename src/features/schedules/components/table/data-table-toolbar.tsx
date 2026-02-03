import { useMemo, useState } from "react";
import { secureSaveFile } from "@/lib/secure-export";
import { type Table } from "@tanstack/react-table";
import { Search, X, ChevronDown, User, CalendarCheck, Download, Save, Trash2, XCircle, RefreshCw, HelpCircle, Hand, Clock1, Clock2, Clock3, Clock4, Clock5, Clock6, Clock7, Clock8, Clock9, Clock10, Clock11, Clock12, Radio, Loader2, AlertTriangle, CloudUpload, CloudDownload, MonitorCog, Info, Wrench, BadgeCheck } from "lucide-react";
import { utils, write } from "xlsx";
import { toast } from "sonner";
import { writeTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useScheduleSyncStore } from "@/features/schedules/stores/useScheduleSyncStore";
import { useScheduleUIStore } from "@/features/schedules/stores/useScheduleUIStore";
import { formatDateForDisplay } from "@/lib/utils";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DataTableViewOptions } from "./data-table-view-options";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";
import { cn } from "@/lib/utils";
import { formatTimeTo12Hour } from "@schedules/utils/time-utils";
import { Schedule } from "@schedules/utils/excel-parser";
import { useSettings } from "@/components/settings-provider";
import { RequirePermission } from "@/components/RequirePermission";

// Opciones de filtro para campos de Schedule


const branchOptions = [
    { label: "CORPORATE", value: "CORPORATE" },
    { label: "HUB", value: "HUB" },
    { label: "LA MOLINA", value: "LA MOLINA" },
    { label: "KIDS", value: "KIDS" },
];

const defaultStatusOptions = [
    { label: "Assigned", value: "assigned", icon: BadgeCheck },
    { label: "To Update", value: "to_update", icon: RefreshCw },
    { label: "Not Found", value: "not_found", icon: XCircle },
    { label: "Ambiguous", value: "ambiguous", icon: HelpCircle },
    { label: "Manual", value: "manual", icon: Hand },
];

// Incidence type options
const incidenceTypeOptions = [
    { label: "Instructor", value: "Instructor", icon: User },
    { label: "Novedad", value: "Novedad", icon: Info },
    { label: "Programación", value: "Programación", icon: CalendarCheck },
    { label: "Servicios", value: "Servicios", icon: Wrench },
    { label: "Sistema", value: "Sistema", icon: MonitorCog },
];

// Mapeo de hora a icono de reloj (usa hora en formato 12h)
const getClockIcon = (hour: string) => {
    const h = parseInt(hour, 10);
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const icons = { 1: Clock1, 2: Clock2, 3: Clock3, 4: Clock4, 5: Clock5, 6: Clock6, 7: Clock7, 8: Clock8, 9: Clock9, 10: Clock10, 11: Clock11, 12: Clock12 };
    return icons[hour12 as keyof typeof icons] || Clock12;
};

// Opciones por defecto cuando no hay datos cargados
const defaultTimeOptions = [
    { label: "07:00", value: "07", icon: Clock7 },
    { label: "08:00", value: "08", icon: Clock8 },
    { label: "09:00", value: "09", icon: Clock9 },
    { label: "10:00", value: "10", icon: Clock10 },
    { label: "11:00", value: "11", icon: Clock11 },
    { label: "12:00", value: "12", icon: Clock12 },
    { label: "13:00", value: "13", icon: Clock1 },
    { label: "14:00", value: "14", icon: Clock2 },
    { label: "15:00", value: "15", icon: Clock3 },
    { label: "16:00", value: "16", icon: Clock4 },
    { label: "17:00", value: "17", icon: Clock5 },
    { label: "18:00", value: "18", icon: Clock6 },
    { label: "19:00", value: "19", icon: Clock7 },
    { label: "20:00", value: "20", icon: Clock8 },
    { label: "21:00", value: "21", icon: Clock9 },
];

interface DataTableToolbarProps<TData> {
    table: Table<TData>;
    showOverlapsOnly: boolean;
    setShowOverlapsOnly: (show: boolean) => void;
    overlapCount: number;
    onClearSchedule?: () => void;
    onUploadClick?: () => void;
    onRefresh?: () => void;
    fullData: TData[];
    hideFilters?: boolean;
    hideUpload?: boolean;
    hideActions?: boolean;
    disableRefresh?: boolean;
    statusOptions?: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }[];
    showLiveMode?: boolean;
    setShowLiveMode?: (show: boolean) => void;
    isLiveLoading?: boolean;
    activeMeetingsCount?: number;
    onPublish?: () => void;
    isPublishing?: boolean;
    canPublish?: boolean;
    showTypeFilter?: boolean;
    hideStatusFilter?: boolean;
    customActionItems?: React.ReactNode;
    hideDefaultActions?: boolean;
}

export function DataTableToolbar<TData>({
    table,
    showOverlapsOnly,
    setShowOverlapsOnly,
    overlapCount,
    onClearSchedule,
    onUploadClick,
    onRefresh,
    fullData,
    hideFilters = false,
    hideUpload = false,
    hideActions = false,
    disableRefresh = false,
    statusOptions = defaultStatusOptions,
    showLiveMode = false,
    setShowLiveMode,
    isLiveLoading = false,
    activeMeetingsCount = 0,
    onPublish,
    isPublishing = false,
    canPublish = false,
    showTypeFilter = false,
    hideStatusFilter = false,
    customActionItems,
    hideDefaultActions = false,
}: DataTableToolbarProps<TData>) {
    const isFiltered =
        table.getState().columnFilters.length > 0 ||
        !!table.getState().globalFilter ||
        showOverlapsOnly;

    // Generar opciones de hora dinámicamente desde fullData (no table, cuya ref no cambia)
    const timeOptions = useMemo(() => {
        const data = fullData as Schedule[];
        if (!data || data.length === 0) return defaultTimeOptions;

        const hoursSet = new Set<string>();
        data.forEach((item) => {
            const timeStr = String(item.start_time);
            const hour = timeStr.substring(0, 2);
            if (/^\d{2}$/.test(hour)) {
                hoursSet.add(hour);
            }
        });

        if (hoursSet.size === 0) return defaultTimeOptions;

        return Array.from(hoursSet)
            .sort()
            .map((hour) => ({
                label: `${hour}:00`,
                value: hour,
                icon: getClockIcon(hour),
            }));
    }, [fullData]);

    // Determine if we should show incidence type filter based on data
    // If data contains incidence types (Instructor, Novedad, etc.), show type filter options
    const hasIncidenceData = useMemo(() => {
        const data = fullData as (Schedule & { type?: string })[];
        if (!data || data.length === 0) return false;

        // Check if any row has a type value (incidence data)
        return data.some((item) => item.type);
    }, [fullData]);

    // Resolve status options - use default assignment options unless custom provided
    const resolvedStatusOptions = useMemo(() => {
        if (statusOptions !== defaultStatusOptions) {
            return statusOptions;
        }
        return statusOptions;
    }, [statusOptions]);

    const hasSchedules = table.getFilteredRowModel().rows.length > 0;
    const isTableEmpty = !fullData || fullData.length === 0;

    // State for Clear Schedule confirmation dialog
    const [showClearDialog, setShowClearDialog] = useState(false);

    // Settings: Actions Respect Filters
    const { settings } = useSettings();
    const { getLatestCloudVersion, loadPublishedSchedule } = useScheduleSyncStore();
    const { activeDate } = useScheduleUIStore();

    // State for Restore Confirmation
    const [showRestoreDialog, setShowRestoreDialog] = useState(false);
    const [pendingRestoreData, setPendingRestoreData] = useState<any>(null); // PublishedSchedule
    const [isCheckingCloud, setIsCheckingCloud] = useState(false);

    const handleCheckCloud = async () => {
        // activeDate might be null if table is empty.
        // We now support searching the latest global version.

        setIsCheckingCloud(true);
        const toastId = toast.loading("Checking cloud version...");

        try {
            const { exists, data, error } = await getLatestCloudVersion(activeDate);

            if (error) {
                toast.error("Error checking cloud: " + error, { id: toastId });
                return;
            }

            if (!exists || !data) {
                toast.error("No published version found", { id: toastId });
                return;
            }

            toast.dismiss(toastId);
            setPendingRestoreData(data);
            setShowRestoreDialog(true);

        } catch (e) {
            console.error(e);
            toast.error("Failed to check cloud", { id: toastId });
        } finally {
            setIsCheckingCloud(false);
        }
    };

    const handleConfirmRestore = () => {
        if (pendingRestoreData) {
            loadPublishedSchedule(pendingRestoreData);
            setShowRestoreDialog(false);
        }
    };

    // Helper to get the correct data source based on settings
    const getActionData = (): Schedule[] => {
        if (settings.actionsRespectFilters) {
            // Use filtered/visible rows (fresh computation, not memoized)
            return table.getFilteredRowModel().rows.map((row) => row.original) as Schedule[];
        }
        return fullData as Schedule[];
    };

    const handleCopyInstructors = async () => {
        try {
            const data = getActionData();
            const instructors = Array.from(new Set(data.map((item) => item.instructor))).join("\n");
            await navigator.clipboard.writeText(instructors);
            toast.success("Instructors copied to clipboard");
        } catch (error) {
            console.error(error);
            toast.error("Failed to copy instructors");
        }
    };

    const handleCopySchedule = async () => {
        try {
            const data = getActionData();
            const content = data.map((item) => {
                return [
                    item.date,
                    item.shift,
                    item.branch,
                    formatTimeTo12Hour(item.start_time),
                    formatTimeTo12Hour(item.end_time),
                    item.code,
                    item.instructor,
                    item.program,
                    item.minutes,
                    item.units
                ].join("\t");

            }).join("\n");

            await navigator.clipboard.writeText(content);
            toast.success("Schedule copied to clipboard (12h format)");
        } catch (error) {
            console.error(error);
            toast.error("Failed to copy schedule");
        }
    };

    const onExportExcel = async () => {
        try {
            const data = getActionData();

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
                    start_time: formatTimeTo12Hour(item.start_time),
                    end_time: formatTimeTo12Hour(item.end_time),
                };
            });

            const ws = utils.json_to_sheet(dataToExport, {
                header: [
                    "date", "shift", "branch", "start_time", "end_time", "code",
                    "instructor", "program", "minutes", "units"
                ]
            });
            const wb = utils.book_new();
            utils.book_append_sheet(wb, ws, "Schedule");

            const now = new Date();
            const dateStr = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
            const defaultName = `schedule-export-${dateStr}.xlsx`;

            // Crear buffer de Excel
            const excelBuffer = write(wb, { bookType: "xlsx", type: "array" });

            // Exportación Segura (Única vía)
            const saved = await secureSaveFile({
                title: "Guardar Como",
                defaultName: defaultName,
                content: new Uint8Array(excelBuffer),
                openAfterExport: settings.openAfterExport
            });

            if (saved) {
                toast.success("Schedule exported to Excel successfully");
            }


        } catch (error) {
            console.error(error);
            toast.error("Failed to export Excel");
        }
    };

    const onSaveSchedule = async () => {
        try {
            const dataToSave = fullData as Schedule[];

            // Guardar en AppLocalData (Secure Autosave)
            await writeTextFile("schedule_autosave.json", JSON.stringify(dataToSave, null, 2), {
                baseDir: BaseDirectory.AppLocalData,
            });

            toast.success("Schedule saved to internal storage successfully");
        } catch (error) {
            console.error(error);
            toast.error("Failed to save schedule to AppData");
        }
    };

    return (
        <div className="flex flex-col gap-2">

            <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex flex-1 items-center gap-2">
                    {/* Upload Files - requires schedules.write permission */}
                    {!hideUpload && (
                        <RequirePermission permission="schedules.write">
                            <Button
                                size="sm"
                                onClick={onUploadClick}
                            >
                                Upload Files
                            </Button>
                        </RequirePermission>
                    )}
                    <InputGroup className="w-[320px]">
                        <InputGroupAddon>
                            <Search className="size-4 text-muted-foreground" />
                        </InputGroupAddon>
                        <InputGroupInput
                            placeholder="Search..."
                            value={(table.getState().globalFilter as string) ?? ""}
                            onChange={(event) => table.setGlobalFilter(event.target.value)}
                        />
                        <InputGroupAddon align="inline-end">
                            {table.getFilteredRowModel().rows.length} results
                        </InputGroupAddon>
                    </InputGroup>

                    {/* Safe check for Status column to avoid console errors if it doesn't exist */}
                    {!hideStatusFilter && !hasIncidenceData && (() => {
                        const statusColumn = table.getAllColumns().find(c => c.id === "status");
                        return statusColumn && statusColumn.getCanFilter() ? (
                            <DataTableFacetedFilter
                                column={statusColumn}
                                title="Status"
                                options={resolvedStatusOptions}
                            />
                        ) : null;
                    })()}

                    {/* Type filter for incidence data */}
                    {(hasIncidenceData || showTypeFilter) && (() => {
                        const typeColumn = table.getAllColumns().find(c => c.id === "type");
                        return typeColumn && typeColumn.getCanFilter() ? (
                            <DataTableFacetedFilter
                                column={typeColumn}
                                title="Type"
                                options={incidenceTypeOptions}
                            />
                        ) : null;
                    })()}

                    {!hideFilters && (
                        <>
                            {table.getColumn("branch") && (
                                <DataTableFacetedFilter
                                    column={table.getColumn("branch")}
                                    title="Branch"
                                    options={branchOptions}
                                    matchMode="includes"
                                    disabled={isTableEmpty}
                                />
                            )}
                            {table.getColumn("start_time") && (
                                <DataTableFacetedFilter
                                    column={table.getColumn("start_time")}
                                    title="Time"
                                    options={timeOptions}
                                    matchMode="startsWith"
                                    disabled={isTableEmpty}
                                />
                            )}
                            {/* Overlaps filter - al lado de los filtros */}
                            {overlapCount > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowOverlapsOnly(!showOverlapsOnly)}
                                    className={cn(
                                        "h-8 border-dashed border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive"
                                    )}
                                >
                                    <AlertTriangle />
                                    Overlaps
                                    {showOverlapsOnly && ` (${overlapCount})`}
                                </Button>
                            )}
                        </>
                    )}
                    {isFiltered && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                table.resetColumnFilters();
                                table.setGlobalFilter("");
                                setShowOverlapsOnly(false);
                                setShowLiveMode?.(false);
                            }}
                        >
                            Reset
                            <X />
                        </Button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* Live Mode Toggle */}
                    {setShowLiveMode && (
                        <RequirePermission permission="meetings.search">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowLiveMode(!showLiveMode)}
                                disabled={isLiveLoading || isTableEmpty}
                                className={cn(
                                    "h-8 border-dashed",
                                    showLiveMode &&
                                    "border-green-500/50 bg-green-500/10 text-green-600 hover:bg-green-500/20 hover:text-green-600 hover:border-green-500/50 dark:border-green-500/50 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20 dark:hover:text-green-400"
                                )}
                            >
                                {isLiveLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Radio className={cn("h-4 w-4", showLiveMode && "animate-pulse")} />
                                )}
                                {showLiveMode && activeMeetingsCount > 0 ? `Live (${activeMeetingsCount})` : "Live"}
                            </Button>
                        </RequirePermission>
                    )}
                    <DataTableViewOptions table={table} />
                    {onRefresh && (
                        <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={onRefresh}
                            disabled={disableRefresh}
                        >
                            <RefreshCw />
                        </Button>
                    )}
                    {!hideActions && (
                        <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline">
                                    Actions
                                    <ChevronDown />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                {customActionItems}
                                {customActionItems && !hideDefaultActions && <DropdownMenuSeparator />}

                                {!hideDefaultActions && (
                                    <>
                                        <DropdownMenuItem onClick={handleCopyInstructors} disabled={!hasSchedules}>
                                            <User />
                                            Copy Instructors
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={handleCopySchedule} disabled={!hasSchedules}>
                                            <CalendarCheck />
                                            Copy Schedule
                                        </DropdownMenuItem>
                                        <RequirePermission permission="schedules.manage">
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={onPublish} disabled={!canPublish || isPublishing}>
                                                {isPublishing ? <Loader2 className="animate-spin" /> : <CloudUpload />}
                                                {isPublishing ? "Publishing..." : "Publish Schedule"}
                                            </DropdownMenuItem>
                                        </RequirePermission>
                                        <RequirePermission permission="schedules.manage">
                                            <DropdownMenuItem onClick={handleCheckCloud} disabled={isCheckingCloud}>
                                                {isCheckingCloud ? <Loader2 className="animate-spin" /> : <CloudDownload />}
                                                {isCheckingCloud ? "Checking..." : "Check the Cloud"}
                                            </DropdownMenuItem>
                                        </RequirePermission>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={onSaveSchedule} disabled={!hasSchedules}>
                                            <Save />
                                            Save Schedule
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={onExportExcel} disabled={!hasSchedules}>
                                            <Download />
                                            Export to Excel
                                        </DropdownMenuItem>
                                    </>
                                )}

                                {onClearSchedule && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            variant="destructive"
                                            onClick={() => setShowClearDialog(true)}
                                        >
                                            <Trash2 />
                                            Clear Schedule
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    {/* Clear Schedule Confirmation Dialog */}
                    <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Clear all schedules?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will remove all loaded schedules from the table. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => {
                                    onClearSchedule?.();
                                    setShowClearDialog(false);
                                }}>
                                    Clear Schedule
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    {/* Restore Confirmation Dialog */}
                    <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Restore Schedule from Cloud?</AlertDialogTitle>
                                <AlertDialogDescription asChild className="space-y-2">
                                    <div>
                                        <div>A saved schedule with a date was found. {formatDateForDisplay(pendingRestoreData?.schedule_date)}. <br />
                                            Includes {pendingRestoreData?.entries_count} elements.
                                        </div>
                                        <span>This will replace your current table content.</span>
                                    </div>
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleConfirmRestore}>
                                    Download & Replace
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>
        </div >
    );
}
