import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertCircle, XCircle, RefreshCw, HelpCircle, Hand, BadgeCheck } from "lucide-react";
import { AssignmentRow } from "../../modals/assignment/assignment-columns";
import type { ZoomMeetingCandidate } from "@/features/matching/types";
import { Row } from "@tanstack/react-table";
import { formatTimestampForDisplay } from "@/lib/date-utils";

interface StatusCellProps {
    row: Row<AssignmentRow>;
    hostMap: Map<string, string>;
    onSelectCandidate?: (rowId: string, candidate: ZoomMeetingCandidate) => void;
    onDeselectCandidate?: (rowId: string) => void;
    onAddStatusFilter?: (status: string) => void;
}

export function StatusCell({
    row,
    hostMap,
    onSelectCandidate,
    onDeselectCandidate,
}: StatusCellProps) {
    const status = row.getValue("status") as string;
    const matched = row.original.matchedCandidate;
    const ambiguous = row.original.ambiguousCandidates;

    let badge;
    if (status === 'assigned') {
        badge = (
            <Badge variant="outline" className="border-green-600 text-green-600 bg-green-50 dark:bg-green-950/20 dark:border-green-500 dark:text-green-400 cursor-pointer hover:bg-green-100 dark:hover:bg-green-500/20 user-select-none">
                <BadgeCheck />
                Assigned
            </Badge>
        );
    } else if (status === 'not_found') {
        badge = (
            <Badge variant="outline" className="border-destructive/50 text-destructive cursor-pointer bg-destructive/5 dark:border-destructive/50">
                <XCircle />
                Not Found
            </Badge>
        );
    } else if (status === 'to_update') {
        badge = (
            <Badge variant="outline" className="text-muted-foreground cursor-pointer hover:bg-gray-100/10">
                <RefreshCw />
                To Update
            </Badge>
        );
    } else if (status === 'ambiguous') {
        badge = (
            <Badge variant="outline" className="border-orange-500/50 text-orange-600 bg-orange-500/10 dark:text-orange-400 cursor-pointer hover:bg-orange-500/20">
                <HelpCircle />
                Ambiguo
            </Badge>
        );
    } else if (status === 'manual') {
        badge = (
            <Badge variant="outline" className="border-blue-500/50 text-blue-600 bg-blue-500/10 dark:text-blue-400 cursor-pointer hover:bg-blue-500/20">
                <Hand />
                Manual
            </Badge>
        );
    } else {
        badge = (
            <Badge variant="outline">
                <AlertCircle />
                {status}
            </Badge>
        );
    }

    return (
        <Popover modal={false}>
            <PopoverTrigger asChild>
                {badge}
            </PopoverTrigger>
            <PopoverContent
                className="w-80 p-0 rounded-lg z-200 pointer-events-auto"
                onWheel={(e) => e.stopPropagation()}
            >
                <div className="p-4 space-y-4">
                    {status === 'not_found' ? (
                        <>
                            <div>
                                <h4 className="font-semibold text-sm text-destructive mb-3">Not Found</h4>
                                <div className="space-y-3">
                                    <div className="text-xs font-medium text-muted-foreground mb-2">Details</div>
                                    <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                                        {row.original.detailedReason || row.original.reason || "No meetings found for this schedule."}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (status === 'ambiguous' || status === 'manual') && ambiguous && ambiguous.length > 0 ? (
                        <>
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold text-sm">
                                        {status === 'manual' ? 'Manual Selection' : 'Ambiguous Matches'}
                                    </h4>
                                    <Badge variant="secondary" className="text-xs">{ambiguous.length} options</Badge>
                                </div>
                                {status === 'manual' && matched && (
                                    <div className="mb-4 pb-3 border-b">
                                        <div className="text-xs font-medium text-muted-foreground mb-2">Selected</div>
                                        <div className="text-sm font-medium">{matched.topic}</div>
                                    </div>
                                )}
                                {row.original.detailedReason && status === 'ambiguous' && (
                                    <div className="mb-4 pb-3 border-b">
                                        <div className="text-xs font-medium text-muted-foreground mb-2">Details</div>
                                        <div className="text-xs text-muted-foreground whitespace-pre-line">
                                            {row.original.detailedReason}
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-2 max-h-[280px] overflow-y-auto no-scrollbar">
                                    {ambiguous.map((cand, i) => {
                                        const isSelected = matched?.meeting_id === cand.meeting_id;
                                        return (
                                            <div
                                                key={i}
                                                className={`border rounded-md p-2.5 transition-colors cursor-pointer ${isSelected ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20' : 'hover:bg-accent/50'}`}
                                                onClick={() => {
                                                    if (isSelected && onDeselectCandidate) {
                                                        onDeselectCandidate(row.original.id);
                                                    } else if (!isSelected && onSelectCandidate) {
                                                        onSelectCandidate(row.original.id, cand);
                                                    }
                                                }}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-sm mb-1">{cand.topic}</div>
                                                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                                                            <span className="text-nowrap">ID: {cand.meeting_id}</span>
                                                            <span className="truncate">Host: {hostMap.get(cand.host_id) || cand.host_id}</span>
                                                        </div>
                                                    </div>
                                                    {isSelected && (
                                                        <Badge variant="outline" className="border-green-600 text-green-600 bg-green-50 dark:bg-green-950/20 dark:border-green-500 dark:text-green-400">
                                                            Selected
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    ) : matched ? (
                        <>
                            <div>
                                <h4 className="font-semibold text-sm mb-3">Meeting Assigned</h4>
                                <div className="space-y-2.5">
                                    <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Topic</div>
                                        <div className="text-sm">{matched.topic}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Meeting ID</div>
                                        <div className="text-sm font-mono">
                                            {matched.meeting_id}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Series end</div>
                                        <div className="text-sm">
                                            {matched.start_time
                                                ? formatTimestampForDisplay(matched.start_time)
                                                : '—'}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Host ID</div>
                                        <div className="text-sm font-mono truncate" title={matched.host_id}>{hostMap.get(matched.host_id) || matched.host_id}</div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-sm text-muted-foreground">No details available</div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
