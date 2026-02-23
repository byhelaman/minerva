import { Loader2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"
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
    count: {
        label: "Incidencias",
        color: "hsl(217, 91%, 60%)",
    },
    label: {
        color: "var(--background)",
    },
} satisfies ChartConfig

interface TypeRow {
    type: string
    count: number | string
}

interface TypeData {
    type: string
    count: number
}

interface Props {
    timeRange: string
}

const transform = (rows: TypeRow[]): TypeData[] =>
    rows.map((row) => ({ type: row.type, count: Number(row.count) }))

export function ChartBarLabelCustom({ timeRange }: Props) {
    const { data: chartData, loading } = useChartData<TypeRow, TypeData>(
        "get_incidence_types",
        timeRange,
        transform,
    )

    const total = chartData.reduce((sum, d) => sum + d.count, 0)
    const periodLabel = PERIOD_LABELS[timeRange] || "últimos 3 meses"

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
