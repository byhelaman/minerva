import { useMemo, useState } from "react";
import { type Table } from "@tanstack/react-table";
import { Search, X, ChevronDown, User, CalendarCheck, Download, Save, Trash2 } from "lucide-react";
import { utils, write } from "xlsx";
import { toast } from "sonner";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { downloadDir } from "@tauri-apps/api/path";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
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

// Opciones de filtro para campos de Schedule
const shiftOptions = [
    { label: "P. ZUÑIGA", value: "P. ZUÑIGA" },
    { label: "H. GARCIA", value: "H. GARCIA" },
];

const branchOptions = [
    { label: "CORPORATE", value: "CORPORATE" },
    { label: "HUB", value: "HUB" },
    { label: "LA MOLINA", value: "LA MOLINA" },
    { label: "KIDS", value: "KIDS" },
];

// Opciones por defecto cuando no hay datos cargados
const defaultTimeOptions = [
    { label: "07:00", value: "07" },
    { label: "08:00", value: "08" },
    { label: "09:00", value: "09" },
    { label: "10:00", value: "10" },
    { label: "11:00", value: "11" },
    { label: "12:00", value: "12" },
    { label: "13:00", value: "13" },
    { label: "14:00", value: "14" },
    { label: "15:00", value: "15" },
    { label: "16:00", value: "16" },
    { label: "17:00", value: "17" },
    { label: "18:00", value: "18" },
    { label: "19:00", value: "19" },
    { label: "20:00", value: "20" },
    { label: "21:00", value: "21" },
    { label: "22:00", value: "22" },
];

interface DataTableToolbarProps<TData> {
    table: Table<TData>;

    showOverlapsOnly: boolean;
    setShowOverlapsOnly: (show: boolean) => void;
    overlapCount: number;
    onClearSchedule?: () => void;
    onUploadClick?: () => void;
    fullData: TData[];
}

export function DataTableToolbar<TData>({
    table,
    showOverlapsOnly,
    setShowOverlapsOnly,
    overlapCount,
    onClearSchedule,
    onUploadClick,
    fullData,
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
            }));
    }, [fullData]);

    const hasSchedules = table.getFilteredRowModel().rows.length > 0;
    const isTableEmpty = !fullData || fullData.length === 0;

    // State for Clear Schedule confirmation dialog
    const [showClearDialog, setShowClearDialog] = useState(false);

    // Settings: Actions Respect Filters
    const { settings } = useSettings();

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
            const dataToExport = data.map((item) => {
                return {
                    ...item,
                    start_time: formatTimeTo12Hour(item.start_time),
                    end_time: formatTimeTo12Hour(item.end_time),
                };
            });

            const ws = utils.json_to_sheet(dataToExport);
            const wb = utils.book_new();
            utils.book_append_sheet(wb, ws, "Schedule");

            const now = new Date();
            const dateStr = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
            const defaultName = `schedule-export-${dateStr}.xlsx`;

            // Use default export path from settings if available
            // Quick Export Logic
            let filePath: string | null = null;
            const excelBuffer = write(wb, { bookType: "xlsx", type: "array" });

            if (settings.exportWithoutConfirmation) {
                // Determine destination path: use settings or fallback to Downloads
                let exportDir = settings.defaultExportPath;
                if (!exportDir) {
                    try {
                        exportDir = await downloadDir();
                    } catch (err) {
                        console.error("Failed to get download dir:", err);
                    }
                }

                if (exportDir) {
                    console.log("Attempting Quick Export to:", exportDir);
                    // Try quick export
                    try {
                        const fullPath = `${exportDir}\\${defaultName}`;
                        await writeFile(fullPath, new Uint8Array(excelBuffer));
                        filePath = fullPath;
                        console.log("Quick Export successful:", filePath);
                    } catch (writeError) {
                        console.warn("Quick export failed, falling back to dialog:", writeError);
                        toast.warning("Quick export failed (check permissions), falling back to dialog");
                    }
                } else {
                    console.warn("Skipping Quick Export: No valid export directory found.");
                }
            } else {
                console.log("Skipping Quick Export. Enabled:", settings.exportWithoutConfirmation, "Path:", settings.defaultExportPath);
            }

            // Fallback to dialog if quick export wasn't attempted or failed
            if (!filePath) {
                const defaultPath = settings.defaultExportPath
                    ? `${settings.defaultExportPath}\\${defaultName}`
                    : defaultName;

                filePath = await save({
                    filters: [{ name: "Excel", extensions: ["xlsx"] }],
                    defaultPath: defaultPath,
                });

                if (!filePath) return;

                // Only write if we used the dialog (quick export writes inside the try block)
                await writeFile(filePath, new Uint8Array(excelBuffer));
            }

            toast.success("Schedule exported to Excel successfully");

            // Open file after export if setting enabled
            if (settings.openAfterExport) {
                try {
                    const { openPath } = await import("@tauri-apps/plugin-opener");
                    await openPath(filePath);
                } catch (openError) {
                    console.error("Failed to open file:", openError);
                    toast.warning("File exported but could not be opened automatically");
                }
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
                    <Button
                        size="sm"
                        onClick={onUploadClick}
                    >
                        Upload Files
                    </Button>
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
                    {table.getColumn("shift") && (
                        <DataTableFacetedFilter
                            column={table.getColumn("shift")}
                            title="Shift"
                            options={shiftOptions}
                            disabled={isTableEmpty}
                        />
                    )}
                    {table.getColumn("branch") && (
                        <DataTableFacetedFilter
                            column={table.getColumn("branch")}
                            title="Branch"
                            options={branchOptions}
                            usePartialMatch={true}
                            disabled={isTableEmpty}
                        />
                    )}
                    {table.getColumn("start_time") && (
                        <DataTableFacetedFilter
                            column={table.getColumn("start_time")}
                            title="Time"
                            options={timeOptions}
                            disabled={isTableEmpty}
                        />
                    )}
                    {isFiltered && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                table.resetColumnFilters();
                                table.setGlobalFilter("");
                                setShowOverlapsOnly(false);
                            }}
                        >
                            Reset
                            <X />
                        </Button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {overlapCount > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowOverlapsOnly(!showOverlapsOnly)}
                            className={cn(
                                "h-8 border-dashed",
                                showOverlapsOnly &&
                                "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive"
                            )}
                        >
                            {`Overlaps (${overlapCount})`}
                        </Button>
                    )}
                    <DataTableViewOptions table={table} />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" disabled={!hasSchedules}>
                                Actions
                                <ChevronDown />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={handleCopyInstructors}>
                                <User />
                                Copy Instructors
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleCopySchedule}>
                                <CalendarCheck />
                                Copy Schedule
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={onSaveSchedule}>
                                <Save />
                                Save Schedule
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onExportExcel}>
                                <Download />
                                Export to Excel
                            </DropdownMenuItem>

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
                </div>
            </div>
        </div>
    );
}
