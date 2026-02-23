
import { useState, useEffect } from "react";
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Unplug, Link2, RefreshCw, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { useOAuthPolling } from "@/hooks/use-oauth-polling";
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
import { useZoomStore } from "@/features/matching/stores/useZoomStore";

interface ZoomAccount {
    email: string;
    name: string;
    connected_at: string;
}

export function ZoomIntegration() {
    const [isLoading, setIsLoading] = useState(true);
    const [account, setAccount] = useState<ZoomAccount | null>(null);
    const [isDisconnecting, setIsDisconnecting] = useState(false);

    // Store de Zoom para lógica de sincronización
    const { triggerSync, isSyncing } = useZoomStore();

    const { isConnecting, connect, startPolling, cancel: handleCancelConnect } = useOAuthPolling({
        functionName: 'zoom-auth',
        pollInterval: 2000,
        onSuccess: (acct) => {
            setAccount(acct as unknown as ZoomAccount);
            toast.success("Zoom connected successfully!");
        },
    });

    const fetchStatus = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase.functions.invoke('zoom-auth', {
                body: { action: 'status' },
                method: 'POST'
            });

            if (error) throw error;

            if (data?.connected && data?.account) {
                setAccount(data.account);
            } else {
                setAccount(null);
            }
        } catch (error) {
            console.error("Zoom status error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const handleConnect = async () => {
        try {
            const url = await connect();
            await openUrl(url);
            toast.info("Please complete authentication in your browser...");
            startPolling();
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || "Failed to start connection");
        }
    };

    const handleDisconnect = async (e: React.MouseEvent) => {
        // ¿Prevenir el cierre inmediato del AlertDialog si queremos mostrar estado de carga dentro?
        // En realidad por simplicidad, dejamos que cierre pero deshabilitar el botón disparador evita doble clics.
        // Pero el disparador solo se deshabilita SI el diálogo está cerrado.
        // Solo rastreemos el estado.
        e.preventDefault(); // ¿Prevenir lógica de cierre por defecto para manejar asincronía?
        // No, AlertDialogAction estándar cierra inmediatamente. Prevenir default lo mantiene abierto.

        try {
            setIsDisconnecting(true);
            const { error } = await supabase.functions.invoke('zoom-auth', {
                body: { action: 'disconnect' },
                method: 'POST'
            });

            if (error) throw error;

            setAccount(null);
            toast.success("Zoom disconnected");
            // Si prevenimos el default, necesitaríamos cerrar manualmente el diálogo aquí vía estado controlado.
            // Pero dado que 'setAccount(null)' elimina el diálogo completamente del DOM (renderizando el botón 'Connect' en su lugar),
            // no importa si prevenimos el default o no respecto al cierre.
            // La parte importante es deshabilitar el botón mientras la petición está en vuelo.
        } catch (error: unknown) {
            toast.error("Failed to disconnect");
        } finally {
            setIsDisconnecting(false);
        }
    };

    const handleSync = async () => {
        try {
            await triggerSync();
            toast.success("Zoom data synced successfully");
        } catch (error: unknown) {
            console.error("Sync failed", error);
            toast.error(getErrorMessage(error) || "Failed to sync Zoom data");
        }
    };

    if (isLoading) {
        return (
            <Card className="shadow-none">
                <CardHeader>
                    <CardTitle>Zoom Integration</CardTitle>
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
                <CardTitle>Zoom Integration</CardTitle>
                <CardDescription>
                    Connect your Zoom account to automate meeting creation.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between gap-6 flex-wrap">
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

                    <div className="flex items-center gap-2">
                        {account && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleSync}
                                disabled={isSyncing}
                            >
                                {isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                                {isSyncing ? "Syncing..." : "Sync Data"}
                            </Button>
                        )}

                        {account ? (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="destructive-outline"
                                        size="sm"
                                        disabled={isDisconnecting}
                                    >
                                        {isDisconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
                                        {isDisconnecting ? "Waiting..." : "Disconnect"}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="sm:max-w-100!">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will disconnect your Zoom account. You won't be able to schedule meetings automatically properly until you reconnect.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel disabled={isDisconnecting}>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDisconnect} disabled={isDisconnecting}>
                                            {isDisconnecting ? (
                                                <>
                                                    <Loader2 className="animate-spin" />
                                                    Disconnecting...
                                                </>
                                            ) : (
                                                "Continue"
                                            )}
                                        </AlertDialogAction>
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
                                    Connect
                                </Button>
                            )
                        )}
                    </div>
                </div>
            </CardContent>
        </Card >
    );
}
