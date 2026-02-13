import * as React from "react"
import { format } from "date-fns"
import { Loader2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

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
    classes: {
        label: "Clases",
        color: "hsl(210, 90%, 75%)",

    },
    incidences: {
        label: "Incidencias",
        color: "hsl(217, 91%, 60%)",
    },
} satisfies ChartConfig

interface BranchData {
    branch: string
    classes: number
    incidences: number
}

interface Props {
    timeRange: string
}

export function ChartBarBranch({ timeRange }: Props) {
    const [chartData, setChartData] = React.useState<BranchData[]>([])
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

                const startStr = format(startDate, 'yyyy-MM-dd')
                const endStr = format(now, 'yyyy-MM-dd')

                const { data, error } = await supabase.rpc("get_branch_stats", {
                    p_start_date: startStr,
                    p_end_date: endStr,
                })

                if (error) throw error

                const result: BranchData[] = (data || []).map((row: any) => {
                    const total = Number(row.total_classes)
                    const incidences = Number(row.incidences)
                    return {
                        branch: row.branch,
                        classes: total - incidences,
                        incidences,
                    }
                })

                setChartData(result)
            } catch (e) {
                console.error("Failed to fetch branch stats:", e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [timeRange])

    const totalClasses = chartData.reduce((sum, d) => sum + d.classes + d.incidences, 0)
    const totalIncidences = chartData.reduce((sum, d) => sum + d.incidences, 0)

    const periodLabels: Record<string, string> = { "7d": "últimos 7 días", "30d": "últimos 30 días", "90d": "últimos 3 meses", "180d": "últimos 6 meses", "365d": "último año" }
    const periodLabel = periodLabels[timeRange] || "últimos 3 meses"

    return (
        <Card className="shadow-none">
            <CardHeader>
                <CardTitle>Clases por Sede</CardTitle>
                <CardDescription>Clases e incidencias por sede</CardDescription>
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
                                dataKey="branch"
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                            />
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent indicator="dashed" />}
                            />
                            <Bar dataKey="classes" fill="var(--color-classes)" radius={4} />
                            <Bar dataKey="incidences" fill="var(--color-incidences)" radius={4} />
                        </BarChart>
                    </ChartContainer>
                )}
            </CardContent>
            <CardFooter className="flex-col items-start gap-2 text-sm">
                <div className="flex gap-2 leading-none font-medium">
                    {totalClasses} clases - {totalIncidences} incidencias
                </div>
                <div className="text-muted-foreground leading-none">
                    {periodLabel}
                </div>
            </CardFooter>
        </Card>
    )
}
