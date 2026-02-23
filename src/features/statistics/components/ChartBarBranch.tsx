import { Loader2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { useChartData, PERIOD_LABELS } from "../hooks/useChartData"

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

interface BranchRow {
    branch: string
    total_classes: number | string
    incidences: number | string
}

interface BranchData {
    branch: string
    classes: number
    incidences: number
}

interface Props {
    timeRange: string
}

const transform = (rows: BranchRow[]): BranchData[] =>
    rows.map((row) => {
        const total = Number(row.total_classes)
        const incidences = Number(row.incidences)
        return { branch: row.branch, classes: total - incidences, incidences }
    })

export function ChartBarBranch({ timeRange }: Props) {
    const { data: chartData, loading } = useChartData<BranchRow, BranchData>(
        "get_branch_stats",
        timeRange,
        transform,
    )

    const totalClasses = chartData.reduce((sum, d) => sum + d.classes + d.incidences, 0)
    const totalIncidences = chartData.reduce((sum, d) => sum + d.incidences, 0)
    const periodLabel = PERIOD_LABELS[timeRange] || "últimos 3 meses"

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
