import { useState, useEffect, useRef } from "react";
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Unplug, Link2, FileSpreadsheet, FolderOpen, Folder, RefreshCw, X } from "lucide-react";
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
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatTimestampForDisplay } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { STORAGE_FILES } from "@/lib/constants";

interface MicrosoftAccount {
    email: string;
    name: string;
    connected_at: string;
    schedules_folder?: { id: string; name: string };
    incidences_file?: { id: string; name: string };
}

interface FileSystemItem {
    id: string;
    name: string;
    type: 'file' | 'folder';
    date: string;
    parentId: string | null;
}

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

    // Restoring File Navigation State and Logic
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null, name: string }[]>([{ id: null, name: "Home" }]);
    const [files, setFiles] = useState<FileSystemItem[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [fileCache, setFileCache] = useState<Record<string, FileSystemItem[]>>({});
    const currentFolderRef = useRef(currentFolderId);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Keep ref in sync
    useEffect(() => {
        currentFolderRef.current = currentFolderId;
    }, [currentFolderId]);

    // Load files when folder changes
    const fetchFiles = async (forceRefresh = false) => {
        if (!isFileDialogOpen || !account) return;

        const targetFolder = currentFolderId || 'root';

        // Check Cache first
        if (!forceRefresh && fileCache[targetFolder]) {
            setFiles(fileCache[targetFolder]);
            setIsLoadingFiles(false);
            return;
        }
        try {
            setIsLoadingFiles(true);
            const { data, error } = await supabase.functions.invoke('microsoft-graph', {
                body: {
                    action: 'list-children',
                    folderId: currentFolderId
                },
                method: 'POST'
            });

            if (error) throw error;

            // Race Condition Check
            const currentActiveFolder = currentFolderRef.current || 'root';
            if (targetFolder !== currentActiveFolder) {
                return;
            }

            // Transform Graph API data to our format
            const items: FileSystemItem[] = data.value.map((item: any) => ({
                id: item.id,
                name: item.name,
                type: item.folder ? 'folder' : 'file',
                date: formatTimestampForDisplay(item.lastModifiedDateTime),
                parentId: currentFolderId
            }));

            setFiles(items);
            setFileCache(prev => ({ ...prev, [targetFolder]: items }));
        } catch (error) {
            console.error("Failed to load files", error);
            toast.error("Failed to load OneDrive files");
        } finally {
            const currentActiveFolder = currentFolderRef.current || 'root';
            if (targetFolder === currentActiveFolder) {
                setIsLoadingFiles(false);
            }
        }
    };

    useEffect(() => {
        if (isFileDialogOpen) {
            fetchFiles();
        } else {
            // Reset nav when closed
            setCurrentFolderId(null);
            setBreadcrumbs([{ id: null, name: "Home" }]);
        }
    }, [currentFolderId, isFileDialogOpen, account]);

    const handleRefresh = () => {
        fetchFiles(true);
    };

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
            setCurrentFolderId(null);
            setBreadcrumbs([{ id: null, name: "Home" }]);

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

    const handleSelectLink = async (item: { id: string; name: string }) => {
        if (!configMode) return;

        try {
            // Persist to backend
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

            // Update local state
            setAccount(prev => prev ? ({
                ...prev,
                [configMode]: { id: item.id, name: item.name }
            }) : null);

            setIsFileDialogOpen(false);
            setConfigMode(null);

            // Clear Cache on Config Change to prevent showing stale data from previous file
            try {
                if (await exists(STORAGE_FILES.EXCEL_DATA_MIRROR, { baseDir: BaseDirectory.AppLocalData })) {
                    await remove(STORAGE_FILES.EXCEL_DATA_MIRROR, { baseDir: BaseDirectory.AppLocalData });
                }
            } catch (ignore) { console.error("Failed to clear cache", ignore); }

            toast.success(`Linked ${configMode === 'schedules_folder' ? 'Folder' : 'File'}: ${item.name}`);
            if (onConfigChange) onConfigChange();
        } catch (error) {
            console.error("Failed to link", error);
            toast.error("Failed to save selection");
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

    const handleNavigate = (folderId: string | null, folderName: string) => {
        setCurrentFolderId(folderId);
        setBreadcrumbs(prev => [...prev, { id: folderId, name: folderName }]);
    };

    const handleBreadcrumbClick = (index: number) => {
        const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
        setBreadcrumbs(newBreadcrumbs);
        setCurrentFolderId(newBreadcrumbs[newBreadcrumbs.length - 1].id);
    };

    const handleCancelConnect = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsConnecting(false);
        toast.info("Connection cancelled");
    };

    // Helper to open dialog for specific mode
    const openSelectionDialog = (mode: 'schedules_folder' | 'incidences_file') => {
        setConfigMode(mode);
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
                        {renderConfigRow(
                            "Incidences Log File",
                            "Single Excel file for tracking all history.",
                            account.incidences_file,
                            'incidences_file',
                        )}
                    </div>
                )}

                {/* File Browser Dialog */}
                <Dialog open={isFileDialogOpen} onOpenChange={(open) => { setIsFileDialogOpen(open); if (!open) setConfigMode(null); }}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                Select {configMode === 'schedules_folder' ? 'Folder' : 'File'}
                            </DialogTitle>
                            <DialogDescription>
                                {configMode === 'schedules_folder'
                                    ? "Select the root folder for schedules."
                                    : "Select the Excel file for incidences."}
                            </DialogDescription>
                        </DialogHeader>

                        {/* Breadcrumbs */}
                        <div className="flex items-center justify-between px-1 my-1">
                            <Breadcrumb>
                                <BreadcrumbList>
                                    {breadcrumbs.map((crumb, index) => {
                                        const isLast = index === breadcrumbs.length - 1;
                                        return (
                                            <div key={crumb.id || 'root'} className="contents">
                                                <BreadcrumbItem>
                                                    {isLast ? (
                                                        <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
                                                    ) : (
                                                        <BreadcrumbLink
                                                            className="cursor-pointer"
                                                            onClick={() => handleBreadcrumbClick(index)}
                                                        >
                                                            {crumb.name}
                                                        </BreadcrumbLink>
                                                    )}
                                                </BreadcrumbItem>
                                                {!isLast && <BreadcrumbSeparator />}
                                            </div>
                                        );
                                    })}
                                </BreadcrumbList>
                            </Breadcrumb>
                            <Button variant="secondary" size="icon-sm" onClick={handleRefresh} disabled={isLoadingFiles}>
                                <RefreshCw className={isLoadingFiles ? "animate-spin" : ""} />
                            </Button>
                        </div>

                        {/* Browser */}
                        <ScrollArea className="h-[300px] border rounded-md">
                            <div className="p-2 space-y-1">
                                {isLoadingFiles ? (
                                    <div className="flex justify-center p-8 text-muted-foreground">
                                        <Loader2 className="animate-spin h-6 w-6" />
                                    </div>
                                ) : files.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-8 text-muted-foreground gap-1">
                                        <FolderOpen className="h-6 w-6 opacity-50" />
                                        <p className="text-sm">Empty folder</p>
                                    </div>
                                ) : (
                                    files.map((item) => {
                                        const isFolder = item.type === 'folder';
                                        const isExcel = item.name.toLowerCase().endsWith('.xlsx');

                                        // Logic for disabling the ROW (interactions)
                                        // If mode is 'incidences_file', only folders and xlsx are active (folders to nav).
                                        // If mode is 'schedules_folder', only folders are active.
                                        const isRowDisabled = configMode === 'incidences_file'
                                            ? (!isFolder && !isExcel)
                                            : (!isFolder);

                                        // Logic for disabling the CHECKBOX (selection)
                                        // 1. If row is disabled, checkbox is disabled.
                                        // 2. If mode is incidences_file, folders cannot be selected (only nav).
                                        // 3. If mode is schedules_folder, only folders can be selected.
                                        const isCheckboxDisabled = isRowDisabled ||
                                            (configMode === 'incidences_file' && isFolder);

                                        // Is this item the currently selected one?
                                        const isSelected =
                                            (configMode === 'schedules_folder' && account?.schedules_folder?.id === item.id) ||
                                            (configMode === 'incidences_file' && account?.incidences_file?.id === item.id);

                                        return (
                                            <div
                                                key={item.id}
                                                className={cn(
                                                    "flex items-center gap-6 justify-between p-2 rounded-md transition-colors group",
                                                    isRowDisabled ? "opacity-40" : "hover:bg-accent/50 cursor-pointer",
                                                    isSelected && "bg-accent/50 border border-primary/20"
                                                )}
                                                onClick={() => {
                                                    if (isRowDisabled) return;
                                                    // Navigate if folder (always navigation via main click)
                                                    if (isFolder) handleNavigate(item.id, item.name);
                                                    // Add separate Select button for folder selection mode
                                                    // For files, click selects immediately? Or confirm? 
                                                    // Previous logic was immediate.
                                                    if (!isFolder && configMode === 'incidences_file') handleSelectLink(item);
                                                }}
                                            >


                                                <div className="flex items-center gap-3 px-1">
                                                    {isFolder ? <Folder className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium">{item.name}</span>
                                                        <span className="text-xs text-muted-foreground">{item.date}</span>
                                                    </div>
                                                </div>
                                                {/* Actions */}
                                                <div className="flex items-center gap-2 px-1">
                                                    {!isCheckboxDisabled && (
                                                        <Checkbox
                                                            checked={isSelected}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    handleSelectLink(item);
                                                                }
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className={cn(
                                                                // Enabled items: invisible unless hovered or selected
                                                                !isSelected && "opacity-0 group-hover:opacity-100"
                                                            )}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </ScrollArea>

                        <DialogFooter className="flex justify-between sm:justify-between w-full">
                            <div className="text-xs text-muted-foreground self-center">
                                {configMode === 'schedules_folder'
                                    ? "Navigate to folder and click Select."
                                    : "Click on an Excel file to select it."}
                            </div>
                            <Button variant="outline" onClick={() => setIsFileDialogOpen(false)}>Cancel</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}

