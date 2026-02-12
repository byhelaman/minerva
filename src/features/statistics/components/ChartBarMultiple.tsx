import * as React from "react"
import { Loader2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, Cell } from "recharts"

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

interface Props {
    timeRange: string
}

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

export function ChartBarMultiple({ timeRange }: Props) {
    const [chartData, setChartData] = React.useState<MonthlyRate[]>([])
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const now = new Date()
                const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "180d": 180, "365d": 365 }
                const daysBack = daysMap[timeRange] || 90

                const startDate = new Date(now)
                startDate.setDate(startDate.getDate() - daysBack)
                const startStr = startDate.toISOString().split("T")[0]
                const endStr = now.toISOString().split("T")[0]

                if (timeRange === "7d") {
                    // For 7 days, use daily stats instead of monthly
                    const { data, error } = await supabase.rpc("get_daily_stats", {
                        p_start_date: startStr,
                        p_end_date: endStr,
                    })

                    if (error) throw error

                    const result: MonthlyRate[] = (data || []).map((row: any) => {
                        const d = new Date(row.date)
                        const total = Number(row.total_classes)
                        const incidences = Number(row.incidences)
                        const rate = total > 0 ? Math.round((incidences / total) * 100) : 0
                        return {
                            month: d.toLocaleDateString("es", { day: "numeric", month: "short" }),
                            rate,
                            total,
                            incidences,
                        }
                    })
                    setChartData(result)
                } else {
                    const { data, error } = await supabase.rpc("get_monthly_incidence_rate", {
                        p_start_date: startStr,
                        p_end_date: endStr,
                    })

                    if (error) throw error

                    const result: MonthlyRate[] = (data || []).map((row: any) => {
                        const [, m] = (row.month as string).split("-")
                        return {
                            month: MONTH_NAMES[parseInt(m, 10) - 1],
                            rate: Math.round(Number(row.rate)),
                            total: Number(row.total),
                            incidences: Number(row.incidences),
                        }
                    })
                    setChartData(result)
                }
            } catch (e) {
                console.error("Failed to fetch rate data:", e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [timeRange])

    const avgRate = chartData.length > 0
        ? Math.round(chartData.reduce((sum, d) => sum + d.rate, 0) / chartData.length)
        : 0

    const periodLabels: Record<string, string> = { "7d": "últimos 7 días", "30d": "últimos 30 días", "90d": "últimos 3 meses", "180d": "últimos 6 meses", "365d": "último año" }
    const periodLabel = periodLabels[timeRange] || "últimos 3 meses"

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
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={index}
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
