import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { jwtDecode } from "jwt-decode";
import { BaseDirectory, readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import SyncWorker from "../workers/sync-linked-source.worker.ts?worker"; // Importación de worker de Vite
import type { SyncWorkerMessage, SyncWorkerResponse } from "../workers/sync-linked-source.worker";
import { STORAGE_FILES } from "@/lib/constants";

export function useLinkedSourceSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    // isRestoringCache indica que estamos verificando/cargando el archivo local.
    const [isRestoringCache, setIsRestoringCache] = useState(true);

    // Metadatos de caché
    // cachedData puede ser una matriz (legado/una hoja) o un Record<string, any[]> (multi-hoja)
    const [cachedData, setCachedData] = useState<any | any[]>([]);
    const [cachedSheets, setCachedSheets] = useState<any[]>([]);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileId, setFileId] = useState<string | null>(null);

    const workerRef = useRef<Worker | null>(null);
    // Refs para evitar stale closures en el worker handler
    const fileMetaRef = useRef<{ id: string; name: string } | null>(null);

    // Cleanup: terminar worker al desmontar
    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, []);

    // Carga inicial desde caché
    useEffect(() => {
        const loadCache = async () => {
            setIsRestoringCache(true);
            try {
                // 0. Verificar sesión y permisos antes de llamar a la API
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    console.log("No session, skipping cache validation");
                    setIsRestoringCache(false);
                    return;
                }

                try {
                    const claims: any = jwtDecode(session.access_token);
                    const permissions = claims.permissions || [];
                    if (!permissions.includes('reports.view')) {
                        setIsRestoringCache(false);
                        return;
                    }
                } catch (e) {
                    setIsRestoringCache(false);
                    return;
                }

                // 1. Obtener configuración actual para validar el caché
                const { data: config, error } = await supabase.functions.invoke('microsoft-auth', {
                    body: { action: 'status' },
                    method: 'POST'
                });

                if (error || !config?.account?.incidences_file?.id) {
                    // Si no hay configuración o error, no podemos validar el caché.
                    // Por seguridad, descartamos el caché local para no mostrar datos incorrectos.
                    setCachedData([]);
                    setCachedSheets([]);
                    setFileName(null);
                    setFileId(null);
                    return;
                }

                const currentFileId = config?.account?.incidences_file?.id;

                const fileExists = await exists(STORAGE_FILES.EXCEL_DATA_MIRROR, { baseDir: BaseDirectory.AppLocalData });
                if (fileExists) {
                    const content = await readTextFile(STORAGE_FILES.EXCEL_DATA_MIRROR, { baseDir: BaseDirectory.AppLocalData });
                    const parsed = JSON.parse(content);

                    // VALIDACIÓN CRÍTICA: El caché debe pertenecer al archivo configurado actualmente
                    if (currentFileId && parsed.fileId !== currentFileId) {
                        console.warn(`Cache mismatch: Cached fileId ${parsed.fileId} != Current ${currentFileId}. Discarding cache.`);
                        // Opcional: Borrar archivo de caché
                        return;
                    }

                    if (parsed.data) setCachedData(parsed.data);
                    if (parsed.sheets) setCachedSheets(parsed.sheets);
                    if (parsed.timestamp) setLastUpdated(parsed.timestamp);
                    if (parsed.fileName) setFileName(parsed.fileName);
                    if (parsed.fileId) setFileId(parsed.fileId);
                }
            } catch (error) {
                console.error("Failed to load linked source cache", error);
            } finally {
                setIsRestoringCache(false);
            }
        };
        loadCache();
    }, []);

    // Función de sincronización
    const sync = useCallback(async () => {
        if (isSyncing) return;
        setIsSyncing(true);

        try {
            // 0. Verificar sesión
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                console.error("No active session for sync");
                setIsSyncing(false);
                return;
            }

            try {
                const claims: any = jwtDecode(session.access_token);
                const permissions = claims.permissions || [];
                // Allow sync if user has reports.view (Viewer) OR system.manage (Admin) - though reports.view is the standard
                if (!permissions.includes('reports.view')) {
                    console.warn("Unauthorized sync attempt");
                    setIsSyncing(false);
                    return;
                }
            } catch (e) {
                setIsSyncing(false);
                return;
            }

            // 1. Check if linked source is configured
            const { data: config, error } = await supabase.functions.invoke('microsoft-auth', {
                body: { action: 'status' },
                method: 'POST'
            });

            if (error || !config?.connected || !config?.account?.incidences_file?.id) {
                setIsSyncing(false);
                return;
            }

            const currentFileId = config.account.incidences_file.id;
            const currentFileName = config.account.incidences_file.name || 'Linked File';

            // Guardar en ref para acceso en el handler sin stale closure
            fileMetaRef.current = { id: currentFileId, name: currentFileName };

            // 2. Get Access Token (Already checked)
            if (!session?.access_token) {
                console.error("No active session for sync");
                setIsSyncing(false);
                return;
            }

            // 3. Terminar worker previo si existe y crear uno nuevo
            // Esto evita handlers stale de syncs anteriores
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }

            workerRef.current = new SyncWorker();

            workerRef.current.onmessage = async (e: MessageEvent<SyncWorkerResponse>) => {
                const { type } = e.data;
                // Usar ref para obtener metadata actualizada
                const fileMeta = fileMetaRef.current;

                if (type === 'SYNC_START') {
                    // Ya se está sincronizando
                } else if (type === 'SYNC_SUCCESS') {
                    // Guardar en caché
                    const payload = {
                        timestamp: e.data.timestamp,
                        data: e.data.data,
                        sheets: e.data.sheets,
                        fileName: fileMeta?.name || 'Linked File',
                        fileId: fileMeta?.id || ''
                    };

                    try {
                        await writeTextFile(STORAGE_FILES.EXCEL_DATA_MIRROR, JSON.stringify(payload), {
                            baseDir: BaseDirectory.AppLocalData
                        });

                        setCachedData(e.data.data);
                        setCachedSheets(e.data.sheets);
                        setLastUpdated(e.data.timestamp);
                        setFileName(fileMeta?.name || null);
                        setFileId(fileMeta?.id || null);

                        toast.success("Reports updated", {
                            description: `Local data is in sync with ${fileMeta?.name || 'linked file'}`,
                        });
                    } catch (saveError) {
                        console.error("Failed to save sync cache", saveError);
                    } finally {
                        setIsSyncing(false);
                        workerRef.current?.terminate();
                        workerRef.current = null;
                    }

                } else if (type === 'SYNC_ERROR') {
                    console.error("Sync worker error:", e.data.error);
                    toast.error("Sync failed");
                    setIsSyncing(false);
                    workerRef.current?.terminate();
                    workerRef.current = null;
                }
            };

            // Enviar carga útil
            const message: SyncWorkerMessage = {
                type: 'SYNC',
                fileId: currentFileId,
                supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
                supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                accessToken: session.access_token
            };

            workerRef.current.postMessage(message);

        } catch (error) {
            console.error("Sync init failed", error);
            setIsSyncing(false);
        }
    }, [isSyncing]);

    return {
        isSyncing,
        isRestoringCache,
        lastUpdated,
        cachedData,
        cachedSheets,
        fileName,
        fileId,
        sync
    };
}
