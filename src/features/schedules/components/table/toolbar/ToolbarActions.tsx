import { useState } from "react";
import { secureSaveFile } from "@/lib/secure-export";
import { type Table } from "@tanstack/react-table";
import { ChevronDown, User, CalendarCheck, Download, Save, Trash2, CloudUpload, CloudDownload, Loader2, Check } from "lucide-react";
import { utils, write } from "xlsx";
import { toast } from "sonner";
import { writeTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";

import { Button } from "@/components/ui/button";
import { useScheduleSyncStore } from "@/features/schedules/stores/useScheduleSyncStore";
import { formatDateForDisplay } from "@/lib/date-utils";

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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatTimeTo12Hour } from "@schedules/utils/time-utils";
import type { Schedule } from "@schedules/types";
import { PublishedSchedule } from "@/features/schedules/types";
import { useSettings } from "@/components/settings-provider";
import { RequirePermission } from "@/components/RequirePermission";

interface ToolbarActionsProps<TData> {
    table: Table<TData>;
    fullData: TData[];
    onClearSchedule?: () => void;
    onPublish?: () => void;
    isPublishing?: boolean;
    canPublish?: boolean;
    customActionItems?: React.ReactNode;
    hideDefaultActions?: boolean;
}

export function ToolbarActions<TData>({
    table,
    fullData,
    onClearSchedule,
    onPublish,
    isPublishing = false,
    canPublish = false,
    customActionItems,
    hideDefaultActions = false,
}: ToolbarActionsProps<TData>) {
    const hasSchedules = table.getFilteredRowModel().rows.length > 0;

    // State for Clear Schedule confirmation dialog
    const [showClearDialog, setShowClearDialog] = useState(false);

    // Settings: Actions Respect Filters
    const { settings } = useSettings();
    const { getCloudVersions, loadPublishedSchedule } = useScheduleSyncStore();

    // State for version picker dialog
    const [showVersionsDialog, setShowVersionsDialog] = useState(false);
    const [cloudVersions, setCloudVersions] = useState<PublishedSchedule[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<PublishedSchedule | null>(null);
    const [isCheckingCloud, setIsCheckingCloud] = useState(false);

    const handleCheckCloud = async () => {
        setIsCheckingCloud(true);
        const toastId = toast.loading("Checking cloud versions...");

        try {
            const { data, error } = await getCloudVersions();

            if (error) {
                toast.error("Error checking cloud: " + error, { id: toastId });
                return;
            }

            if (data.length === 0) {
                toast.error("No published versions found", { id: toastId });
                return;
            }

            toast.dismiss(toastId);
            setCloudVersions(data);
            setSelectedVersion(data[0]); // pre-select the most recent
            setShowVersionsDialog(true);

        } catch (e) {
            console.error(e);
            toast.error("Failed to check cloud", { id: toastId });
        } finally {
            setIsCheckingCloud(false);
        }
    };

    const handleConfirmRestore = () => {
        if (selectedVersion) {
            loadPublishedSchedule(selectedVersion);
            setShowVersionsDialog(false);
            setSelectedVersion(null);
        }
    };

    // Helper to get the correct data source based on settings
    const getActionData = (): Schedule[] => {
        if (settings.actionsRespectFilters) {
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

            const excelBuffer = write(wb, { bookType: "xlsx", type: "array" });

            const saved = await secureSaveFile({
                title: "Save As",
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
        <>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                        Actions
                        <ChevronDown />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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

            <Dialog open={showVersionsDialog} onOpenChange={setShowVersionsDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Select Cloud Version</DialogTitle>
                        <DialogDescription>
                            Choose a published schedule to load. This will replace your current table content.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-1 max-h-72 overflow-y-auto py-1 pr-1">
                        {cloudVersions.map((version) => (
                            <button
                                key={version.id}
                                onClick={() => setSelectedVersion(version)}
                                className={cn(
                                    "flex items-center justify-between rounded-md border px-3 py-2.5 text-sm text-left transition-colors",
                                    selectedVersion?.id === version.id
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:bg-muted/50"
                                )}
                            >
                                <div className="flex flex-col gap-0.5">
                                    <span className="font-medium">{formatDateForDisplay(version.schedule_date)}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {version.entries_count} entries · updated {new Date(version.updated_at).toLocaleString()}
                                    </span>
                                </div>
                                {selectedVersion?.id === version.id && (
                                    <Check className="h-4 w-4 text-primary shrink-0" />
                                )}
                            </button>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowVersionsDialog(false)}>Cancel</Button>
                        <Button onClick={handleConfirmRestore} disabled={!selectedVersion}>
                            Download & Replace
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
