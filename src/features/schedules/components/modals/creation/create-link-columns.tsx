import { forwardRef } from "react";
import { format } from "date-fns";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@schedules/components/table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CheckCircle2, HelpCircle, RefreshCw, MoreHorizontal, Hand, Plus, Undo2, CalendarDays, Clock2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { formatTimestampForDisplay, cn } from "@/lib/utils";
import { InstructorSelector } from "../InstructorSelector";
import type { Instructor } from "@schedules/hooks/useInstructors";

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
    created_at?: string; // ISO date string for when the meeting was created
    forcedNew?: boolean; // Indica que fue marcado manualmente como nuevo desde ambiguous
    previousMatch?: { // Guarda el match original cuando se marca como nuevo desde exists
        meeting_id: string;
        join_url?: string;
        matchedTopic?: string;
        host_id?: string;
    };
    start_time?: string; // HH:MM format for daily meetings
    selected_date?: string; // YYYY-MM-DD format for daily meetings (optional, defaults to today)
    selected_host?: string; // Selected host name for daily meetings (optional)
    selected_host_email?: string; // Selected host email for daily meetings
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

export const getCreateLinkColumns = (
    hostMap: Map<string, string> = new Map(),
    onSelectCandidate?: (rowId: string, candidate: { meeting_id: string; topic: string; join_url?: string; host_id?: string } | null) => void,
    onMarkAsNew?: (rowId: string) => void,
    onRevertToAmbiguous?: (rowId: string) => void,
    onRevertToExists?: (rowId: string) => void,
    dailyOnly?: boolean,
    onDateChange?: (rowId: string, date: string) => void,
    onTimeChange?: (rowId: string, time: string) => void,
    onHostChange?: (rowId: string, host: string, email: string, id: string) => void,
    hostsList?: Instructor[]
): ColumnDef<ValidationResult>[] => [
        {
            id: "select",
            size: 36,
            header: ({ table }) => (
                <div className="flex justify-center items-center mb-1 w-[36px]">
                    <Checkbox
                        checked={table.getIsAllPageRowsSelected()}
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                        className="translate-y-[2px]"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="flex justify-center w-[36px]">
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
                                            {onMarkAsNew && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full mt-3 border-dashed"
                                                    onClick={() => onMarkAsNew(result.id)}
                                                >
                                                    <Plus />
                                                    Create New
                                                </Button>
                                            )}
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
                                            <div>
                                                <div className="text-xs font-medium text-muted-foreground mb-1">Created At</div>
                                                <div className="text-sm">
                                                    {result.created_at
                                                        ? formatTimestampForDisplay(result.created_at)
                                                        : '—'}
                                                </div>
                                            </div>
                                        </div>
                                        {onMarkAsNew && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full mt-3 border-dashed"
                                                onClick={() => onMarkAsNew(result.id)}
                                            >
                                                <Plus />
                                                Create New Instead
                                            </Button>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    );
                }

                // Si es to_create con forcedNew, mostrar popover con opción de revertir
                // Soporta ambiguousCandidates (revert to ambiguous) O previousMatch (revert to exists)
                if (status === 'to_create' && result.forcedNew) {
                    const hasAmbiguous = result.ambiguousCandidates && result.ambiguousCandidates.length > 0 && onRevertToAmbiguous;
                    const hasPrevious = result.previousMatch && onRevertToExists;

                    if (hasAmbiguous || hasPrevious) {
                        return (
                            <div className="flex justify-center">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        {badge}
                                    </PopoverTrigger>
                                    <PopoverContent className="w-56 p-3 rounded-lg" onWheel={(e) => e.stopPropagation()}>
                                        <div className="space-y-3">
                                            <p className="text-sm text-muted-foreground">
                                                {hasAmbiguous
                                                    ? `This item was marked as new manually. ${result.ambiguousCandidates!.length} existing match${result.ambiguousCandidates!.length > 1 ? 'es' : ''} were ignored.`
                                                    : `This item was marked as new manually. The original match was: "${result.previousMatch!.matchedTopic}"`}
                                            </p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={() => hasAmbiguous ? onRevertToAmbiguous!(result.id) : onRevertToExists!(result.id)}
                                            >
                                                <Undo2 />
                                                Undo
                                            </Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        );
                    }
                }

                return <div className="flex justify-center">{badge}</div>;
            },
        },
        {
            accessorKey: "inputName",
            size: 320,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Program" />
            ),
            cell: ({ row }) => (
                <div className="truncate max-w-[300px]">{row.getValue("inputName")}</div>
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
        // Date & Time column - only visible when dailyOnly is true
        ...(dailyOnly ? [{
            id: "meeting_details",
            size: 170,
            header: () => (
                <div className="flex items-center justify-center gap-1 font-medium text-muted-foreground">
                    Meeting Details
                </div>
            ),
            cell: ({ row }: { row: any }) => {
                const result = row.original as ValidationResult;

                if (result.status !== 'to_create') {
                    return <div className="text-center text-muted-foreground">—</div>;
                }

                const selectedDate = result.selected_date
                    ? new Date(result.selected_date + 'T00:00:00')
                    : undefined;

                const hasDate = !!selectedDate;
                const hasTime = !!result.start_time;
                const dateDisplay = hasDate ? format(selectedDate, 'dd/MM/yyyy') : 'Today';
                const timeDisplay = hasTime ? result.start_time : '09:00';

                return (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                    "h-8 w-full justify-between text-left font-normal",
                                    !hasDate && !hasTime && "text-muted-foreground"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <CalendarDays className="opacity-50" />
                                    <span className="truncate flex gap-1.5">
                                        <span className={cn(!hasDate && hasTime && "text-muted-foreground")}>{dateDisplay}</span>
                                        <span className={cn(!hasTime && hasDate && "text-muted-foreground")}>{timeDisplay}</span>
                                    </span>
                                </div>
                                <ChevronDown className="opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                            <div className="border-b p-3">
                                <Field className="gap-2">
                                    <FieldLabel htmlFor={`time-${result.id}`}>
                                        <div className="w-full flex items-center justify-between">
                                            <span>Start Time</span>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => {
                                                    onTimeChange?.(result.id, '');
                                                    onDateChange?.(result.id, '');
                                                    onHostChange?.(result.id, '', '', '');
                                                }}
                                                className="h-6 w-6"
                                            >
                                                <RefreshCw className="size-3.5" />
                                            </Button>
                                        </div>
                                    </FieldLabel>
                                    <InputGroup>
                                        <InputGroupInput
                                            id={`time-${result.id}`}
                                            type="time"
                                            value={result.start_time || '09:00'}
                                            onChange={(e) => onTimeChange?.(result.id, e.target.value)}
                                            className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                        />
                                        <InputGroupAddon>
                                            <Clock2 className="text-muted-foreground" />
                                        </InputGroupAddon>
                                        <InputGroupAddon align="inline-end">
                                            45min
                                        </InputGroupAddon>
                                    </InputGroup>
                                    {(!hasDate || !hasTime) && (
                                        <FieldDescription className="text-xs">
                                            Defaults: {!hasDate && 'Today'}{!hasDate && !hasTime && ', '}{!hasTime && '09:00'}
                                        </FieldDescription>
                                    )}
                                </Field>
                            </div>
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={(date) => {
                                    if (date) {
                                        const y = date.getFullYear();
                                        const m = String(date.getMonth() + 1).padStart(2, '0');
                                        const d = String(date.getDate()).padStart(2, '0');
                                        onDateChange?.(result.id, `${y}-${m}-${d}`);
                                    }
                                }}
                                disabled={{ before: new Date() }}
                                className="[--cell-size:--spacing(7.5)]"
                            />
                            <div className="border-t p-3 bg-muted/20">
                                <Field className="gap-2">
                                    <FieldLabel>Host</FieldLabel>
                                    <InstructorSelector
                                        value={result.selected_host || ''}
                                        onChange={(host, email, id) => onHostChange?.(result.id, host, email, id)}
                                        instructors={hostsList || []}
                                        popoverClassName="max-w-[200px]"
                                    />
                                </Field>
                            </div>
                        </PopoverContent>
                    </Popover>
                );
            },
        } as ColumnDef<ValidationResult>] : []),
        {
            id: "actions",
            size: 50,
            cell: ({ row }) => {
                const result = row.original;
                const hasJoinUrl = !!result.join_url;

                const handleCopyJoinUrl = async () => {
                    if (!result.join_url) return;
                    await navigator.clipboard.writeText(result.join_url);
                    toast.success("Join URL copied to clipboard");
                };

                return (
                    <div className="flex justify-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onClick={handleCopyJoinUrl}
                                    disabled={!hasJoinUrl}
                                >
                                    Copy join URL
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            },
        },
    ];
