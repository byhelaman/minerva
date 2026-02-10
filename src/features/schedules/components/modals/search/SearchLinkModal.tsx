import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScheduleDataTable } from "@schedules/components/table/ScheduleDataTable";
import { useZoomStore } from "@/features/matching/stores/useZoomStore";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@schedules/components/table/data-table-column-header";
import { Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatTimestampForDisplay } from "@/lib/date-utils";

interface SearchLinkModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Tipo para las filas de la tabla
interface MeetingRow {
    id: string;
    meeting_id: string;
    topic: string;
    host_email: string;
    host_name: string;
    created_at: string;
    join_url?: string;
}

// Columnas para la tabla de búsqueda
const searchColumns: ColumnDef<MeetingRow>[] = [
    {
        id: "select",
        size: 36,
        header: () => (
            <div className="flex justify-center items-center mb-1">
                <Checkbox
                    disabled
                    aria-label="Select all"
                    className="translate-y-[2px]"
                />
            </div>
        ),
        cell: () => (
            <div className="flex justify-center">
                <Checkbox
                    disabled
                    aria-label="Select row"
                    className="translate-y-[2px] mb-1"
                />
            </div>
        ),
        enableSorting: false,
        enableHiding: false,
    },
    {
        accessorKey: "meeting_id",
        size: 120,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Meeting ID" className="text-center" />
        ),
        cell: ({ row }) => {
            const meetingId = row.getValue("meeting_id") as string;
            const isValidId = meetingId && meetingId !== "-" && meetingId !== "—";
            return (
                <div className="font-mono text-center min-w-[100px]">
                    {isValidId ? (
                        <a href={`https://zoom.us/meeting/${meetingId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline cursor-pointer underline underline-offset-2">
                            {meetingId}
                        </a>
                    ) : (
                        "—"
                    )}
                </div>
            );
        },
        enableSorting: false,
    },
    {
        accessorKey: "topic",
        size: 350,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Topic" />
        ),
        cell: ({ row }) => (
            <div className="truncate max-w-[320px]">
                {row.getValue("topic")}
            </div>
        ),
    },
    {
        accessorKey: "host_name",
        size: 130,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Host" />
        ),
        cell: ({ row }) => (
            <div className="truncate max-w-[120px]">{row.getValue("host_name")}</div>
        ),
    },
    {
        accessorKey: "created_at",
        size: 160,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Created At" className="justify-center" />
        ),
        cell: ({ row }) => {
            const val = row.getValue("created_at") as string;
            if (!val) return <div className="text-center text-muted-foreground">Unknown</div>;
            return (
                <div className="text-center">
                    {formatTimestampForDisplay(val)}
                </div>
            );
        },
    },
    {
        id: "actions",
        size: 50,
        cell: ({ row }) => {
            const meeting = row.original;
            const hasJoinUrl = !!meeting.join_url;

            const handleCopyDetails = async () => {
                const details = meeting.join_url
                    ? `${meeting.topic}\n${meeting.join_url}`
                    : meeting.topic;
                await navigator.clipboard.writeText(details);
                toast.success("Details copied to clipboard");
            };

            return (
                <div className="flex justify-center">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onClick={handleCopyDetails}
                                disabled={!hasJoinUrl}
                            >
                                Copy details
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            );
        },
    },
];

export function SearchLinkModal({ open, onOpenChange }: SearchLinkModalProps) {
    const { meetings, users, isLoadingData, fetchZoomData } = useZoomStore();
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Crear mapa de usuarios para lookup rápido
    const userMap = useMemo(() => {
        const map = new Map<string, { email: string; display_name: string }>();
        users.forEach(user => {
            map.set(user.id, { email: user.email, display_name: user.display_name });
        });
        return map;
    }, [users]);

    // Transformar meetings a filas de tabla
    const tableData: MeetingRow[] = useMemo(() => {
        return meetings.map(meeting => {
            const host = userMap.get(meeting.host_id);
            return {
                id: meeting.meeting_id,
                meeting_id: meeting.meeting_id,
                topic: meeting.topic,
                host_email: host?.email || 'Unknown',
                host_name: host?.display_name || 'Unknown',
                created_at: meeting.created_at || meeting.start_time,
                join_url: meeting.join_url,
            };
        });
    }, [meetings, userMap]);

    // Handler para refresh
    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await fetchZoomData();
        } finally {
            setIsRefreshing(false);
        }
    };

    const isLoading = isLoadingData || isRefreshing;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl! max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Search Meetings</DialogTitle>
                    <DialogDescription>
                        Search for existing meetings.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden pr-2">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center gap-2 h-full border border-dashed rounded-lg bg-muted/10 p-8 min-h-[400px]">
                            <div className="relative flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-sm font-medium">Loading meetings...</p>
                                <p className="text-xs text-muted-foreground">
                                    Fetching data from Zoom. This may take a moment.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <ScheduleDataTable
                            columns={searchColumns}
                            data={tableData}
                            onRefresh={handleRefresh}
                            hideFilters
                            hideUpload
                            hideActions
                            hideOverlaps
                            enableRowSelection={false}
                            initialPageSize={100}
                        />
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>

            </DialogContent>
        </Dialog>
    );
}

