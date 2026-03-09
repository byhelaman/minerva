import type { FC } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WEEKDAY_OPTIONS } from "@/features/schedules/utils/weekdays";

interface PoolCellPositiveProps {
    allowedInstructors: string[];
    allowedInstructorsByDay: Partial<Record<number, string[]>>;
    maxVisibleTags?: number;
}

export const PoolCellPositive: FC<PoolCellPositiveProps> = ({
    allowedInstructors,
    allowedInstructorsByDay,
    maxVisibleTags = 3,
}) => {
    const hasByDay = Object.values(allowedInstructorsByDay).some((list) => list && list.length > 0);
    const hasAnyPositive = allowedInstructors.length > 0 || hasByDay;

    if (!hasAnyPositive) {
        return <span className="text-muted-foreground text-xs italic">Any</span>;
    }

    const firstBadges = allowedInstructors.slice(0, maxVisibleTags);
    const hiddenCount = Math.max(allowedInstructors.length - maxVisibleTags, 0);

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {firstBadges.map((instructor) => (
                <Badge
                    key={instructor}
                    variant="outline"
                >
                    {instructor}
                </Badge>
            ))}
            {hiddenCount > 0 && !hasByDay && (
                <Popover modal={false}>
                    <PopoverTrigger asChild>
                        <Badge
                            variant="secondary"
                            className="cursor-pointer hover:bg-secondary/80 user-select-none"
                        >
                            +{hiddenCount} more
                        </Badge>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-80 p-0 rounded-lg z-200 pointer-events-auto"
                        align="start"
                        onWheel={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 space-y-4">
                            <h4 className="font-semibold text-sm">
                                General Pool
                            </h4>
                            <ScrollArea className="max-h-60 pr-3">
                                <div className="flex flex-wrap gap-1.5">
                                    {allowedInstructors.map((instructor) => (
                                        <Badge
                                            key={instructor}
                                            variant="outline"
                                        >
                                            {instructor}
                                        </Badge>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    </PopoverContent>
                </Popover>
            )}
            {hasByDay && (
                <Popover modal={false}>
                    <PopoverTrigger asChild>
                        <Badge
                            variant="secondary"
                            className="cursor-pointer hover:bg-secondary/80 user-select-none"
                        >
                            {hiddenCount > 0 ? `+${hiddenCount} & rules by day` : "Rules by day"}
                        </Badge>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        onWheel={(e) => e.stopPropagation()}
                    >
                        <div className="space-y-4">
                            <ScrollArea className="max-h-72">
                                <div className="space-y-4">
                                    {allowedInstructors.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="font-semibold text-sm">
                                                General Pool
                                            </h4>
                                            <div className="flex flex-wrap gap-1.5">
                                                {allowedInstructors.map((instructor) => (
                                                    <Badge
                                                        key={instructor}
                                                        variant="outline">
                                                        {instructor}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        {WEEKDAY_OPTIONS.map((day) => {
                                            const instructors = allowedInstructorsByDay[day.value];
                                            if (!instructors || instructors.length === 0) return null;
                                            return (
                                                <div key={day.value} className="space-y-2">
                                                    <h4 className="font-medium text-xs text-muted-foreground">
                                                        {day.label}
                                                    </h4>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {instructors.map((instructor) => (
                                                            <Badge
                                                                key={`day-${day.value}-${instructor}`}
                                                                variant="outline"
                                                            >
                                                                {instructor}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </ScrollArea>
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
};
