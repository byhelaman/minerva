import * as React from "react"
import { format } from "date-fns"
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react"
import { Label, Pie, PieChart } from "recharts"

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
    count: {
        label: "Clases",
    },
    normal: {
        label: "Sin incidencia",
        color: "hsl(210, 90%, 75%)",
    },
    incidence: {
        label: "Con incidencia",
        color: "hsl(220, 70%, 35%)",
    },
} satisfies ChartConfig

interface Props {
    timeRange: string
}

export function ChartPieDonutText({ timeRange }: Props) {
    const [currentPeriod, setCurrentPeriod] = React.useState({ total: 0, incidences: 0, rate: 0 })
    const [previousPeriod, setPreviousPeriod] = React.useState({ total: 0, incidences: 0, rate: 0 })
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const now = new Date()
                const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "180d": 180, "365d": 365 }
                const daysBack = daysMap[timeRange] || 90

                // Current period
                const startDate = new Date(now)
                startDate.setDate(startDate.getDate() - daysBack)

                const prevStartDate = new Date(startDate)
                prevStartDate.setDate(prevStartDate.getDate() - daysBack)

                const startStr = format(startDate, 'yyyy-MM-dd')
                const endStr = format(now, 'yyyy-MM-dd')

                const prevStartStr = format(prevStartDate, 'yyyy-MM-dd')
                const prevEndStr = format(startDate, 'yyyy-MM-dd') // Ends where current starts.setDate(prevStart.getDate() - daysBack)

                const { data, error } = await supabase.rpc("get_period_comparison", {
                    p_cur_start: startStr,
                    p_cur_end: endStr,
                    p_prev_start: prevStartStr,
                    p_prev_end: prevEndStr,
                })

                if (error) throw error

                for (const row of data || []) {
                    const stats = {
                        total: Number(row.total),
                        incidences: Number(row.incidences),
                        rate: Number(row.rate),
                    }
                    if (row.period === "current") setCurrentPeriod(stats)
                    else setPreviousPeriod(stats)
                }
            } catch (e) {
                console.error("Failed to fetch trend data:", e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [timeRange])

    const rateDiff = currentPeriod.rate - previousPeriod.rate

    const normal = currentPeriod.total - currentPeriod.incidences
    const chartData = [
        { segment: "normal", count: normal, fill: "var(--color-normal)" },
        { segment: "incidence", count: currentPeriod.incidences, fill: "var(--color-incidence)" },
    ]

    const TrendIcon = rateDiff > 1 ? TrendingUp : rateDiff < -1 ? TrendingDown : Minus
    const trendLabel = rateDiff > 1
        ? `+${rateDiff.toFixed(1)}% vs periodo anterior`
        : rateDiff < -1
            ? `${rateDiff.toFixed(1)}% vs periodo anterior`
            : "Sin cambio vs periodo anterior"

    const periodLabels: Record<string, string> = { "7d": "últimos 7 días", "30d": "últimos 30 días", "90d": "últimos 3 meses", "180d": "últimos 6 meses", "365d": "último año" }
    const periodLabel = periodLabels[timeRange] || "últimos 3 meses"

    return (
        <Card className="flex flex-col shadow-none">
            <CardHeader className="items-center pb-0">
                <CardTitle>Comparativa</CardTitle>
                <CardDescription>Periodo actual vs anterior</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-0">
                {loading ? (
                    <div className="flex items-center justify-center aspect-square max-h-[250px] mx-auto">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <ChartContainer
                        config={chartConfig}
                        className="mx-auto aspect-square max-h-[250px]"
                    >
                        <PieChart>
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent hideLabel />}
                            />
                            <Pie
                                data={chartData}
                                dataKey="count"
                                nameKey="segment"
                                innerRadius={60}
                                strokeWidth={5}
                            >
                                <Label
                                    content={({ viewBox }) => {
                                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                            return (
                                                <text
                                                    x={viewBox.cx}
                                                    y={viewBox.cy}
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                >
                                                    <tspan
                                                        x={viewBox.cx}
                                                        y={viewBox.cy}
                                                        className="fill-foreground text-3xl font-bold"
                                                    >
                                                        {currentPeriod.rate.toFixed(0)}%
                                                    </tspan>
                                                    <tspan
                                                        x={viewBox.cx}
                                                        y={(viewBox.cy || 0) + 24}
                                                        className="fill-muted-foreground"
                                                    >
                                                        Incidencias
                                                    </tspan>
                                                </text>
                                            )
                                        }
                                    }}
                                />
                            </Pie>
                        </PieChart>
                    </ChartContainer>
                )}
            </CardContent>
            <CardFooter className="flex-col gap-2 text-sm">
                <div className="flex items-center gap-2 leading-none font-medium">
                    {trendLabel} <TrendIcon className="h-4 w-4" />
                </div>
                <div className="text-muted-foreground leading-none">
                    {currentPeriod.incidences}/{currentPeriod.total} clases · {periodLabel}
                </div>
            </CardFooter>
        </Card>
    )
}
