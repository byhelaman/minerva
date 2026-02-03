import { useState, useEffect, useRef } from "react";
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Unplug, Link2, X } from "lucide-react";
import { BaseDirectory, remove, exists } from "@tauri-apps/plugin-fs";
import { supabase } from "@/lib/supabase";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatTimestampForDisplay } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { STORAGE_FILES } from "@/lib/constants";
import { MicrosoftAccount, FileSystemItem } from "../types";
import { FileTreeNode } from "./MicrosoftFileTree";

interface MicrosoftIntegrationProps {
    onConfigChange?: () => void;
}

export function MicrosoftIntegration({ onConfigChange }: MicrosoftIntegrationProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [account, setAccount] = useState<MicrosoftAccount | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);

    // Configuration Mode: 'schedules_folder' or 'incidences_file'
    const [configMode, setConfigMode] = useState<'schedules_folder' | 'incidences_file' | null>(null);
    const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);

    // Cache for loaded data (no need to track expansion state with Collapsible)
    const [fileWorksheets, setFileWorksheets] = useState<Map<string, { id: string; name: string }[]>>(new Map());
    const [worksheetTables, setWorksheetTables] = useState<Map<string, { id: string; name: string }[]>>(new Map());
    const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
    const [loadingWorksheets, setLoadingWorksheets] = useState<Set<string>>(new Set());
    const [isSavingConfig, setIsSavingConfig] = useState(false);

    // File tree state - single cache for all levels
    const [folderChildren, setFolderChildren] = useState<Map<string, FileSystemItem[]>>(new Map());
    const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Load children for a folder (called when Collapsible opens)
    const loadFolderChildren = async (folderId: string | null) => {
        const folderKey = folderId || 'root';

        // Skip if already loaded
        if (folderChildren.has(folderKey)) return;

        setLoadingFolders(prev => new Set(prev).add(folderKey));
        try {
            const { data, error } = await supabase.functions.invoke('microsoft-graph', {
                body: {
                    action: 'list-children',
                    folderId
                },
                method: 'POST'
            });

            if (error) throw error;

            const items: FileSystemItem[] = data.value.map((item: any) => ({
                id: item.id,
                name: item.name,
                type: item.folder ? 'folder' : 'file',
                date: formatTimestampForDisplay(item.lastModifiedDateTime),
                parentId: folderId
            }));

            setFolderChildren(prev => new Map(prev).set(folderKey, items));
        } catch (error) {
            console.error("Failed to load folder contents", error);
            toast.error("Failed to load folder");
        } finally {
            setLoadingFolders(prev => {
                const next = new Set(prev);
                next.delete(folderKey);
                return next;
            });
        }
    };

    // Load root on dialog open
    useEffect(() => {
        if (isFileDialogOpen && !folderChildren.has('root')) {
            loadFolderChildren(null);
        }
    }, [isFileDialogOpen]);

    // Initial Status Check
    const fetchStatus = async () => {
        try {
            const { data, error } = await supabase.functions.invoke('microsoft-auth', {
                body: { action: 'status' },
                method: 'POST'
            });

            if (!error && data?.connected && data?.account) {
                setAccount(data.account);
                if (onConfigChange) onConfigChange();
            }
        } catch (error) {
            console.error("Status check failed", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    // Cleanup timer
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const handleDisconnect = async () => {
        try {
            setIsDisconnecting(true);
            const { error } = await supabase.functions.invoke('microsoft-auth', {
                body: { action: 'disconnect' },
                method: 'POST'
            });

            if (error) throw error;

            setAccount(null);
            // setCurrentFolderId(null);
            // setBreadcrumbs([{ id: null, name: "Home" }]);

            // Clear Cache
            try {
                if (await exists(STORAGE_FILES.EXCEL_DATA_MIRROR, { baseDir: BaseDirectory.AppLocalData })) {
                    await remove(STORAGE_FILES.EXCEL_DATA_MIRROR, { baseDir: BaseDirectory.AppLocalData });
                }
            } catch (ignore) { console.error("Failed to clear cache", ignore); }

            if (onConfigChange) onConfigChange();
            toast.success("Microsoft disconnected");
        } catch (error) {
            toast.error("Failed to disconnect");
        } finally {
            setIsDisconnecting(false);
        }
    };

    // Load worksheets for a file (called when Collapsible opens)
    const loadWorksheets = async (fileId: string) => {
        // Skip if already loaded
        if (fileWorksheets.has(fileId)) return;

        setLoadingFiles(prev => new Set(prev).add(fileId));
        try {
            const { data, error } = await supabase.functions.invoke('microsoft-graph', {
                body: {
                    action: 'list-worksheets',
                    fileId
                },
                method: 'POST'
            });

            if (error) throw error;

            const sheets = data.value.filter((item: any) => item.type === 'sheet');
            setFileWorksheets(prev => new Map(prev).set(fileId, sheets));
        } catch (error) {
            console.error("Failed to load worksheets", error);
            toast.error("Failed to load worksheets");
        } finally {
            setLoadingFiles(prev => {
                const next = new Set(prev);
                next.delete(fileId);
                return next;
            });
        }
    };

    // Load tables for a worksheet (called when Collapsible opens)
    const loadTables = async (fileId: string, worksheetId: string) => {
        // Skip if already loaded
        if (worksheetTables.has(worksheetId)) return;

        setLoadingWorksheets(prev => new Set(prev).add(worksheetId));
        try {
            const { data, error } = await supabase.functions.invoke('microsoft-graph', {
                body: {
                    action: 'list-tables',
                    fileId,
                    sheetId: worksheetId
                },
                method: 'POST'
            });

            if (error) throw error;

            setWorksheetTables(prev => new Map(prev).set(worksheetId, data.value || []));
        } catch (error) {
            console.error("Failed to load tables", error);
            toast.error("Failed to load tables");
        } finally {
            setLoadingWorksheets(prev => {
                const next = new Set(prev);
                next.delete(worksheetId);
                return next;
            });
        }
    };

    // Handle table selection
    const handleSelectTable = async (fileItem: { id: string; name: string }, worksheet: { id: string; name: string }, table: { id: string; name: string }) => {
        setIsSavingConfig(true);
        try {
            const { error } = await supabase.functions.invoke('microsoft-auth', {
                body: {
                    action: 'update-config',
                    type: 'incidences_file',
                    id: fileItem.id,
                    name: fileItem.name,
                    worksheet_id: worksheet.id,
                    worksheet_name: worksheet.name,
                    table_id: table.id,
                    table_name: table.name
                },
                method: 'POST'
            });

            if (error) throw error;

            setAccount(prev => prev ? ({
                ...prev,
                incidences_file: { id: fileItem.id, name: fileItem.name },
                incidences_worksheet: { id: worksheet.id, name: worksheet.name },
                incidences_table: { id: table.id, name: table.name }
            }) : null);

            setIsFileDialogOpen(false);
            setConfigMode(null);
            setFolderChildren(new Map());
            setFileWorksheets(new Map());
            setWorksheetTables(new Map());

            try {
                if (await exists(STORAGE_FILES.EXCEL_DATA_MIRROR, { baseDir: BaseDirectory.AppLocalData })) {
                    await remove(STORAGE_FILES.EXCEL_DATA_MIRROR, { baseDir: BaseDirectory.AppLocalData });
                }
            } catch (ignore) { console.error("Failed to clear cache", ignore); }

            toast.success(`Linked: ${fileItem.name} > ${worksheet.name} > ${table.name}`);
            if (onConfigChange) onConfigChange();
        } catch (error) {
            console.error("Failed to save config", error);
            toast.error("Failed to save configuration");
        } finally {
            setIsSavingConfig(false);
        }
    };

    const handleSelectLink = async (item: { id: string; name: string }) => {
        if (!configMode) return;

        // schedules_folder: simple selection (as before)
        if (configMode === 'schedules_folder') {
            try {
                const { error } = await supabase.functions.invoke('microsoft-auth', {
                    body: {
                        action: 'update-config',
                        type: configMode,
                        id: item.id,
                        name: item.name
                    },
                    method: 'POST'
                });

                if (error) throw error;

                setAccount(prev => prev ? ({
                    ...prev,
                    schedules_folder: { id: item.id, name: item.name }
                }) : null);

                setIsFileDialogOpen(false);
                setConfigMode(null);

                try {
                    if (await exists(STORAGE_FILES.EXCEL_DATA_MIRROR, { baseDir: BaseDirectory.AppLocalData })) {
                        await remove(STORAGE_FILES.EXCEL_DATA_MIRROR, { baseDir: BaseDirectory.AppLocalData });
                    }
                } catch (ignore) { console.error("Failed to clear cache", ignore); }

                toast.success(`Linked Folder: ${item.name}`);
                if (onConfigChange) onConfigChange();
            } catch (error) {
                console.error("Failed to link", error);
                toast.error("Failed to save selection");
            }
        }
    };

    const handleConnect = async () => {
        try {
            setIsConnecting(true);
            const { data, error } = await supabase.functions.invoke('microsoft-auth', {
                body: { action: 'init' },
                method: 'POST'
            });

            if (error) throw error;
            if (!data?.url) throw new Error("No URL returned");

            await openUrl(data.url);
            toast.info("Please complete sign in your browser...");

            const startTime = Date.now();
            const POLL_INTERVAL = 3000;
            const TIMEOUT = 180000; // 3 min

            if (timerRef.current) clearInterval(timerRef.current);

            timerRef.current = setInterval(async () => {
                if (Date.now() - startTime > TIMEOUT) {
                    handleCancelConnect();
                    toast.error("Connection timed out");
                    return;
                }

                const { data: status } = await supabase.functions.invoke('microsoft-auth', {
                    body: { action: 'status' },
                    method: 'POST'
                });

                if (status?.connected) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    setAccount(status.account);
                    setIsConnecting(false);
                    toast.success("Microsoft connected successfully!");
                }
            }, POLL_INTERVAL);

        } catch (error: any) {
            toast.error(error.message || "Failed to start connection");
            setIsConnecting(false);
        }
    };


    const handleCancelConnect = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsConnecting(false);
        toast.info("Connection cancelled");
    };

    // Helper to open dialog for specific mode
    const openSelectionDialog = (mode: 'schedules_folder' | 'incidences_file') => {
        setConfigMode(mode);
        setFolderChildren(new Map());
        setFileWorksheets(new Map());
        setWorksheetTables(new Map());
        setIsFileDialogOpen(true);
    };

    // Render Helpers
    const renderConnectionStatus = () => (
        <div className="space-y-1">
            {account ? (
                <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full bg-green-500" />
                    <span className="font-medium text-sm">
                        Connected
                    </span>
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full bg-gray-300" />
                    <span className="font-medium text-sm">
                        Not Connected
                    </span>
                </div>
            )}

            <p className="text-sm text-muted-foreground">
                {account ? `Linked to ${account.email} ` : "No account linked"}
            </p>
        </div>
    );

    const renderConfigRow = (
        title: string,
        description: string,
        value: { id: string; name: string } | undefined,
        mode: 'schedules_folder' | 'incidences_file',
    ) => (
        <div className="flex items-center justify-between space-x-2">
            <div className={value?.id ? "space-y-1" : "space-y-2"}>
                <div className="flex items-center gap-2">
                    <Label>{title} {value?.name && <Badge variant="secondary">{value.name}</Badge>}</Label>
                </div>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <Button
                variant="outline"
                size="sm"
                disabled={!account}
                onClick={() => openSelectionDialog(mode)}
            >
                {value?.id ? "Change" : "Browse"}
            </Button>
        </div>
    );

    if (isLoading) {
        return (
            <Card className="shadow-none">
                <CardHeader>
                    <CardTitle>Microsoft Integration</CardTitle>
                    <CardDescription>Loading status...</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-center p-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Common props for FileTreeNode
    const fileTreeProps = {
        configMode,
        account,
        folderChildren,
        fileWorksheets,
        worksheetTables,
        loadingFolders,
        loadingFiles,
        loadingWorksheets,
        onLoadFolderChildren: loadFolderChildren,
        onLoadWorksheets: loadWorksheets,
        onLoadTables: loadTables,
        onSelectLink: handleSelectLink,
        onSelectTable: handleSelectTable
    };

    return (
        <Card className="shadow-none">
            <CardHeader>
                <CardTitle>Microsoft Integration</CardTitle>
                <CardDescription>
                    Manage connection to OneDrive for Schedules and Incidences.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Header Status */}
                <div className="flex items-center justify-between">
                    {renderConnectionStatus()}
                    {account ? (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isDisconnecting}
                                    className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive"
                                >
                                    <Unplug />
                                    Disconnect
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will stop synchronization. Your files will remain in OneDrive.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDisconnect}>Disconnect</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    ) : (
                        isConnecting ? (
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled className="gap-2">
                                    <Loader2 className="animate-spin" />
                                    Connecting...
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={handleCancelConnect}
                                    className="text-muted-foreground hover:text-foreground"
                                    title="Cancel connection"
                                >
                                    <X />
                                    <span className="sr-only">Cancel</span>
                                </Button>
                            </div>
                        ) : (
                            <Button variant="outline" size="sm" onClick={handleConnect}>
                                <Link2 />
                                Connect Microsoft
                            </Button>
                        )
                    )}
                </div>
                {account && <Separator />}
                {/* Configuration Sections */}
                {account && (
                    <div className="space-y-6">
                        {renderConfigRow(
                            "Monthly Schedules Folder",
                            "Folder where monthly Excel files are stored/created.",
                            account.schedules_folder,
                            'schedules_folder',
                        )}
                        <div className="space-y-3">
                            {renderConfigRow(
                                "Incidences Log File",
                                "Excel file for tracking incidences history.",
                                account.incidences_file,
                                'incidences_file',
                            )}
                            {account.incidences_file && (
                                <div className="pl-6 space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">Worksheet:</span>
                                        {account.incidences_worksheet?.name ? (
                                            <Badge variant="outline">{account.incidences_worksheet.name}</Badge>
                                        ) : (
                                            <span className="text-muted-foreground italic">Not configured</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">Table:</span>
                                        {account.incidences_table?.name ? (
                                            <Badge variant="outline">{account.incidences_table.name}</Badge>
                                        ) : (
                                            <span className="text-muted-foreground italic">Not configured</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* File Browser Dialog */}
                <Dialog open={isFileDialogOpen} onOpenChange={(open) => {
                    setIsFileDialogOpen(open);
                    if (!open) {
                        setConfigMode(null);
                        setFolderChildren(new Map());
                        setFileWorksheets(new Map());
                        setWorksheetTables(new Map());
                    }
                }}>
                    <DialogContent className="max-h-[85vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>
                                {configMode === 'schedules_folder' ? 'Select Folder' : 'Configure Incidences File'}
                            </DialogTitle>
                            <DialogDescription>
                                {configMode === 'schedules_folder'
                                    ? "Select the root folder for schedules."
                                    : "Navigate to the Excel file, expand it, then select a table."}
                            </DialogDescription>
                        </DialogHeader>

                        {/* File Tree */}
                        <ScrollArea className="border rounded-md flex-1 overflow-hidden">
                            <div className="h-[300px] max-w-[460px] p-2 w-full">
                                {loadingFolders.has('root') && !folderChildren.has('root') ? (
                                    <div className="flex justify-center p-8 text-muted-foreground">
                                        <Loader2 className="animate-spin h-6 w-6" />
                                    </div>
                                ) : (
                                    <div className="space-y-1 pb-2">
                                        {folderChildren.get('root')?.map(item => (
                                            <FileTreeNode
                                                key={item.id}
                                                item={item}
                                                depth={0}
                                                {...fileTreeProps}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        <DialogFooter>
                            {/* <div className="text-xs text-muted-foreground self-center">
                                {configMode === 'schedules_folder'
                                    ? "Navigate to folder and check to select."
                                    : "Expand Excel file → Expand worksheet → Select table"}
                            </div> */}
                            <Button variant="outline" onClick={() => setIsFileDialogOpen(false)} disabled={isSavingConfig}>
                                {isSavingConfig ? "Saving..." : "Cancel"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}

