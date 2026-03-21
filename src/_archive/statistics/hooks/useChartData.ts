import { useState, useEffect } from "react"
import { format } from "date-fns"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"

/** Map from timeRange key to number of days to look back. */
const DAYS_MAP: Record<string, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "180d": 180,
    "365d": 365,
}

/** Human-readable labels for each period (Spanish). */
export const PERIOD_LABELS: Record<string, string> = {
    "7d": "últimos 7 días",
    "30d": "últimos 30 días",
    "90d": "últimos 3 meses",
    "180d": "últimos 6 meses",
    "365d": "último año",
}

/** Compute start/end date strings for a given time range. */
export function getDateRange(timeRange: string): { startStr: string; endStr: string } {
    const now = new Date()
    const daysBack = DAYS_MAP[timeRange] || 90
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - daysBack)
    return {
        startStr: format(startDate, "yyyy-MM-dd"),
        endStr: format(now, "yyyy-MM-dd"),
    }
}

/**
 * Generic hook that fetches chart data from a Supabase RPC,
 * with cancellation to avoid race conditions when timeRange changes rapidly.
 */
export function useChartData<TRow, TResult>(
    rpcName: string,
    timeRange: string,
    transform: (data: TRow[]) => TResult[],
    buildParams?: (startStr: string, endStr: string) => Record<string, unknown>,
): { data: TResult[]; loading: boolean } {
    const [data, setData] = useState<TResult[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false

        async function fetchData() {
            setLoading(true)
            try {
                const { startStr, endStr } = getDateRange(timeRange)
                const params = buildParams
                    ? buildParams(startStr, endStr)
                    : { p_start_date: startStr, p_end_date: endStr }

                const { data: rpcData, error } = await supabase.rpc(rpcName, params)
                if (error) throw error
                if (!cancelled) {
                    setData(transform((rpcData || []) as TRow[]))
                }
            } catch (e) {
                logger.error(`Failed to fetch ${rpcName}:`, e)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchData()
        return () => { cancelled = true }
    }, [timeRange, rpcName])

    return { data, loading }
}
