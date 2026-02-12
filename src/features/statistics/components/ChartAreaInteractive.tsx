import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { Loader2 } from "lucide-react"

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { supabase } from "@/lib/supabase"

const chartConfig = {
    schedules: {
        label: "Clases",
        color: "hsl(210, 90%, 75%)",
    },
    incidences: {
        label: "Incidencias",
        color: "hsl(217, 91%, 60%)",
    },
} satisfies ChartConfig

interface DailyStats {
    date: string
    schedules: number
    incidences: number
}

interface Props {
    timeRange: string
    onTimeRangeChange: (value: string) => void
}

export function ChartAreaInteractive({ timeRange, onTimeRangeChange }: Props) {
    const [chartData, setChartData] = React.useState<DailyStats[]>([])
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

                const { data, error } = await supabase.rpc("get_daily_stats", {
                    p_start_date: startStr,
                    p_end_date: endStr,
                })

                if (error) throw error

                const result: DailyStats[] = (data || []).map((row: any) => ({
                    date: row.date,
                    schedules: Number(row.total_classes),
                    incidences: Number(row.incidences),
                }))

                setChartData(result)
            } catch (e) {
                console.error("Failed to fetch area chart data:", e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [timeRange])

    return (
        <Card className="pt-0 shadow-none">
            <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
                <div className="grid flex-1 gap-1">
                    <CardTitle>Clases e Incidencias</CardTitle>
                    <CardDescription>
                        Actividad diaria durante el periodo seleccionado
                    </CardDescription>
                </div>
                <Select value={timeRange} onValueChange={onTimeRangeChange}>
                    <SelectTrigger
                        className="hidden w-[160px] rounded-lg sm:ml-auto sm:flex"
                        aria-label="Seleccionar periodo"
                    >
                        <SelectValue placeholder="Últimos 3 meses" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                        <SelectItem value="365d" className="rounded-lg">
                            Último año
                        </SelectItem>
                        <SelectItem value="180d" className="rounded-lg">
                            Últimos 6 meses
                        </SelectItem>
                        <SelectItem value="90d" className="rounded-lg">
                            Últimos 3 meses
                        </SelectItem>
                        <SelectItem value="30d" className="rounded-lg">
                            Últimos 30 días
                        </SelectItem>
                        <SelectItem value="7d" className="rounded-lg">
                            Últimos 7 días
                        </SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                {loading ? (
                    <div className="flex items-center justify-center h-[250px]">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <ChartContainer
                        config={chartConfig}
                        className="aspect-auto h-[250px] w-full"
                    >
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="fillSchedules" x1="0" y1="0" x2="0" y2="1">
                                    <stop
                                        offset="5%"
                                        stopColor="var(--color-schedules)"
                                        stopOpacity={0.8}
                                    />
                                    <stop
                                        offset="95%"
                                        stopColor="var(--color-schedules)"
                                        stopOpacity={0.1}
                                    />
                                </linearGradient>
                                <linearGradient id="fillIncidences" x1="0" y1="0" x2="0" y2="1">
                                    <stop
                                        offset="5%"
                                        stopColor="var(--color-incidences)"
                                        stopOpacity={0.8}
                                    />
                                    <stop
                                        offset="95%"
                                        stopColor="var(--color-incidences)"
                                        stopOpacity={0.1}
                                    />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                minTickGap={32}
                                tickFormatter={(value) => {
                                    const date = new Date(value)
                                    return date.toLocaleDateString("es", {
                                        month: "short",
                                        day: "numeric",
                                    })
                                }}
                            />
                            <ChartTooltip
                                cursor={false}
                                content={
                                    <ChartTooltipContent
                                        labelFormatter={(value) => {
                                            return new Date(value).toLocaleDateString("es", {
                                                month: "short",
                                                day: "numeric",
                                            })
                                        }}
                                        indicator="dot"
                                    />
                                }
                            />
                            <Area
                                dataKey="incidences"
                                type="natural"
                                fill="url(#fillIncidences)"
                                stroke="var(--color-incidences)"
                                stackId="a"
                            />
                            <Area
                                dataKey="schedules"
                                type="natural"
                                fill="url(#fillSchedules)"
                                stroke="var(--color-schedules)"
                                stackId="a"
                            />
                            <ChartLegend content={<ChartLegendContent />} />
                        </AreaChart>
                    </ChartContainer>
                )}
            </CardContent>
        </Card>
    )
}
