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
import { RequirePermission } from "@/components/RequirePermission";
import { AUTOSAVE_FILENAME, AUTOSAVE_DEBOUNCE_MS } from "@/lib/constants";
import { Bot, CalendarPlus, CalendarSearch } from "lucide-react";
import { SearchLinkModal } from "./modals/SearchLinkModal";
import { CreateLinkModal } from "./modals/CreateLinkModal";
import { AssignLinkModal } from "./modals/AssignLinkModal";
import { useZoomStore } from "@/features/matching/stores/useZoomStore";

export function ScheduleDashboard() {
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const hasLoadedAutosave = useRef(false);
    const autoSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { settings } = useSettings();
    const fetchZoomData = useZoomStore((state) => state.fetchZoomData);
    const meetingsLoaded = useZoomStore((state) => state.meetings.length > 0);

    // Pre-load Zoom data in background on mount
    useEffect(() => {
        if (!meetingsLoaded) {
            fetchZoomData();
        }
    }, [meetingsLoaded, fetchZoomData]);

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
        // Paso 1: Deduplicar internamente los datos nuevos (entre archivos subidos)
        const internalKeys = new Set<string>();
        const deduplicatedNewData: Schedule[] = [];
        let internalDuplicates = 0;

        for (const schedule of newData) {
            const key = getUniqueScheduleKey(schedule);
            if (!internalKeys.has(key)) {
                internalKeys.add(key);
                deduplicatedNewData.push(schedule);
            } else {
                internalDuplicates++;
            }
        }

        // Si clearScheduleOnLoad está activado, reemplazar todo (con datos ya deduplicados)
        if (settings.clearScheduleOnLoad) {
            setSchedules(deduplicatedNewData);
            const msg = internalDuplicates > 0
                ? `Loaded ${deduplicatedNewData.length} schedules (${internalDuplicates} internal duplicates removed)`
                : `Loaded ${deduplicatedNewData.length} schedules`;
            console.log(msg);
            toast.success(msg);
            return;
        }

        // Paso 2: Comportamiento por defecto - merge con deduplicación contra existentes
        const existingKeys = new Set(schedules.map((s) => getUniqueScheduleKey(s)));

        // Filtrar items que ya existen en el estado actual
        const uniqueNewData = deduplicatedNewData.filter(
            (s) => !existingKeys.has(getUniqueScheduleKey(s))
        );

        const totalDuplicates = internalDuplicates + (deduplicatedNewData.length - uniqueNewData.length);

        if (uniqueNewData.length === 0) {
            toast.info("No new schedules added (all duplicates)");
            return;
        }

        setSchedules((prev) => [...prev, ...uniqueNewData]);
        console.log(`Added ${uniqueNewData.length} new schedules, ignored ${totalDuplicates} duplicates`);
        toast.success(`Added ${uniqueNewData.length} new schedules`);
    };

    const handleDeleteSchedule = (scheduleToDelete: Schedule) => {
        setSchedules((prev) => {
            const keyToDelete = getUniqueScheduleKey(scheduleToDelete);
            return prev.filter((s) => getUniqueScheduleKey(s) !== keyToDelete);
        });
        toast.success("Row Deleted", {
            description: scheduleToDelete.program,
        });
    };

    const handleClearSchedule = async () => {
        try {
            setSchedules([]);
            // Limpiar también los resultados de matching
            useZoomStore.setState({ matchResults: [] });
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

                    {/* Search - requires meetings.search permission */}
                    <RequirePermission permission="meetings.search">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsSearchModalOpen(true)}
                        >
                            <CalendarSearch />
                            Search
                        </Button>
                    </RequirePermission>

                    {/* Create - requires meetings.create permission */}
                    <RequirePermission permission="meetings.create">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsCreateModalOpen(true)}
                        >
                            <CalendarPlus />
                            Create
                        </Button>
                    </RequirePermission>

                    {/* Assign - requires meetings.assign permission */}
                    <RequirePermission permission="meetings.assign">
                        <Button
                            size="sm"
                            onClick={() => setIsAssignModalOpen(true)}
                            disabled={schedules.length === 0}
                        >
                            <Bot />
                            Assign
                        </Button>
                    </RequirePermission>
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
                schedules={schedules}
            />
        </>
    );
}
