import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, Cell } from "recharts"
import { formatChartDate } from "../utils/date-formatter"
import { getDateRange, PERIOD_LABELS } from "../hooks/useChartData"
import { logger } from "@/lib/logger"

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { supabase } from "@/lib/supabase"

const chartConfig = {
    rate: {
        label: "Tasa %",
        color: "hsl(217, 91%, 60%)",
    },
} satisfies ChartConfig

interface MonthlyRate {
    month: string
    rate: number
    total: number
    incidences: number
}

interface DailyRow { date: string; total_classes: number | string; incidences: number | string }
interface MonthlyRow { month: string; rate: number | string; total: number | string; incidences: number | string }

interface Props {
    timeRange: string
}

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

export function ChartBarMultiple({ timeRange }: Props) {
    const [chartData, setChartData] = useState<MonthlyRate[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false

        async function fetchData() {
            setLoading(true)
            try {
                const { startStr, endStr } = getDateRange(timeRange)

                if (timeRange === "7d") {
                    const { data, error } = await supabase.rpc("get_daily_stats", {
                        p_start_date: startStr,
                        p_end_date: endStr,
                    })
                    if (error) throw error
                    if (cancelled) return

                    setChartData((data as DailyRow[] || []).map((row) => {
                        const total = Number(row.total_classes)
                        const incidences = Number(row.incidences)
                        return {
                            month: row.date,
                            rate: total > 0 ? Math.round((incidences / total) * 100) : 0,
                            total,
                            incidences,
                        }
                    }))
                } else {
                    const { data, error } = await supabase.rpc("get_monthly_incidence_rate", {
                        p_start_date: startStr,
                        p_end_date: endStr,
                    })
                    if (error) throw error
                    if (cancelled) return

                    setChartData((data as MonthlyRow[] || []).map((row) => {
                        const [, m] = String(row.month).split("-")
                        return {
                            month: MONTH_NAMES[parseInt(m, 10) - 1],
                            rate: Math.round(Number(row.rate)),
                            total: Number(row.total),
                            incidences: Number(row.incidences),
                        }
                    }))
                }
            } catch (e) {
                logger.error("Failed to fetch rate data:", e)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchData()
        return () => { cancelled = true }
    }, [timeRange])

    const avgRate = chartData.length > 0
        ? Math.round(chartData.reduce((sum, d) => sum + d.rate, 0) / chartData.length)
        : 0

    const periodLabel = PERIOD_LABELS[timeRange] || "últimos 3 meses"

    return (
        <Card className="shadow-none">
            <CardHeader>
                <CardTitle>Tasa de Incidencias</CardTitle>
                <CardDescription>% de clases con incidencia</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center h-[200px]">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <ChartContainer config={chartConfig}>
                        <BarChart accessibilityLayer data={chartData}>
                            <CartesianGrid vertical={false} />
                            <XAxis
                                dataKey="month"
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                                tickFormatter={(value) => {
                                    return value.includes("-") && value.length > 5
                                        ? formatChartDate(value, "d MMM")
                                        : value
                                }}
                            />
                            <ChartTooltip
                                cursor={false}
                                content={
                                    <ChartTooltipContent
                                        formatter={(value, _name, item) => (
                                            <span>{value}% ({item.payload.incidences}/{item.payload.total})</span>
                                        )}
                                    />
                                }
                            />
                            <Bar dataKey="rate" radius={4}>
                                {chartData.map((entry) => (
                                    <Cell
                                        key={entry.month}
                                        fill={entry.rate > 20 ? "hsl(220, 70%, 35%)" : "hsl(217, 91%, 60%)"}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                )}
            </CardContent>
            <CardFooter className="flex-col items-start gap-2 text-sm">
                <div className="flex gap-2 leading-none font-medium">
                    Promedio: {avgRate}% de incidencias
                </div>
                <div className="text-muted-foreground leading-none">
                    {periodLabel}
                </div>
            </CardFooter>
        </Card>
    )
}
