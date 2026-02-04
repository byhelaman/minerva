import * as React from "react";
import {
    flexRender,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type ColumnFiltersState,
    type SortingState,
    type VisibilityState,
} from "@tanstack/react-table";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";
import { detectOverlaps, getScheduleKey } from "@schedules/utils/overlap-utils";
import { Schedule } from "@schedules/utils/excel-parser";
import { cn } from "@/lib/utils";

interface ScheduleDataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[] | ((addStatusFilter: (status: string) => void) => ColumnDef<TData, TValue>[]);
    data: TData[];
    onUploadClick?: () => void;
    onClearSchedule?: () => void;
    onRefresh?: () => void;
    onSelectionChange?: (selectedRows: TData[]) => void;
    enableRowSelection?: boolean | ((row: TData) => boolean);
    controlledSelection?: Record<string, boolean>;
    onControlledSelectionChange?: (selection: Record<string, boolean>) => void;

    // Configuración unificada de filtros
    filterConfig?: {
        showStatus?: boolean;
        showIncidenceType?: boolean;
        showTime?: boolean;
        showBranch?: boolean; // Futuro
    };

    // Deprecated props (mantener temporalmente para migración gradual si se desea, o eliminar si vamos "all in")
    hideFilters?: boolean;
    hideUpload?: boolean;
    hideActions?: boolean;
    hideOverlaps?: boolean;
    disableRefresh?: boolean;
    initialPageSize?: number;
    statusOptions?: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }[];
    activeMeetingIds?: string[];
    activePrograms?: Set<string>;
    showLiveMode?: boolean;
    setShowLiveMode?: (show: boolean) => void;
    isLiveLoading?: boolean;
    liveTimeFilter?: string;
    liveDateFilter?: string;
    onPublish?: () => void;
    isPublishing?: boolean;
    canPublish?: boolean;
    initialColumnVisibility?: VisibilityState;

    // Legacy support
    showTypeFilter?: boolean;
    hideStatusFilter?: boolean;

    customActionItems?: React.ReactNode;
    hideDefaultActions?: boolean;
}

export function ScheduleDataTable<TData, TValue>({
    columns,
    data,
    onClearSchedule,
    onUploadClick,
    onRefresh,
    statusOptions,
    onPublish,
    isPublishing,
    canPublish,
    ...props
}: ScheduleDataTableProps<TData, TValue>) {
    // Use controlled selection if provided, otherwise use internal state
    const [internalSelection, setInternalSelection] = React.useState({});
    const isControlled = props.controlledSelection !== undefined;
    const rowSelection = isControlled ? props.controlledSelection! : internalSelection;
    const setRowSelection = isControlled
        ? (updater: React.SetStateAction<Record<string, boolean>>) => {
            const newValue = typeof updater === 'function' ? updater(rowSelection) : updater;
            props.onControlledSelectionChange?.(newValue);
        }
        : setInternalSelection;
    // Columna shift oculta por defecto, pero permite sobrescribir con props
    const [columnVisibility, setColumnVisibility] =
        React.useState<VisibilityState>({ shift: false, ...props.initialColumnVisibility });
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
        []
    );
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = React.useState("");
    const [showOverlapsOnly, setShowOverlapsOnly] = React.useState(false);

    // Aplicar/quitar filtros de tiempo y fecha cuando Live mode cambia
    React.useEffect(() => {
        if (props.showLiveMode && props.liveTimeFilter) {
            // Activar Live: aplicar filtros de hora y fecha actual
            setColumnFilters(prev => {
                const withoutTimeAndDate = prev.filter(f => f.id !== 'start_time' && f.id !== 'date');
                const newFilters = [...withoutTimeAndDate, { id: 'start_time', value: [props.liveTimeFilter] }];
                if (props.liveDateFilter) {
                    newFilters.push({ id: 'date', value: [props.liveDateFilter] });
                }
                return newFilters;
            });
        } else if (!props.showLiveMode) {
            // Desactivar Live: quitar filtros de hora y fecha
            setColumnFilters(prev => {
                const hasLiveFilters = prev.some(f => f.id === 'start_time' || f.id === 'date');
                if (hasLiveFilters) {
                    return prev.filter(f => f.id !== 'start_time' && f.id !== 'date');
                }
                return prev;
            });
        }
    }, [props.showLiveMode, props.liveTimeFilter, props.liveDateFilter]);

    // Función para agregar un status al filtro de status (solo expande filtros existentes)
    const addStatusFilter = React.useCallback((status: string) => {
        setColumnFilters(prev => {
            const statusFilter = prev.find(f => f.id === 'status');
            if (!statusFilter) return prev; // No crear filtro si no hay uno activo
            const currentValues = statusFilter.value as string[];
            if (currentValues.includes(status)) return prev;
            return prev.map(f =>
                f.id === 'status'
                    ? { ...f, value: [...currentValues, status] }
                    : f
            );
        });
    }, []);

    // Resolver columns - pueden ser una función o un array directo
    const resolvedColumns = React.useMemo(() => {
        if (typeof columns === 'function') {
            return columns(addStatusFilter);
        }
        return columns;
    }, [columns, addStatusFilter]);

    const overlapResult = React.useMemo(() => {
        if (props.hideOverlaps) {
            return {
                timeConflicts: new Set<string>(),
                duplicateClasses: new Set<string>(),
                allOverlaps: new Set<string>(),
                overlapCount: 0
            };
        }
        return detectOverlaps(data as unknown as Schedule[]);
    }, [data, props.hideOverlaps]);

    const tableData = React.useMemo(() => {
        if (!showOverlapsOnly) return data;
        return data.filter((item) =>
            overlapResult.allOverlaps.has(getScheduleKey(item as unknown as Schedule))
        );
    }, [data, showOverlapsOnly, overlapResult]);

    const table = useReactTable({
        data: tableData,
        columns: resolvedColumns,
        // Usar ID único por fila para row selection (recomendación oficial de TanStack)
        getRowId: (row) => (row as { id?: string }).id || String(tableData.indexOf(row)),
        state: {
            sorting,
            columnVisibility,
            rowSelection,
            columnFilters,
            globalFilter,
        },
        initialState: {
            pagination: {
                pageSize: props.initialPageSize || 25,
            },
        },
        enableRowSelection: (() => {
            const selectionProp = props.enableRowSelection;
            if (selectionProp === undefined) return true;
            if (typeof selectionProp === 'function') {
                return (row: { original: TData }) => selectionProp(row.original);
            }
            return selectionProp;
        })(),
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
        autoResetPageIndex: true, // Resetear a página 1 cuando cambian filtros
    });

    // Guardar callback en ref para evitar re-ejecución por cambio de referencia
    const onSelectionChangeRef = React.useRef(props.onSelectionChange);
    onSelectionChangeRef.current = props.onSelectionChange;

    // Notificar al padre cuando cambia la selección
    React.useEffect(() => {
        if (onSelectionChangeRef.current) {
            const selectedIds = Object.keys(rowSelection).filter(k => rowSelection[k as keyof typeof rowSelection]);
            const selectedRows = tableData.filter(row =>
                selectedIds.includes((row as { id?: string }).id || '')
            ) as TData[];
            onSelectionChangeRef.current(selectedRows);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rowSelection]);

    // Limpiar selecciones inválidas cuando tableData cambia
    const enableRowSelectionRef = React.useRef(props.enableRowSelection);
    enableRowSelectionRef.current = props.enableRowSelection;

    React.useEffect(() => {
        if (typeof enableRowSelectionRef.current !== 'function') return;
        if (Object.keys(rowSelection).length === 0) return;

        const selectionFn = enableRowSelectionRef.current;
        let hasInvalidSelection = false;

        for (const rowId of Object.keys(rowSelection)) {
            if (!rowSelection[rowId as keyof typeof rowSelection]) continue;
            const row = tableData.find(r => (r as { id?: string }).id === rowId);
            if (!row || !selectionFn(row)) {
                hasInvalidSelection = true;
                break;
            }
        }

        if (hasInvalidSelection) {
            const newSelection: Record<string, boolean> = {};
            for (const rowId of Object.keys(rowSelection)) {
                if (!rowSelection[rowId as keyof typeof rowSelection]) continue;
                const row = tableData.find(r => (r as { id?: string }).id === rowId);
                if (row && selectionFn(row)) {
                    newSelection[rowId] = true;
                }
            }
            setRowSelection(newSelection);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tableData]);

    return (
        <div className="space-y-4 p-1">
            {/* Toolbar with Search, Filters, and View Options */}
            <DataTableToolbar
                table={table}
                showOverlapsOnly={showOverlapsOnly}
                setShowOverlapsOnly={setShowOverlapsOnly}
                overlapCount={overlapResult.overlapCount}
                onClearSchedule={onClearSchedule}
                onUploadClick={onUploadClick}
                onRefresh={onRefresh}
                fullData={data}
                hideFilters={props.hideFilters}
                hideUpload={props.hideUpload}
                hideActions={props.hideActions}
                disableRefresh={props.disableRefresh}
                statusOptions={statusOptions}
                showLiveMode={props.showLiveMode}
                setShowLiveMode={props.setShowLiveMode}
                isLiveLoading={props.isLiveLoading}
                activeMeetingsCount={props.activePrograms?.size ?? props.activeMeetingIds?.length ?? 0}
                onPublish={onPublish}
                isPublishing={isPublishing}
                canPublish={canPublish}
                showTypeFilter={props.filterConfig?.showIncidenceType ?? props.showTypeFilter}
                hideStatusFilter={props.filterConfig?.showStatus !== undefined ? !props.filterConfig.showStatus : props.hideStatusFilter}
                showBranch={props.filterConfig?.showBranch}
                showTime={props.filterConfig?.showTime}
                customActionItems={props.customActionItems}
                hideDefaultActions={props.hideDefaultActions}
            />

            {/* Table */}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead
                                            key={header.id}
                                            colSpan={header.colSpan}
                                            style={{
                                                width: header.getSize() !== 150 ? header.getSize() : undefined,
                                            }}
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => {
                                const isConflict = overlapResult.allOverlaps.has(
                                    getScheduleKey(row.original as Schedule)
                                );

                                // Detectar si la reunión está activa
                                // Soporta: meeting_id/meetingId para modals, program para Management
                                const original = row.original as { meeting_id?: string; meetingId?: string; program?: string };
                                const rowMeetingId = original.meeting_id || original.meetingId;
                                const isActiveByMeetingId = rowMeetingId && props.activeMeetingIds?.includes(rowMeetingId);
                                const isActiveByProgram = original.program && props.activePrograms?.has(original.program);
                                const isActive = isActiveByMeetingId || isActiveByProgram;

                                return (
                                    <TableRow
                                        key={row.id}
                                        data-state={row.getIsSelected() && "selected"}
                                        className={cn(
                                            isConflict && "text-destructive",
                                            isActive && "bg-green-50 dark:bg-green-950/20 border-l-2 border-l-green-500"
                                        )}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                );
                            })
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={resolvedColumns.length}
                                    className="h-24 text-center"
                                >
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            <DataTablePagination table={table} />
        </div>
    );
}
