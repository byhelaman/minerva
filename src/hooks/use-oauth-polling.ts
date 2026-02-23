import { useRef, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface UseOAuthPollingOptions {
    /** Edge Function name to invoke (e.g. 'zoom-auth', 'microsoft-auth') */
    functionName: string;
    /** Polling interval in ms (default: 2000) */
    pollInterval?: number;
    /** Timeout in ms (default: 180000 = 3 min) */
    timeout?: number;
    /** Called when connection succeeds, receives the account data */
    onSuccess: (account: Record<string, unknown>) => void;
}

export function useOAuthPolling({
    functionName,
    pollInterval = 2000,
    timeout = 180_000,
    onSuccess,
}: UseOAuthPollingOptions) {
    const [isConnecting, setIsConnecting] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onSuccessRef = useRef(onSuccess);
    onSuccessRef.current = onSuccess;

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const cancel = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        setIsConnecting(false);
        toast.info("Connection cancelled");
    }, []);

    const startPolling = useCallback(() => {
        const startTime = Date.now();
        let handled = false;

        if (timerRef.current) clearInterval(timerRef.current);

        timerRef.current = setInterval(async () => {
            if (handled || !timerRef.current) return;

            if (Date.now() - startTime > timeout) {
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                setIsConnecting(false);
                toast.error("Connection timed out. Please try again.");
                return;
            }

            try {
                const { data: statusData } = await supabase.functions.invoke(functionName, {
                    body: { action: 'status' },
                    method: 'POST',
                });

                if (statusData?.connected && !handled) {
                    handled = true;
                    if (timerRef.current) {
                        clearInterval(timerRef.current);
                        timerRef.current = null;
                    }
                    setIsConnecting(false);
                    onSuccessRef.current(statusData.account);
                }
            } catch {
                // Silent polling — ignore errors
            }
        }, pollInterval);
    }, [functionName, pollInterval, timeout]);

    const connect = useCallback(async () => {
        setIsConnecting(true);

        try {
            const { data, error } = await supabase.functions.invoke(functionName, {
                body: { action: 'init' },
                method: 'POST',
            });

            if (error) throw error;
            if (!data?.url) throw new Error("No URL returned");

            return data.url as string;
        } catch (err) {
            setIsConnecting(false);
            throw err;
        }
    }, [functionName]);

    return { isConnecting, connect, startPolling, cancel };
}
