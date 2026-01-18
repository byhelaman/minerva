import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "./data-table-column-header";
import { Schedule } from "@schedules/utils/excel-parser";
import { Checkbox } from "@/components/ui/checkbox";
import { XCircle, RefreshCw, AlertCircle, BadgeCheckIcon, MoreHorizontal, Check, ChevronsUpDown, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ZoomMeetingCandidate } from "@/features/matching/services/matcher";

// Definir la estructura de los datos de asignación
// Esto extiende Schedule pero se centra en el aspecto de la asignación
export interface AssignmentRow extends Schedule {
    id: string; // ID único para la fila (podría ser la clave del horario)
    meetingId: string; // Marcador de posición por ahora, tal vez ID de reunión de Zoom o ID de enlace
    time: string; // Hora combinada/formateada
    // instructor: string; // Ya en Schedule
    // program: string; // Ya en Schedule
    status: 'assigned' | 'to_update' | 'not_found' | 'ambiguous';
    reason: string; // Mensaje corto para la columna Reason
    detailedReason?: string; // Mensaje detallado para el hover card
    originalSchedule: Schedule; // Mantener referencia a los datos originales
    matchedCandidate?: ZoomMeetingCandidate; // Assigned meeting details
    ambiguousCandidates?: ZoomMeetingCandidate[]; // List of ambiguous options
}

// Modificado para aceptar lista dinámica de instructores y mapa de hosts
export const getAssignmentColumns = (
    instructorsList: string[] = [],
    hostMap: Map<string, string> = new Map()
): ColumnDef<AssignmentRow>[] => [

        {
            id: "select",
            size: 40,
            header: ({ table }) => (
                <div className="flex justify-center items-center mb-1 w-7">
                    <Checkbox
                        checked={
                            table.getIsAllPageRowsSelected() ||
                            (table.getIsSomePageRowsSelected() && "indeterminate")
                        }
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
            accessorKey: "meetingId",
            size: 120,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Meeting ID" className="text-center" />
            ),
            cell: ({ row }) => <div className="font-mono text-center min-w-[100px]">{row.getValue("meetingId") || "—"}
            </div>,
            enableSorting: false,
        },
        {
            accessorKey: "time",
            size: 120,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Time" className="justify-center" />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("time")}</div>,
            enableColumnFilter: false,
            enableGlobalFilter: false,
        },
        {
            accessorKey: "instructor",
            size: 200,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Instructor" />
            ),
            cell: ({ row }) => {
                return (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                className="w-full max-w-[180px] justify-between gap-2 px-3 rounded-lg"
                            >
                                <span className="truncate font-normal">
                                    {row.getValue("instructor") || "Select instructor"}
                                </span>
                                <ChevronsUpDown className="text-muted-foreground" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search instructor..." />
                                <CommandList>
                                    <CommandEmpty>No instructor found.</CommandEmpty>
                                    <CommandGroup className="max-h-[300px] overflow-y-auto">
                                        {instructorsList.map((instructor) => (
                                            <CommandItem
                                                key={instructor}
                                                value={instructor}
                                            >
                                                <Check
                                                    className={
                                                        row.getValue("instructor") === instructor
                                                            ? "opacity-100"
                                                            : "opacity-0"
                                                    }
                                                />
                                                <span className="truncate">{instructor}</span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                );
            },
        },
        {
            accessorKey: "program",
            size: 350,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Program" />
            ),
            cell: ({ row }) => (
                <div className="truncate max-w-[320px]">
                    {row.getValue("program")}
                </div>
            ),
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Status" />
            ),
            cell: ({ row }) => {
                const status = row.getValue("status") as string;
                const matched = row.original.matchedCandidate;
                const ambiguous = row.original.ambiguousCandidates;

                let badge;
                if (status === 'assigned') {
                    badge = (
                        <Badge variant="outline" className="border-green-600 text-green-600 bg-green-50 dark:bg-green-950/20 dark:border-green-500 dark:text-green-400 cursor-pointer hover:bg-green-100 user-select-none">
                            <BadgeCheckIcon />
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
                        <Badge variant="outline" className="text-muted-foreground cursor-pointer hover:bg-gray-100">
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
                } else {
                    badge = (
                        <Badge variant="outline">
                            <AlertCircle />
                            {status}
                        </Badge>
                    );
                }

                return (
                    <Popover modal={true}>
                        <PopoverTrigger asChild>
                            {badge}
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0 rounded-lg">
                            <div className="p-4 space-y-4">
                                {status === 'not_found' ? (
                                    <>
                                        <div>
                                            <h4 className="font-semibold text-sm text-destructive mb-3">Not Found</h4>
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="text-xs font-medium text-muted-foreground mb-1">Reason</div>
                                                    <div className="text-sm">{row.original.reason || "No match found"}</div>
                                                </div>
                                                {row.original.detailedReason && (
                                                    <div className="pt-3 border-t">
                                                        <div className="text-xs font-medium text-muted-foreground mb-2">Details</div>
                                                        <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                                                            {row.original.detailedReason}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                ) : status === 'ambiguous' && ambiguous && ambiguous.length > 0 ? (
                                    <>
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="font-semibold text-sm">Ambiguous Matches</h4>
                                                <Badge variant="secondary" className="text-xs">{ambiguous.length} options</Badge>
                                            </div>
                                            {row.original.detailedReason && (
                                                <div className="mb-4 pb-3 border-b">
                                                    <div className="text-xs font-medium text-muted-foreground mb-2">Details</div>
                                                    <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                                                        {row.original.detailedReason}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="space-y-2 max-h-[280px] overflow-y-auto no-scrollbar">
                                                {ambiguous.map((cand, i) => (
                                                    <div key={i} className="border rounded-md p-2.5 hover:bg-accent/50 transition-colors">
                                                        <div className="font-medium text-sm mb-1">{cand.topic}</div>
                                                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                                                            <span className="text-nowrap">ID: {cand.meeting_id}</span>
                                                            <span className="truncate">Host: {hostMap.get(cand.host_id) || cand.host_id}</span>
                                                        </div>
                                                    </div>
                                                ))}
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
                                                    <div className="text-sm font-mono">{matched.meeting_id}</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs font-medium text-muted-foreground mb-1">Start Time</div>
                                                    <div className="text-sm">{matched.start_time}</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs font-medium text-muted-foreground mb-1">Host ID</div>
                                                    <div className="text-sm font-mono text-xs truncate" title={matched.host_id}>{hostMap.get(matched.host_id) || matched.host_id}</div>
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
            },
            // enableColumnFilter: false,
            enableGlobalFilter: false,
        },
        {
            accessorKey: "reason",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Reason" />
            ),
            cell: ({ row }) => (
                <div className="max-w-[200px] truncate text-muted-foreground" title={row.getValue("reason")}>
                    {row.getValue("reason")}
                </div>
            ),
        },
        {
            id: "actions",
            size: 50,
            cell: () => (
                <div className="flex justify-center">
                    <Button variant="ghost" size="icon-sm">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </div>
            ),
        },
    ];
