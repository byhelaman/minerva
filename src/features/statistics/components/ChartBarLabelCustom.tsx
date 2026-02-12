import * as React from "react"
import { Loader2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

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
        label: "Incidencias",
        color: "hsl(217, 91%, 60%)",
    },
    label: {
        color: "var(--background)",
    },
} satisfies ChartConfig

interface TypeData {
    type: string
    count: number
}

interface Props {
    timeRange: string
}

export function ChartBarLabelCustom({ timeRange }: Props) {
    const [chartData, setChartData] = React.useState<TypeData[]>([])
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

                const { data, error } = await supabase.rpc("get_incidence_types", {
                    p_start_date: startStr,
                    p_end_date: endStr,
                })

                if (error) throw error

                const result: TypeData[] = (data || []).map((row: any) => ({
                    type: row.type,
                    count: Number(row.count),
                }))

                setChartData(result)
            } catch (e) {
                console.error("Failed to fetch incidence types:", e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [timeRange])

    const total = chartData.reduce((sum, d) => sum + d.count, 0)
    const periodLabels: Record<string, string> = { "7d": "últimos 7 días", "30d": "últimos 30 días", "90d": "últimos 3 meses", "180d": "últimos 6 meses", "365d": "último año" }
    const periodLabel = periodLabels[timeRange] || "últimos 3 meses"

    return (
        <Card className="shadow-none">
            <CardHeader>
                <CardTitle>Tipos de Incidencias</CardTitle>
                <CardDescription>Distribución por tipo</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center h-[200px]">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <ChartContainer config={chartConfig}>
                        <BarChart
                            accessibilityLayer
                            data={chartData}
                            layout="vertical"
                            margin={{
                                right: 16,
                            }}
                        >
                            <CartesianGrid horizontal={false} />
                            <YAxis
                                dataKey="type"
                                type="category"
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                                hide
                            />
                            <XAxis dataKey="count" type="number" hide />
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent indicator="line" />}
                            />
                            <Bar
                                dataKey="count"
                                layout="vertical"
                                fill="var(--color-count)"
                                radius={4}
                            >
                                <LabelList
                                    dataKey="type"
                                    position="insideLeft"
                                    offset={8}
                                    className="fill-(--color-label)"
                                    fontSize={12}
                                />
                                <LabelList
                                    dataKey="count"
                                    position="right"
                                    offset={8}
                                    className="fill-foreground"
                                    fontSize={12}
                                />
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                )}
            </CardContent>
            <CardFooter className="flex-col items-start gap-2 text-sm">
                <div className="flex gap-2 leading-none font-medium">
                    {total} incidencias totales
                </div>
                <div className="text-muted-foreground leading-none">
                    {periodLabel}
                </div>
            </CardFooter>
        </Card>
    )
}
