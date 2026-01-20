import { forwardRef } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@schedules/components/table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CheckCircle2, HelpCircle, RefreshCw, MoreHorizontal, Hand } from "lucide-react";

// Tipos para el resultado de validación
export type ValidationStatus = 'to_create' | 'exists' | 'ambiguous' | 'manual';

export interface ValidationResult {
    id: string;
    inputName: string;
    status: ValidationStatus;
    meeting_id?: string;
    join_url?: string;
    matchedTopic?: string;
    ambiguousCandidates?: Array<{
        meeting_id: string;
        topic: string;
        join_url?: string;
        host_id?: string;
    }>;
    host_id?: string;
}

// Estilos de badge por status
const badgeStyles = {
    to_create: "border-green-600 text-green-600 bg-green-50 dark:bg-green-950/20 dark:border-green-500 dark:text-green-400 cursor-pointer hover:bg-green-100",
    exists: "text-muted-foreground cursor-pointer hover:bg-gray-100",
    manual: "border-blue-500/50 text-blue-600 bg-blue-500/10 dark:text-blue-400 cursor-pointer hover:bg-blue-500/20",
    ambiguous: "border-orange-500/50 text-orange-600 bg-orange-500/10 dark:text-orange-400 cursor-pointer hover:bg-orange-500/20",
} as const;

const badgeIcons = {
    to_create: CheckCircle2,
    exists: RefreshCw,
    manual: Hand,
    ambiguous: HelpCircle,
} as const;

const badgeLabels = {
    to_create: "New",
    exists: "Exists",
    manual: "Manual",
    ambiguous: "Ambiguous",
} as const;

// Componente de Badge reutilizable
const StatusBadge = forwardRef<HTMLDivElement, { status: ValidationStatus } & React.HTMLAttributes<HTMLDivElement>>(({ status, ...props }, ref) => {
    const Icon = badgeIcons[status];
    return (
        <Badge variant="outline" className={badgeStyles[status]} ref={ref} {...props}>
            <Icon />
            {badgeLabels[status]}
        </Badge>
    );
});
StatusBadge.displayName = "StatusBadge";

// Columnas para la tabla de validación en CreateLinkModal
export const getCreateLinkColumns = (
    hostMap: Map<string, string> = new Map(),
    onSelectCandidate?: (rowId: string, candidate: { meeting_id: string; topic: string; join_url?: string; host_id?: string } | null) => void
): ColumnDef<ValidationResult>[] => [
        {
            id: "select",
            size: 36,
            header: ({ table }) => (
                <div className="flex justify-center items-center mb-1">
                    <Checkbox
                        checked={table.getIsAllPageRowsSelected()}
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                        className="translate-y-[2px]"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="flex justify-center">
                    <Checkbox
                        checked={row.getIsSelected()}
                        disabled={!row.getCanSelect()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                        className="translate-y-[2px] mb-1"
                    />
                </div>
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            accessorKey: "status",
            size: 120,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Status" className="justify-center" />
            ),
            cell: ({ row }) => {
                const status = row.getValue("status") as ValidationStatus;
                const result = row.original;
                const badge = <StatusBadge status={status} />;

                // Si es ambiguo o manual (que viene de ambiguo), mostrar popover
                if ((status === 'ambiguous' || (status === 'manual' && result.ambiguousCandidates && result.ambiguousCandidates.length > 0))) {
                    const candidates = result.ambiguousCandidates || [];

                    if (candidates.length > 0) {
                        return (
                            <div className="flex justify-center">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        {badge}
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 rounded-lg" onWheel={(e) => e.stopPropagation()}>
                                        <div className="p-4 space-y-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="font-semibold text-sm">
                                                    {status === 'manual' ? 'Manual Selection' : 'Multiple Matches Found'}
                                                </h4>
                                                <Badge variant="secondary" className="text-xs">{candidates.length} options</Badge>
                                            </div>
                                            <div className="space-y-2 max-h-[280px] overflow-y-auto no-scrollbar">
                                                {candidates.map((cand, i) => {
                                                    const isSelected = result.meeting_id === cand.meeting_id;
                                                    return (
                                                        <div
                                                            key={i}
                                                            className={`border rounded-md p-2.5 transition-colors cursor-pointer ${isSelected ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20' : 'hover:bg-accent/50'}`}
                                                            onClick={() => {
                                                                if (isSelected) {
                                                                    onSelectCandidate?.(result.id, null);
                                                                } else {
                                                                    onSelectCandidate?.(result.id, cand);
                                                                }
                                                            }}
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-medium text-sm mb-1">{cand.topic}</div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        ID: {cand.meeting_id}
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground truncate">
                                                                        Host: {hostMap.get(cand.host_id || '') || cand.host_id}
                                                                    </div>
                                                                </div>
                                                                {isSelected && (
                                                                    <Badge variant="outline" className="border-green-600 text-green-600 bg-green-50 dark:bg-green-950/20">
                                                                        Selected
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        );
                    }
                }

                // Si existe, mostrar popover con detalles del meeting
                if (status === 'exists' && result.meeting_id) {
                    return (
                        <div className="flex justify-center">
                            <Popover>
                                <PopoverTrigger asChild>
                                    {badge}
                                </PopoverTrigger>
                                <PopoverContent className="w-72 p-0 rounded-lg" onWheel={(e) => e.stopPropagation()}>
                                    <div className="p-4">
                                        <h4 className="font-semibold text-sm mb-3">Existing Meeting</h4>
                                        <div className="space-y-2.5">
                                            <div>
                                                <div className="text-xs font-medium text-muted-foreground mb-1">Topic</div>
                                                <div className="text-sm">{result.matchedTopic || result.inputName}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs font-medium text-muted-foreground mb-1">Meeting ID</div>
                                                <div className="text-sm font-mono">
                                                    {result.meeting_id}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs font-medium text-muted-foreground mb-1">Host</div>
                                                <div className="text-sm">
                                                    {hostMap.get(result.host_id || '') || result.host_id || '—'}
                                                </div>
                                            </div>
                                            {result.join_url && (
                                                <div>
                                                    <div className="text-xs font-medium text-muted-foreground mb-1">Join URL</div>
                                                    <div className="text-sm">
                                                        <a
                                                            href={result.join_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:underline truncate block"
                                                        >
                                                            {result.join_url}
                                                        </a>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    );
                }

                return <div className="flex justify-center">{badge}</div>;
            },
        },
        {
            accessorKey: "inputName",
            size: 400,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Program" />
            ),
            cell: ({ row }) => (
                <div className="truncate max-w-[380px]">{row.getValue("inputName")}</div>
            ),
        },
        {
            accessorKey: "meeting_id",
            size: 130,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Meeting ID" className="justify-center" />
            ),
            cell: ({ row }) => {
                const meetingId = row.getValue("meeting_id") as string | undefined;
                if (!meetingId) return <div className="text-center font-mono">—</div>;
                return (
                    <div className="text-center font-mono">
                        <a
                            href={`https://zoom.us/meeting/${meetingId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline"
                        >
                            {meetingId}
                        </a>
                    </div>
                );
            },
        },
        {
            id: "actions",
            size: 50,
            cell: () => {
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
                                <DropdownMenuItem>
                                    Copy details
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            },
        },
    ];
