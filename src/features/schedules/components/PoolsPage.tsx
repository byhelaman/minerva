import { useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupText,
    InputGroupTextarea,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Check, ChevronsUpDown, CircleCheck, CircleSlash, CloudUpload, MoreHorizontal, Plus, X } from "lucide-react";
import { poolsService } from "@/features/schedules/services/pools-service";
import type { PoolRule, PoolRuleInput } from "@/features/schedules/types";
import { ScheduleDataTable } from "@schedules/components/table/ScheduleDataTable";
import { DataTableColumnHeader } from "@schedules/components/table/data-table-column-header";
import { useInstructors } from "@schedules/hooks/useInstructors";
import { formatTimestampForDisplay } from "@/lib/date-utils";
import { read, utils, write } from "xlsx";
import { secureSaveFile } from "@/lib/secure-export";

interface PoolImportRow {
    program_query?: unknown;
    program?: unknown;
    allowed_instructors?: unknown;
    positive_pool?: unknown;
    blocked_instructors?: unknown;
    negative_pool?: unknown;
}

interface RuleFormState {
    program_query: string;
    allowed_instructors: string[];
    blocked_instructors: string[];
    hard_lock: boolean;
    is_active: boolean;
    notes: string;
}

const emptyForm: RuleFormState = {
    program_query: "",
    allowed_instructors: [],
    blocked_instructors: [],
    hard_lock: false,
    is_active: true,
    notes: "",
};

const NOTES_MAX_WORDS = 30;
const POOL_STATUS_OPTIONS = [
    { label: "Active", value: "active", icon: CircleCheck },
    { label: "Inactive", value: "inactive", icon: CircleSlash },
];

function sanitizeInstructorList(values: string[]): string[] {
    const unique = new Map<string, string>();
    values
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => {
            const key = value.toLowerCase();
            if (!unique.has(key)) {
                unique.set(key, value);
            }
        });

    return Array.from(unique.values());
}

function countWords(value: string): number {
    return value.trim().split(/\s+/).filter(Boolean).length;
}

const maxWords = (max: number) => (value: string): boolean => {
    return countWords(value) <= max;
};

function toPayload(form: RuleFormState): PoolRuleInput {
    return {
        program_query: form.program_query.trim(),
        allowed_instructors: sanitizeInstructorList(form.allowed_instructors),
        blocked_instructors: sanitizeInstructorList(form.blocked_instructors),
        hard_lock: form.hard_lock,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
    };
}

function toForm(rule: PoolRule): RuleFormState {
    return {
        program_query: rule.program_query,
        allowed_instructors: [...rule.allowed_instructors],
        blocked_instructors: [...rule.blocked_instructors],
        hard_lock: rule.hard_lock,
        is_active: rule.is_active,
        notes: rule.notes ?? "",
    };
}

function parseInstructorCell(value: unknown): string[] {
    if (Array.isArray(value)) {
        return sanitizeInstructorList(value.map((entry) => String(entry ?? "")));
    }

    const raw = String(value ?? "").trim();
    if (!raw) return [];

    return sanitizeInstructorList(raw.split(/[\n,;|]+/).map((entry) => entry.trim()));
}

interface InstructorMultiSelectProps {
    value: string[];
    onChange: (next: string[]) => void;
    options: string[];
    placeholder: string;
    searchPlaceholder: string;
    emptyText: string;
    className?: string;
}

function InstructorMultiSelect({
    value,
    onChange,
    options,
    placeholder,
    searchPlaceholder,
    emptyText,
    className,
}: InstructorMultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (value.length <= 5) {
            setExpanded(false);
        }
    }, [value.length]);

    const mergedOptions = useMemo(() => {
        const map = new Map<string, string>();
        [...options, ...value].forEach((name) => {
            const trimmed = name.trim();
            if (!trimmed) return;
            const key = trimmed.toLowerCase();
            if (!map.has(key)) {
                map.set(key, trimmed);
            }
        });
        return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
    }, [options, value]);

    const hasExactMatch = mergedOptions.some(
        (name) => name.toLowerCase() === search.trim().toLowerCase()
    );
    const canAddCustom = search.trim().length > 0 && !hasExactMatch;

    const toggleValue = (name: string) => {
        const key = name.toLowerCase();
        const exists = value.some((selected) => selected.toLowerCase() === key);
        if (exists) {
            onChange(value.filter((selected) => selected.toLowerCase() !== key));
            return;
        }
        onChange([...value, name]);
    };

    const removeValue = (name: string) => {
        const key = name.toLowerCase();
        onChange(value.filter((selected) => selected.toLowerCase() !== key));
    };

    const visibleValues = expanded ? value : value.slice(0, 5);
    const hiddenCount = value.length - visibleValues.length;

    return (
        <div className={`space-y-2 ${className ?? ""}`}>
            <Popover open={open} onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (!nextOpen) {
                    setSearch("");
                }
            }} modal={true}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full h-auto justify-between font-normal px-3 py-2 hover:bg-transparent data-[state=open]:bg-transparent"
                    >
                        <div className="flex flex-wrap items-center gap-1.5 min-h-5">
                            {value.length === 0 ? (
                                <span className="text-muted-foreground truncate">{placeholder}</span>
                            ) : (
                                <>
                                    {visibleValues.map((name) => (
                                        <Badge key={name} variant="secondary" className="gap-1 pr-1">
                                            <span className="max-w-40 truncate">{name}</span>
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                className="rounded-sm opacity-70 hover:opacity-100"
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    removeValue(name);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        removeValue(name);
                                                    }
                                                }}
                                                aria-label={`Remove ${name}`}
                                            >
                                                <X />
                                            </span>
                                        </Badge>
                                    ))}
                                    {hiddenCount > 0 && (
                                        <Badge
                                            variant="outline"
                                            role="button"
                                            tabIndex={0}
                                            className="cursor-pointer select-none hover:bg-accent"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setExpanded(true);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    setExpanded(true);
                                                }
                                            }}
                                        >
                                            +{hiddenCount} more
                                        </Badge>
                                    )}
                                    {expanded && value.length > 5 && (
                                        <Badge
                                            variant="outline"
                                            role="button"
                                            tabIndex={0}
                                            className="cursor-pointer select-none hover:bg-accent"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setExpanded(false);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    setExpanded(false);
                                                }
                                            }}
                                        >
                                            show less
                                        </Badge>
                                    )}
                                </>
                            )}
                        </div>
                        <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                        <CommandInput
                            placeholder={searchPlaceholder}
                            value={search}
                            onValueChange={setSearch}
                        />
                        <CommandList className="max-h-70">
                            <CommandEmpty>{emptyText}</CommandEmpty>

                            {canAddCustom && (
                                <CommandGroup heading="Custom">
                                    <CommandItem
                                        value={`__custom__${search}`}
                                        onSelect={() => {
                                            toggleValue(search.trim());
                                            setSearch("");
                                        }}
                                    >
                                        <Check className="opacity-0" />
                                        <span>Use “{search.trim()}”</span>
                                    </CommandItem>
                                </CommandGroup>
                            )}

                            <CommandGroup>
                                {mergedOptions.map((name) => {
                                    const isSelected = value.some((selected) => selected.toLowerCase() === name.toLowerCase());

                                    return (
                                        <CommandItem
                                            key={name}
                                            value={name}
                                            onSelect={() => toggleValue(name)}
                                        >
                                            <Check className={isSelected ? "opacity-100" : "opacity-0"} />
                                            <span className="truncate">{name}</span>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}

export function PoolsPage() {
    const [rules, setRules] = useState<PoolRule[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<PoolRule | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [ruleToDelete, setRuleToDelete] = useState<PoolRule | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const instructors = useInstructors();

    const form = useForm<RuleFormState>({
        defaultValues: emptyForm,
    });

    const instructorOptions = useMemo(() => {
        const map = new Map<string, string>();

        instructors.forEach((inst) => {
            const name = inst.display_name.trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (!map.has(key)) {
                map.set(key, name);
            }
        });

        rules.forEach((rule) => {
            [...rule.allowed_instructors, ...rule.blocked_instructors].forEach((name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                const key = trimmed.toLowerCase();
                if (!map.has(key)) {
                    map.set(key, trimmed);
                }
            });
        });

        return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
    }, [instructors, rules]);

    const formatDateOnly = (value: string) => {
        const formatted = formatTimestampForDisplay(value);
        if (!formatted) return "—";
        return formatted.split(" ")[0] ?? "—";
    };

    const columns = useMemo<ColumnDef<PoolRule>[]>(() => [
        {
            id: "select",
            size: 36,
            header: ({ table }) => (
                <div className="flex justify-center items-center mb-1 w-9">
                    <Checkbox
                        checked={
                            table.getIsAllPageRowsSelected() ||
                            (table.getIsSomePageRowsSelected() && "indeterminate")
                        }
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                        className="translate-y-0.5"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="flex justify-center">
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                        className="translate-y-0.5 mb-1"
                    />
                </div>
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            id: "date",
            accessorFn: (row) => row.updated_at ?? row.created_at,
            size: 120,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Date" className="justify-center" />
            ),
            cell: ({ row }) => (
                <div className="text-center">
                    {formatDateOnly(row.original.updated_at ?? row.original.created_at)}
                </div>
            ),
        },
        {
            id: "program",
            accessorKey: "program_query",
            size: 400,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Program" />
            ),
            cell: ({ row }) => (
                <div className="space-y-1">
                    <div className="font-medium truncate max-w-90" title={row.original.program_query}>
                        {row.original.program_query}
                    </div>
                    {row.original.notes && (
                        <div className="text-xs text-muted-foreground truncate max-w-90" title={row.original.notes}>
                            {row.original.notes}
                        </div>
                    )}
                </div>
            ),
        },
        {
            id: "positive_pool",
            accessorFn: (row) => row.allowed_instructors.join(", "),
            size: 260,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Positive Pool" />
            ),
            cell: ({ row }) => (
                <div className="flex flex-wrap gap-1 max-w-90">
                    {row.original.allowed_instructors.length === 0 ? (
                        <span className="text-muted-foreground">Any</span>
                    ) : (
                        row.original.allowed_instructors.map((name) => (
                            <Badge key={`${row.original.id}-allow-${name}`} variant="secondary">{name}</Badge>
                        ))
                    )}
                </div>
            ),
        },
        {
            id: "negative_pool",
            accessorFn: (row) => row.blocked_instructors.join(", "),
            size: 260,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Negative Pool" />
            ),
            cell: ({ row }) => (
                <div className="flex flex-wrap gap-1 max-w-90">
                    {row.original.blocked_instructors.length === 0 ? (
                        <span className="text-muted-foreground">None</span>
                    ) : (
                        row.original.blocked_instructors.map((name) => (
                            <Badge key={`${row.original.id}-block-${name}`} variant="outline">{name}</Badge>
                        ))
                    )}
                </div>
            ),
        },
        {
            id: "strict",
            accessorFn: (row) => row.hard_lock,
            size: 90,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Strict" className="justify-center" />
            ),
            cell: ({ row }) => (
                <div className="text-center text-sm">
                    {row.original.hard_lock ? "Yes" : "No"}
                </div>
            ),
        },
        {
            id: "status",
            accessorFn: (row) => (row.is_active ? "active" : "inactive"),
            size: 100,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Status" className="justify-center" />
            ),
            cell: ({ row }) => (
                <div className="text-center text-sm">
                    {row.original.is_active ? "Active" : "Inactive"}
                </div>
            ),
        },
        {
            id: "actions",
            size: 56,
            enableSorting: false,
            cell: ({ row }) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            aria-label="Open actions menu"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                        >
                            <MoreHorizontal className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
                            Edit Rule
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setRuleToDelete(row.original)}>
                            Delete Rule
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ], []);

    const loadRules = async () => {
        setIsLoading(true);
        try {
            const data = await poolsService.listMyRules();
            setRules(data);
        } catch (error) {
            console.error("Failed to load pool rules", error);
            toast.error("Failed to load pool rules");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadRules();
    }, []);

    const openCreateDialog = () => {
        setEditingRule(null);
        form.reset(emptyForm);
        setDialogOpen(true);
    };

    const openEditDialog = (rule: PoolRule) => {
        setEditingRule(rule);
        form.reset(toForm(rule));
        setDialogOpen(true);
    };

    const handleSave = form.handleSubmit(async (values) => {
        if (!values.program_query.trim()) {
            form.setError("program_query", { message: "Program is required" });
            return;
        }

        if (!maxWords(NOTES_MAX_WORDS)(values.notes)) {
            form.setError("notes", { message: `Notes must be ${NOTES_MAX_WORDS} words or less` });
            return;
        }

        const payload = toPayload(values);

        if (payload.hard_lock && payload.allowed_instructors.length === 0) {
            form.setError("allowed_instructors", { message: "Hard lock requires at least one allowed instructor" });
            return;
        }

        const intersections = payload.allowed_instructors.filter((value) =>
            payload.blocked_instructors.some((blocked) => blocked.toLowerCase() === value.toLowerCase())
        );

        if (intersections.length > 0) {
            form.setError("blocked_instructors", { message: "An instructor cannot be in both positive and negative pool" });
            return;
        }

        setIsSaving(true);
        try {
            if (editingRule) {
                await poolsService.updateRule(editingRule.id, payload);
                toast.success("Pool rule updated");
            } else {
                await poolsService.createRule(payload);
                toast.success("Pool rule created");
            }

            setDialogOpen(false);
            await loadRules();
        } catch (error) {
            console.error("Failed to save pool rule", error);
            toast.error("Failed to save pool rule");
        } finally {
            setIsSaving(false);
        }
    });

    const handleDelete = async () => {
        if (!ruleToDelete) return;

        setIsDeleting(true);
        try {
            await poolsService.deleteRule(ruleToDelete.id);
            toast.success("Pool rule deleted");
            setRuleToDelete(null);
            await loadRules();
        } catch (error) {
            console.error("Failed to delete pool rule", error);
            toast.error("Failed to delete pool rule");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleBulkDelete = async (selected: PoolRule[]) => {
        if (selected.length === 0) return;

        setIsDeleting(true);
        try {
            const results = await Promise.allSettled(selected.map((rule) => poolsService.deleteRule(rule.id)));
            const successCount = results.filter((result) => result.status === "fulfilled").length;
            const failCount = results.length - successCount;

            if (successCount > 0) {
                toast.success(`${successCount} pool rule${successCount > 1 ? "s" : ""} deleted`);
            }
            if (failCount > 0) {
                toast.error(`${failCount} pool rule${failCount > 1 ? "s" : ""} failed to delete`);
            }

            await loadRules();
        } catch (error) {
            console.error("Failed to bulk delete pool rules", error);
            toast.error("Failed to bulk delete pool rules");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleExportRules = async (data: PoolRule[]) => {
        try {
            const rows = data.map((rule) => ({
                program_query: rule.program_query,
                allowed_instructors: rule.allowed_instructors.join(", "),
                blocked_instructors: rule.blocked_instructors.join(", "),
            }));

            const worksheet = utils.json_to_sheet(rows, {
                header: [
                    "program_query",
                    "allowed_instructors",
                    "blocked_instructors",
                ],
            });

            const workbook = utils.book_new();
            utils.book_append_sheet(workbook, worksheet, "Pools");

            const now = new Date();
            const dateStr = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
            const defaultName = `pools-export-${dateStr}.xlsx`;
            const excelBuffer = write(workbook, { bookType: "xlsx", type: "array" });

            const saved = await secureSaveFile({
                title: "Save As",
                defaultName,
                content: new Uint8Array(excelBuffer),
            });

            if (saved) {
                toast.success("Pool rules exported to Excel");
            }
        } catch (error) {
            console.error("Failed to export pool rules", error);
            toast.error("Failed to export pool rules");
        }
    };

    const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setIsImporting(true);
        try {
            const buffer = await file.arrayBuffer();
            const workbook = read(buffer, { type: "array" });
            const firstSheetName = workbook.SheetNames[0];

            if (!firstSheetName) {
                toast.error("The selected file has no sheets");
                return;
            }

            const worksheet = workbook.Sheets[firstSheetName];
            const importedRows = utils.sheet_to_json<PoolImportRow>(worksheet, { defval: "" });

            if (importedRows.length === 0) {
                toast.error("No rows found to import");
                return;
            }

            const payloads = importedRows
                .map((row) => {
                    const programValue = String(row.program_query ?? row.program ?? "").trim();
                    if (!programValue) return null;

                    return {
                        program_query: programValue,
                        allowed_instructors: parseInstructorCell(row.allowed_instructors ?? row.positive_pool),
                        blocked_instructors: parseInstructorCell(row.blocked_instructors ?? row.negative_pool),
                        hard_lock: false,
                        is_active: true,
                        notes: null,
                    } as PoolRuleInput;
                })
                .filter((item): item is PoolRuleInput => item !== null);

            if (payloads.length === 0) {
                toast.error("No valid pool rules found in file");
                return;
            }

            const results = await Promise.allSettled(payloads.map((payload) => poolsService.createRule(payload)));
            const successCount = results.filter((result) => result.status === "fulfilled").length;
            const failCount = results.length - successCount;

            if (successCount > 0) {
                toast.success(`${successCount} pool rule${successCount > 1 ? "s" : ""} imported`);
                await loadRules();
            }
            if (failCount > 0) {
                toast.error(`${failCount} pool rule${failCount > 1 ? "s" : ""} failed to import`);
            }
        } catch (error) {
            console.error("Failed to import pool rules", error);
            toast.error("Failed to import pool rules");
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex py-8 my-4 gap-6 justify-between items-center">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-bold tracking-tight">Pools</h1>
                    <p className="text-muted-foreground text-sm">
                        Manage your instructor pools by program.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" onClick={openCreateDialog}>
                        <Plus />
                        New Rule
                    </Button>
                </div>
            </div>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden pr-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleImportFile}
                />
                <ScheduleDataTable
                    columns={columns}
                    data={rules}
                    initialPageSize={100}
                    statusOptions={POOL_STATUS_OPTIONS}
                    hideUpload
                    hideDefaultActions
                    hideOverlaps
                    hideBulkCopy
                    onBulkDelete={(rows) => handleBulkDelete(rows as PoolRule[])}
                    onRefresh={loadRules}
                    disableRefresh={isLoading}
                    getRowKey={(row) => (row as PoolRule).id}
                    customExportFn={(data) => handleExportRules(data as PoolRule[])}
                    customActionItems={
                        <>
                            <DropdownMenuItem
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isImporting}
                            >
                                <CloudUpload />
                                {isImporting ? "Importing..." : "Import Data"}
                            </DropdownMenuItem>
                        </>
                    }
                />
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>{editingRule ? "Edit Pool Rule" : "New Pool Rule"}</DialogTitle>
                        <DialogDescription>
                            Define allowed and blocked instructors for a program.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSave} className="flex flex-col min-h-0 gap-6">
                        <FieldGroup className="gap-5 overflow-y-auto p-1">
                            <Controller
                                control={form.control}
                                name="program_query"
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor={field.name}>Program</FieldLabel>
                                        <Input
                                            {...field}
                                            id={field.name}
                                            placeholder="e.g. English Level 5"
                                            aria-invalid={fieldState.invalid}
                                        />
                                        <FieldDescription>
                                            Enter the program name for this rule.
                                        </FieldDescription>
                                        <FieldError errors={[fieldState.error]} />
                                    </Field>
                                )}
                            />

                            <Controller
                                control={form.control}
                                name="allowed_instructors"
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor={field.name}>Positive pool</FieldLabel>
                                        <InstructorMultiSelect
                                            value={field.value}
                                            onChange={field.onChange}
                                            options={instructorOptions}
                                            placeholder="Select instructors"
                                            searchPlaceholder="Search instructor..."
                                            emptyText="No instructor found."
                                        />
                                        <FieldDescription>
                                            Allowed instructors for this program.
                                        </FieldDescription>
                                        <FieldError errors={[fieldState.error]} />
                                    </Field>
                                )}
                            />

                            <Controller
                                control={form.control}
                                name="blocked_instructors"
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor={field.name}>Negative pool</FieldLabel>
                                        <InstructorMultiSelect
                                            value={field.value}
                                            onChange={field.onChange}
                                            options={instructorOptions}
                                            placeholder="Select instructors"
                                            searchPlaceholder="Search instructor..."
                                            emptyText="No instructor found."
                                        />
                                        <FieldDescription>
                                            Blocked instructors for this program.
                                        </FieldDescription>
                                        <FieldError errors={[fieldState.error]} />
                                    </Field>
                                )}
                            />

                            <Controller
                                control={form.control}
                                name="notes"
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor={field.name}>Notes</FieldLabel>
                                        <InputGroup>
                                            <InputGroupTextarea
                                                {...field}
                                                id={field.name}
                                                placeholder="Optional notes"
                                                rows={3}
                                                className="min-h-20 resize-none max-h-40"
                                                aria-invalid={fieldState.invalid}
                                            />
                                            <InputGroupAddon align="block-end">
                                                <InputGroupText className="tabular-nums">
                                                    {countWords(field.value)}/{NOTES_MAX_WORDS}
                                                </InputGroupText>
                                            </InputGroupAddon>
                                        </InputGroup>
                                        <FieldDescription>
                                            Optional context for this rule.
                                        </FieldDescription>
                                        <FieldError errors={[fieldState.error]} />
                                    </Field>
                                )}
                            />

                            <p className="text-sm font-semibold">Rule options</p>

                            <Controller
                                control={form.control}
                                name="hard_lock"
                                render={({ field }) => (
                                    <div className="flex items-center justify-between gap-4">
                                        <Label htmlFor={field.name} className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                                            <span className="text-sm">No assign to anyone else (strict lock)</span>
                                            <span className="text-xs text-muted-foreground">
                                                If enabled, only positive-pool instructors are valid.
                                            </span>
                                        </Label>
                                        <Switch id={field.name} checked={field.value} onCheckedChange={field.onChange} />
                                    </div>
                                )}
                            />

                            <Controller
                                control={form.control}
                                name="is_active"
                                render={({ field }) => (
                                    <div className="flex items-center justify-between gap-4">
                                        <Label htmlFor={field.name} className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                                            <span className="text-sm">Rule active</span>
                                            <span className="text-xs text-muted-foreground">
                                                If disabled, this rule is saved but not applied.
                                            </span>
                                        </Label>
                                        <Switch id={field.name} checked={field.value} onCheckedChange={field.onChange} />
                                    </div>
                                )}
                            />
                        </FieldGroup>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving} type="button">
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? "Saving..." : editingRule ? "Save changes" : "Create rule"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!ruleToDelete} onOpenChange={(open) => !open && setRuleToDelete(null)}>
                <AlertDialogContent className="sm:max-w-100!">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete rule</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. The pool rule will be removed permanently.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                            {isDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
