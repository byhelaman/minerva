import { useState } from "react"
import { ChartAreaInteractive } from "./ChartAreaInteractive"
import { ChartBarMultiple } from "./ChartBarMultiple"
import { ChartBarLabelCustom } from "./ChartBarLabelCustom"
import { ChartPieDonutText } from "./ChartPieDonutText"

export function StatisticsPage() {
    const [timeRange, setTimeRange] = useState("90d")

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex py-8 my-4 justify-between items-center">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-bold tracking-tight">Statistics</h1>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        Overview of key metrics and trends.
                    </div>
                </div>
            </div>
            <div className="flex-1 overflow-auto min-h-0 pb-6 pr-4">
                <ChartAreaInteractive timeRange={timeRange} onTimeRangeChange={setTimeRange} />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    <ChartBarMultiple timeRange={timeRange} />
                    <ChartBarLabelCustom timeRange={timeRange} />
                    <ChartPieDonutText timeRange={timeRange} />
                </div>
            </div>
        </div>
    )
}
