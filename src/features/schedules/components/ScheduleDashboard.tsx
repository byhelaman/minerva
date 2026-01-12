import { useState, useRef, useMemo, useEffect } from "react";
import { UploadModal } from "@schedules/components/modals/UploadModal";
import { ScheduleDataTable } from "@schedules/components/table/ScheduleDataTable";
import { getScheduleColumns } from "@schedules/components/table/columns";
import { Schedule } from "@schedules/utils/excel-parser";
import { getUniqueScheduleKey } from "@schedules/utils/overlap-utils";
import { BaseDirectory, exists, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/components/settings-provider";
import { AUTOSAVE_FILENAME, AUTOSAVE_DEBOUNCE_MS } from "@/lib/constants";
import { Bot, CalendarPlus, CalendarSearch } from "lucide-react";
import { SearchLinkModal } from "./modals/SearchLinkModal";
import { CreateLinkModal } from "./modals/CreateLinkModal";
import { AssignLinkModal } from "./modals/AssignLinkModal";

export function ScheduleDashboard() {
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const hasLoadedAutosave = useRef(false);
    const autoSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { settings } = useSettings();

    // Auto-load on mount
    useEffect(() => {
        if (hasLoadedAutosave.current) return;
        hasLoadedAutosave.current = true;

        const loadAutosave = async () => {
            try {
                const fileExists = await exists(AUTOSAVE_FILENAME, { baseDir: BaseDirectory.AppLocalData });
                if (fileExists) {
                    const content = await readTextFile(AUTOSAVE_FILENAME, { baseDir: BaseDirectory.AppLocalData });
                    const parsedData = JSON.parse(content);
                    if (Array.isArray(parsedData) && parsedData.length > 0) {
                        setSchedules(parsedData);
                        toast.success("Previous session restored successfully");
                    }
                }
            } catch (error) {
                console.error("Failed to load autosave:", error);
                toast.error("Failed to restore previous session");
            }
        };

        loadAutosave();
    }, []);

    // Debounced auto-save when schedules change (if enabled)
    useEffect(() => {
        // Don't auto-save before initial load completes
        if (!hasLoadedAutosave.current) return;
        // Only auto-save if setting is enabled
        if (!settings.autoSave) return;

        // Clear previous timeout
        if (autoSaveTimeout.current) {
            clearTimeout(autoSaveTimeout.current);
        }

        // Set new debounced save
        autoSaveTimeout.current = setTimeout(async () => {
            try {
                if (schedules.length > 0) {
                    await writeTextFile(AUTOSAVE_FILENAME, JSON.stringify(schedules, null, 2), {
                        baseDir: BaseDirectory.AppLocalData,
                    });
                } else {
                    // If empty, remove the file
                    const fileExists = await exists(AUTOSAVE_FILENAME, { baseDir: BaseDirectory.AppLocalData });
                    if (fileExists) {
                        await remove(AUTOSAVE_FILENAME, { baseDir: BaseDirectory.AppLocalData });
                    }
                }
            } catch (error) {
                console.error("Auto-save failed:", error);
            }
        }, AUTOSAVE_DEBOUNCE_MS);

        // Cleanup on unmount
        return () => {
            if (autoSaveTimeout.current) {
                clearTimeout(autoSaveTimeout.current);
            }
        };
    }, [schedules, settings.autoSave]);

    const handleUploadComplete = (newData: Schedule[]) => {
        // Calculamos los duplicados usando el estado actual 'schedules'
        const existingKeys = new Set(schedules.map((s) => getUniqueScheduleKey(s)));

        // Filtrar nuevos items que ya existen
        const uniqueNewData = newData.filter(
            (s) => !existingKeys.has(getUniqueScheduleKey(s))
        );

        if (uniqueNewData.length === 0) {
            toast.info("No new schedules added (all duplicates)");
            return;
        }

        setSchedules((prev) => [...prev, ...uniqueNewData]);
        console.log(`Added ${uniqueNewData.length} new schedules, ignored ${newData.length - uniqueNewData.length} duplicates`);
        toast.success(`Added ${uniqueNewData.length} new schedules`);
    };

    const handleDeleteSchedule = (scheduleToDelete: Schedule) => {
        setSchedules((prev) => {
            const keyToDelete = getUniqueScheduleKey(scheduleToDelete);
            return prev.filter((s) => getUniqueScheduleKey(s) !== keyToDelete);
        });
        toast.success("Schedule deleted");
    };

    const handleClearSchedule = async () => {
        try {
            setSchedules([]);
            // Eliminar autosave si existe
            const fileExists = await exists(AUTOSAVE_FILENAME, { baseDir: BaseDirectory.AppLocalData });
            if (fileExists) {
                await remove(AUTOSAVE_FILENAME, { baseDir: BaseDirectory.AppLocalData });
            }
            toast.success("Schedule cleared and cache removed");
        } catch (error) {
            console.error("Error clearing schedule:", error);
            toast.error("Error clearing schedule");
        }
    };

    const columns = useMemo(() => getScheduleColumns(handleDeleteSchedule), []);

    return (
        <>
            <div className="flex py-8 my-4 gap-6 justify-between items-center">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-bold tracking-tight">Management</h1>
                    <p className="text-muted-foreground">Manage your schedules</p>
                </div>
                <div className="flex gap-2">

                    {/* <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsUploadModalOpen(true)}
                    >
                        Upload Files
                    </Button> */}

                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsSearchModalOpen(true)}
                    >
                        <CalendarSearch />
                        Search
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsCreateModalOpen(true)}
                    >
                        <CalendarPlus />
                        Create
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setIsAssignModalOpen(true)}
                    >
                        <Bot />
                        Assign
                    </Button>
                </div>
            </div>
            {/* Data Table */}
            <ScheduleDataTable
                columns={columns}
                data={schedules}
                onClearSchedule={schedules.length > 0 ? handleClearSchedule : undefined}
                onUploadClick={() => setIsUploadModalOpen(true)}
            />

            {/* Upload Modal */}
            <UploadModal
                open={isUploadModalOpen}
                onOpenChange={setIsUploadModalOpen}
                onUploadComplete={handleUploadComplete}
            />

            {/* Feature Modals */}
            <SearchLinkModal
                open={isSearchModalOpen}
                onOpenChange={setIsSearchModalOpen}
            />
            <CreateLinkModal
                open={isCreateModalOpen}
                onOpenChange={setIsCreateModalOpen}
            />
            <AssignLinkModal
                open={isAssignModalOpen}
                onOpenChange={setIsAssignModalOpen}
            />
        </>
    );
}
