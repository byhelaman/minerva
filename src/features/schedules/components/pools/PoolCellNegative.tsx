import type { FC } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PoolCellNegativeProps {
    blockedInstructors: string[];
    maxVisibleTags?: number;
}

export const PoolCellNegative: FC<PoolCellNegativeProps> = ({
    blockedInstructors,
    maxVisibleTags = 3,
}) => {
    if (blockedInstructors.length === 0) {
        return <span className="text-muted-foreground text-xs italic">None</span>;
    }

    const firstBadges = blockedInstructors.slice(0, maxVisibleTags);
    const hiddenCount = Math.max(blockedInstructors.length - maxVisibleTags, 0);

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
            {hiddenCount > 0 && (
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
                        className="w-80"
                        align="start"
                        onWheel={(e) => e.stopPropagation()}
                    >
                        <div className="space-y-4">
                            <h4 className="font-semibold text-sm leading-none">
                                Blocked Instructors
                            </h4>
                            <ScrollArea className="max-h-60 pr-3">
                                <div className="flex flex-wrap gap-1.5">
                                    {blockedInstructors.map((instructor) => (
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
        </div>
    );
};
