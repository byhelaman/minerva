import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@schedules/components/table/data-table-column-header";
import { Schedule } from "@schedules/utils/excel-parser";
import { Checkbox } from "@/components/ui/checkbox";
import { MoreHorizontal, Hand, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ZoomMeetingCandidate } from "@/features/matching/services/matcher";
import { StatusCell } from "@schedules/components/table/cells/StatusCell";
import { InstructorCell } from "@schedules/components/table/cells/InstructorCell";
import type { Instructor } from "@schedules/hooks/useInstructors";

// Definir la estructura de los datos de asignación
// Esto extiende Schedule pero se centra en el aspecto de la asignación
export interface AssignmentRow extends Schedule {
    id: string; // ID único para la fila (podría ser la clave del horario)
    meetingId: string; // Marcador de posición por ahora, tal vez ID de reunión de Zoom o ID de enlace
    time: string; // Hora combinada/formateada
    // instructor: string; // Ya en Schedule
    // program: string; // Ya en Schedule
    status: 'assigned' | 'to_update' | 'not_found' | 'ambiguous' | 'manual';
    reason: string; // Mensaje corto para la columna Reason
    detailedReason?: string; // Mensaje detallado para el hover card
    originalSchedule: Schedule; // Mantener referencia a los datos originales
    matchedCandidate?: ZoomMeetingCandidate; // Assigned meeting details
    ambiguousCandidates?: ZoomMeetingCandidate[]; // List of ambiguous options
    manualMode?: boolean; // Habilita edición manual de checkbox e instructor
    originalStatus?: 'assigned' | 'to_update' | 'not_found' | 'ambiguous' | 'manual'; // Status antes de edición manual
    found_instructor?: { id: string; email: string; display_name: string }; // Instructor encontrado en Zoom
}

// Modificado para aceptar lista dinámica de instructores, mapa de hosts, y callbacks
export const getAssignmentColumns = (
    instructorsList: Instructor[] = [],
    hostMap: Map<string, string> = new Map(),
    onInstructorChange?: (rowId: string, newInstructor: string, email: string, id: string) => void,
    onManualModeToggle?: (rowId: string) => void,
    onSelectCandidate?: (rowId: string, candidate: ZoomMeetingCandidate) => void,
    onDeselectCandidate?: (rowId: string) => void,
    onAddStatusFilter?: (status: string) => void,
    onResetRow?: (rowId: string) => void
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
            cell: ({ row }) => {
                // Usar getCanSelect() para consistencia con enableRowSelection de la tabla
                const canSelect = row.getCanSelect();
                return (
                    <div className={`flex justify-center ${!canSelect ? 'cursor-not-allowed' : ''}`}>
                        <Checkbox
                            checked={row.getIsSelected()}
                            onCheckedChange={(value) => row.toggleSelected(!!value)}
                            disabled={!canSelect}
                            aria-label="Select row"
                            className={`translate-y-[2px] mb-1 ${!canSelect ? 'opacity-50' : ''}`}
                        />
                    </div>
                );
            },
            enableSorting: false,
            enableHiding: false,
        },
        {
            accessorKey: "meetingId",
            size: 120,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Meeting ID" className="text-center" />
            ),
            cell: ({ row }) => {
                const meetingId = row.getValue("meetingId") as string;
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
            cell: ({ row }) => (
                <InstructorCell
                    row={row}
                    instructorsList={instructorsList}
                    onInstructorChange={onInstructorChange}
                />
            ),
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
            cell: ({ row }) => (
                <StatusCell
                    row={row}
                    hostMap={hostMap}
                    onSelectCandidate={onSelectCandidate}
                    onDeselectCandidate={onDeselectCandidate}
                    onAddStatusFilter={onAddStatusFilter}
                />
            ),
            filterFn: (row, id, value) => {
                if (value.includes(row.getValue(id))) return true;
                // Mantener filas en edición activa visibles si su status original coincide con el filtro
                if (row.original.manualMode && row.original.originalStatus) {
                    return value.includes(row.original.originalStatus);
                }
                return false;
            },
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
            cell: ({ row }) => {
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
                                    disabled={row.original.status === 'not_found' || row.original.status === 'ambiguous'}
                                    onClick={() => {
                                        if (onManualModeToggle) {
                                            onManualModeToggle(row.original.id);
                                        }
                                    }}
                                >
                                    {row.original.manualMode ? (
                                        <>
                                            <XCircle />
                                            Disable manual
                                        </>
                                    ) : (
                                        <>
                                            <Hand />
                                            Enable manual
                                        </>
                                    )}
                                </DropdownMenuItem>
                                {row.original.manualMode && (
                                    <DropdownMenuItem
                                        onClick={() => {
                                            if (onResetRow) {
                                                onResetRow(row.original.id);
                                            }
                                        }}
                                    >
                                        <RotateCcw />
                                        Reset match
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            },
        },
    ];
