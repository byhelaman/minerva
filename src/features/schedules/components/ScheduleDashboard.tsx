import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { UploadModal } from "@schedules/components/modals/UploadModal";
import { ScheduleDataTable } from "@schedules/components/table/ScheduleDataTable";
import { getScheduleColumns } from "@schedules/components/table/columns";
import { Schedule } from "@schedules/types";
import { getUniqueScheduleKey } from "@schedules/utils/overlap-utils";
import { BaseDirectory, exists, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/components/settings-provider";
import { RequirePermission } from "@/components/RequirePermission";
import { STORAGE_FILES } from "@/lib/constants";
import { formatDateToISO, formatDateForDisplay } from "@/lib/date-utils";
import { Bot, CalendarPlus, CalendarSearch } from "lucide-react";
import { SearchLinkModal } from "./modals/search/SearchLinkModal";
import { CreateLinkModal } from "./modals/creation/CreateLinkModal";
import { AssignLinkModal } from "./modals/assignment/AssignLinkModal";
import { useZoomStore } from "@/features/matching/stores/useZoomStore";
import { MatchingService } from "@/features/matching/services/matcher";
import { useAuth } from "@/components/auth-provider";
// Atomic Stores
import { useScheduleDataStore } from "@/features/schedules/stores/useScheduleDataStore";
import { useScheduleUIStore } from "@/features/schedules/stores/useScheduleUIStore";
import { useScheduleSyncStore } from "@/features/schedules/stores/useScheduleSyncStore";

import { ScheduleUpdateBanner } from "./ScheduleUpdateBanner";
import { PublishToDbModal } from "./modals/PublishToDbModal";
import { AddScheduleModal } from "./modals/AddScheduleModal";

// Flag a nivel de módulo: persiste entre mount/unmount (navegación de página), a diferencia de useRef
let autosaveLoadedThisSession = false;

export function ScheduleDashboard() {
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Autenticación
    const { profile } = useAuth();
    const canManage = (profile?.hierarchy_level ?? 0) >= 80;

    // Acceso al Store
    const { baseSchedules, setBaseSchedules, incidences, getComputedSchedules } = useScheduleDataStore();
    const { activeDate, setActiveDate } = useScheduleUIStore();
    const { refreshMsConfig, isPublishing } = useScheduleSyncStore();

    // Schedules Computados (Mergeados con Incidencias)
    // Memoizar para prevenir loops infinitos en componentes downstream (AssignLinkModal) que dependen de este array
    const schedules = useMemo(() => getComputedSchedules(), [baseSchedules, incidences, getComputedSchedules]);

    const hasLoadedAutosave = useRef(false);
    const autoSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { settings } = useSettings();
    const { fetchActiveMeetings, isLoadingData } = useZoomStore();

    // Estado del Live Mode
    const [showLiveMode, setShowLiveMode] = useState(false);
    const [isLiveLoading, setIsLiveLoading] = useState(false);
    const [activePrograms, setActivePrograms] = useState<Set<string>>(new Set());
    const [liveTimeFilter, setLiveTimeFilter] = useState<string | undefined>(undefined);
    const [liveDateFilter, setLiveDateFilter] = useState<string | undefined>(undefined);

    // Inicializar Store Global
    useEffect(() => {
        refreshMsConfig();
    }, [refreshMsConfig]);


    // Auto-cargar drafts al montar (solo una vez por sesión de app)
    useEffect(() => {
        if (autosaveLoadedThisSession) {
            hasLoadedAutosave.current = true; // Habilitar auto-save en re-visitas
            return;
        }
        autosaveLoadedThisSession = true;
        hasLoadedAutosave.current = true;

        const loadAutosave = async () => {
            try {
                // Cargar Base Schedules (Drafts)
                const schedExists = await exists(STORAGE_FILES.SCHEDULES_DRAFT, { baseDir: BaseDirectory.AppLocalData });
                if (schedExists) {
                    const content = await readTextFile(STORAGE_FILES.SCHEDULES_DRAFT, { baseDir: BaseDirectory.AppLocalData });
                    const parsedData = JSON.parse(content);
                    if (Array.isArray(parsedData) && parsedData.length > 0) {
                        setBaseSchedules(parsedData);
                        if (parsedData.length > 0 && parsedData[0].date) {
                            setActiveDate(parsedData[0].date);
                        }
                        toast.success("Draft schedule restored");
                    }
                }

            } catch (error) {
                console.error("Failed to load autosave:", error);
            }
        };

        loadAutosave();
    }, [setBaseSchedules, setActiveDate]);

    // Obtener incidencias de BD cuando cambia la fecha activa
    useEffect(() => {
        if (!activeDate) return;
        useScheduleDataStore.getState().fetchIncidencesForDate(activeDate);
    }, [activeDate]);

    // Auto-guardado con debounce para SCHEDULES (Solo Drafts)
    useEffect(() => {
        if (!hasLoadedAutosave.current) return;
        if (!settings.autoSave) return;

        if (autoSaveTimeout.current) {
            clearTimeout(autoSaveTimeout.current);
        }

        autoSaveTimeout.current = setTimeout(async () => {
            try {
                if (baseSchedules.length > 0) {
                    await writeTextFile(STORAGE_FILES.SCHEDULES_DRAFT, JSON.stringify(baseSchedules, null, 2), {
                        baseDir: BaseDirectory.AppLocalData,
                    });
                } else {
                    const fileExists = await exists(STORAGE_FILES.SCHEDULES_DRAFT, { baseDir: BaseDirectory.AppLocalData });
                    if (fileExists) {
                        await remove(STORAGE_FILES.SCHEDULES_DRAFT, { baseDir: BaseDirectory.AppLocalData });
                    }
                }
            } catch (error) {
                console.error("Auto-save failed:", error);
            }
        }, settings.autoSaveInterval);

        return () => {
            if (autoSaveTimeout.current) {
                clearTimeout(autoSaveTimeout.current);
            }
        };
    }, [baseSchedules, settings.autoSave, settings.autoSaveInterval]);


    // Lógica del Live Mode
    const handleLiveModeToggle = useCallback(async (enabled: boolean) => {
        setShowLiveMode(enabled);

        if (!enabled) {
            setActivePrograms(new Set());
            setLiveTimeFilter(undefined);
            setLiveDateFilter(undefined);
            return;
        }

        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2, '0');
        const currentDate = formatDateToISO(now);

        setLiveTimeFilter(currentHour);
        setLiveDateFilter(currentDate);

        setIsLiveLoading(true);
        try {
            await fetchActiveMeetings();
            const currentActiveIds = useZoomStore.getState().activeMeetingIds;

            if (currentActiveIds.length === 0) {
                setActivePrograms(new Set());
                setIsLiveLoading(false);
                return;
            }

            const { meetings: freshMeetings, users: freshUsers } = useZoomStore.getState();
            const activeMeetings = freshMeetings.filter(m => currentActiveIds.includes(m.meeting_id));

            if (activeMeetings.length === 0) {
                setActivePrograms(new Set());
                setIsLiveLoading(false);
                return;
            }

            const filteredSchedules = schedules.filter(s => {
                const matchesDate = s.date === currentDate;
                const matchesHour = s.start_time?.substring(0, 2) === currentHour;
                return matchesDate && matchesHour;
            });

            const matcher = new MatchingService(activeMeetings, freshUsers);
            const matchedPrograms = new Set<string>();

            for (const schedule of filteredSchedules) {
                const result = matcher.findMatchByTopic(schedule.program, { ignoreLevelMismatch: true });
                if (result.status !== 'not_found' && result.matchedCandidate) {
                    matchedPrograms.add(schedule.program);
                }
            }

            setActivePrograms(matchedPrograms);

            // Auto-marcar clases coincidentes como "Yes" solo si el status es null
            const { updateIncidence } = useScheduleDataStore.getState();
            for (const s of filteredSchedules) {
                if (matchedPrograms.has(s.program) && !s.status) {
                    updateIncidence({ ...s, status: "Yes" }).catch(e => console.warn('Live: no se pudo actualizar status', e));
                }
            }
        } catch (error) {
            console.error("Error in live mode:", error);
            toast.error("Failed to fetch live meetings");
        } finally {
            setIsLiveLoading(false);
        }
    }, [schedules, fetchActiveMeetings]);

    // Auto-refresh del Live: cada minuto actualizar filtro de hora y re-ejecutar matching local
    useEffect(() => {
        if (!showLiveMode) return;

        const tick = async () => {
            const now = new Date();
            const currentHour = now.getHours().toString().padStart(2, '0');
            const currentDate = formatDateToISO(now);

            setLiveTimeFilter(currentHour);
            setLiveDateFilter(currentDate);

            // Re-ejecutar matching con llamada fresca a la API
            await fetchActiveMeetings();
            const { activeMeetingIds, meetings: cachedMeetings, users: cachedUsers } = useZoomStore.getState();
            if (activeMeetingIds.length === 0) { setActivePrograms(new Set()); return; }

            const activeMeetings = cachedMeetings.filter(m => activeMeetingIds.includes(m.meeting_id));
            if (activeMeetings.length === 0) { setActivePrograms(new Set()); return; }

            const currentSchedules = useScheduleDataStore.getState().getComputedSchedules();
            const filtered = currentSchedules.filter(s =>
                s.date === currentDate && s.start_time?.substring(0, 2) === currentHour
            );

            const matcher = new MatchingService(activeMeetings, cachedUsers);
            const matched = new Set<string>();
            for (const s of filtered) {
                const result = matcher.findMatchByTopic(s.program, { ignoreLevelMismatch: true });
                if (result.status !== 'not_found' && result.matchedCandidate) matched.add(s.program);
            }
            setActivePrograms(matched);

            // Auto-marcar clases coincidentes como "Yes" solo si el status es null
            const { updateIncidence } = useScheduleDataStore.getState();
            for (const s of filtered) {
                if (matched.has(s.program) && !s.status) {
                    updateIncidence({ ...s, status: "Yes" }).catch(e => console.warn('Live tick: no se pudo actualizar status', e));
                }
            }
        };

        const interval = setInterval(tick, 60_000);
        return () => clearInterval(interval);
    }, [showLiveMode]);

    const handleUploadComplete = (newData: Schedule[]) => {
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

        if (settings.clearScheduleOnLoad) {
            setBaseSchedules(deduplicatedNewData);
            const msg = internalDuplicates > 0
                ? `Loaded ${deduplicatedNewData.length} schedules (${internalDuplicates} internal duplicates removed)`
                : `Loaded ${deduplicatedNewData.length} schedules`;
            toast.success(msg);

            // Assume the first date from uploaded file is the active date we want to work on
            if (deduplicatedNewData.length > 0 && deduplicatedNewData[0].date) {
                setActiveDate(deduplicatedNewData[0].date);
            }
            return;
        }

        const existingKeys = new Set(baseSchedules.map((s) => getUniqueScheduleKey(s)));
        const uniqueNewData = deduplicatedNewData.filter(
            (s) => !existingKeys.has(getUniqueScheduleKey(s))
        );

        if (uniqueNewData.length === 0) {
            toast.info("No new schedules added (all duplicates)");
            return;
        }

        setBaseSchedules([...baseSchedules, ...uniqueNewData]);
        toast.success(`Added ${uniqueNewData.length} new schedules`);
    };

    const handleDeleteSchedule = useCallback((scheduleToDelete: Schedule) => {
        const keyToDelete = getUniqueScheduleKey(scheduleToDelete);
        const store = useScheduleDataStore.getState();
        store.setBaseSchedules(store.baseSchedules.filter((s) => getUniqueScheduleKey(s) !== keyToDelete));
        toast.success("Row Deleted", {
            description: scheduleToDelete.program,
        });
    }, []);

    const handleBulkDeleteSchedules = (rows: Schedule[]) => {
        const keysToDelete = new Set(rows.map(getUniqueScheduleKey));
        setBaseSchedules(baseSchedules.filter((s) => !keysToDelete.has(getUniqueScheduleKey(s))));
        toast.success(`${rows.length} rows deleted`);
    };

    const handleAddSchedule = (newSchedule: Schedule) => {
        // If it's the first schedule, set the active date
        if (baseSchedules.length === 0) {
            setActiveDate(newSchedule.date);
        }

        // Add to local state (Draft)
        setBaseSchedules([...baseSchedules, newSchedule]);
        toast.success("Schedule added");
    };



    const handleClearSchedule = async () => {
        try {
            setBaseSchedules([]);
            setActiveDate(null); // Reset active date
            useZoomStore.setState({ matchResults: [] });
            const fileExists = await exists(STORAGE_FILES.SCHEDULES_DRAFT, { baseDir: BaseDirectory.AppLocalData });
            if (fileExists) {
                await remove(STORAGE_FILES.SCHEDULES_DRAFT, { baseDir: BaseDirectory.AppLocalData });
            }

            // Reset version tracking so toast can reappear if there is a server version
            await useScheduleSyncStore.getState().resetCurrentVersion();

            toast.success("Schedule cleared");
        } catch (error) {
            console.error("Error clearing schedule:", error);
            toast.error("Error clearing schedule");
        }
    };

    const columns = useMemo(
        () => getScheduleColumns(handleDeleteSchedule, canManage),
        [handleDeleteSchedule, canManage],
    );

    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex py-8 my-4 gap-6 justify-between items-center">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-bold tracking-tight">Management</h1>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Active Date: {activeDate ? formatDateForDisplay(activeDate) : "No Date Selected"}</span>
                    </div>
                </div>
                <div className="flex gap-2">

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

            <ScheduleUpdateBanner />

            {/* Data Table */}
            <ScheduleDataTable
                columns={columns}
                data={schedules}
                onBulkDelete={(rows) => handleBulkDeleteSchedules(rows as Schedule[])}
                onClearSchedule={schedules.length > 0 ? handleClearSchedule : undefined}
                onUploadClick={() => setIsUploadModalOpen(true)}
                showLiveMode={showLiveMode}
                setShowLiveMode={handleLiveModeToggle}
                isLiveLoading={isLiveLoading || isLoadingData}
                activePrograms={showLiveMode ? activePrograms : undefined}
                liveTimeFilter={showLiveMode ? liveTimeFilter : undefined}
                liveDateFilter={showLiveMode ? liveDateFilter : undefined}
                initialPageSize={100}
                onPublish={() => setIsPublishModalOpen(true)}
                isPublishing={isPublishing}
                canPublish={schedules.length > 0}
                onAddRow={() => setIsAddModalOpen(true)}
            />

            {/* Upload Modal */}
            <UploadModal
                open={isUploadModalOpen}
                onOpenChange={setIsUploadModalOpen}
                onUploadComplete={handleUploadComplete}
            />

            <PublishToDbModal
                open={isPublishModalOpen}
                onOpenChange={setIsPublishModalOpen}
            />

            <AddScheduleModal
                open={isAddModalOpen}
                onOpenChange={setIsAddModalOpen}
                onSubmit={handleAddSchedule}
                activeDate={activeDate}
                existingSchedules={baseSchedules}
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


        </div>
    );
}
