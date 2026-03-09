import { useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { CircleCheck, CircleSlash, CloudUpload, MoreHorizontal, Plus, X } from "lucide-react";
import { poolsService } from "@/features/schedules/services/pools-service";
import type { PoolRule, PoolRuleInput } from "@/features/schedules/types";
import { ScheduleDataTable } from "@schedules/components/table/ScheduleDataTable";
import { DataTableColumnHeader } from "@schedules/components/table/data-table-column-header";
import { useInstructors } from "@schedules/hooks/useInstructors";
import { formatTimestampForDisplay } from "@/lib/date-utils";
import { utils, write } from "xlsx";
import { secureSaveFile } from "@/lib/secure-export";
import { UploadModal } from "@/features/schedules/components/modals/UploadModal";
import { useSettings } from "@/components/settings-provider";
import { InstructorMultiSelect } from "@/features/schedules/components/pools/InstructorMultiSelect";
import { PoolsImportPreviewModal } from "@/features/schedules/components/pools/PoolsImportPreviewModal";
import {
    buildPoolImportPreview,
    countWords,
    parsePoolImportFiles,
    sanitizeInstructorList,
    type PoolImportDraft,
} from "@/features/schedules/components/pools/pools-import-utils";
import {
    formatDayInstructorPools,
    normalizeDayInstructorPools,
    WEEKDAY_OPTIONS,
} from "@/features/schedules/utils/weekdays";

const NOTES_MAX_WORDS = 30;
const MAX_POSITIVE_POOL_INSTRUCTORS = 5;
const DEFAULT_BRANCH_OPTIONS = ["CORPORATE", "HUB", "LA MOLINA"];
const POOL_STATUS_OPTIONS = [
    { label: "Active", value: "active", icon: CircleCheck },
    { label: "Inactive", value: "inactive", icon: CircleSlash },
];
const MAX_VISIBLE_POOL_TAGS = 3;

const poolRuleFormSchema = z.object({
    branch: z.string().trim().min(1, "Branch is required"),
    program_query: z.string().trim().min(1, "Program is required"),
    allowed_instructors_by_day: z.record(z.string(), z.array(z.string())),
    allowed_instructors: z.array(z.string()),
    blocked_instructors: z.array(z.string()),
    hard_lock: z.boolean(),
    is_active: z.boolean(),
    comments: z.string().refine((value) => countWords(value) <= NOTES_MAX_WORDS, {
    }),
}).superRefine((values, ctx) => {
    const payload = toPayload(values);

    const intersections = findPoolIntersections(payload);
    if (intersections.length > 0) {
        ctx.addIssue({
            code: "custom",
            path: ["blocked_instructors"],
            message: "An instructor cannot be in both positive and negative pool",
        });
    }

    const positivePoolCount = countPositivePoolInstructors(payload);
    if (positivePoolCount > MAX_POSITIVE_POOL_INSTRUCTORS) {
        ctx.addIssue({
            code: "custom",
            path: ["allowed_instructors"],
            message: `Positive pool supports up to ${MAX_POSITIVE_POOL_INSTRUCTORS} instructors (3 fixed + 2 backups).`,
        });
    }
});

type RuleFormInput = z.input<typeof poolRuleFormSchema>;
type RuleFormState = z.output<typeof poolRuleFormSchema>;

function toDayPoolRecord(value: unknown): Record<string, string[]> {
    const normalized = normalizeDayInstructorPools(value);
    const record: Record<string, string[]> = {};

    Object.entries(normalized).forEach(([day, instructors]) => {
        if (Array.isArray(instructors)) {
            record[String(day)] = [...instructors];
        }
    });

    return record;
}

const emptyForm: RuleFormState = {
    branch: "",
    program_query: "",
    allowed_instructors_by_day: {},
    allowed_instructors: [],
    blocked_instructors: [],
    hard_lock: false,
    is_active: true,
    comments: "",
};

function normalizeProgramKey(value: string): string {
    return value.trim().toLowerCase();
}

function toPayload(form: RuleFormState): PoolRuleInput {
    return {
        branch: form.branch.trim(),
        program_query: form.program_query.trim(),
        allowed_instructors_by_day: normalizeDayInstructorPools(form.allowed_instructors_by_day),
        allowed_instructors: sanitizeInstructorList(form.allowed_instructors),
        blocked_instructors: sanitizeInstructorList(form.blocked_instructors),
        hard_lock: form.hard_lock,
        is_active: form.is_active,
        comments: form.comments.trim() || null,
    };
}

function countPositivePoolInstructors(payload: PoolRuleInput): number {
    const dayAllowed = Object.values(normalizeDayInstructorPools(payload.allowed_instructors_by_day))
        .flatMap((list) => list ?? []);

    return sanitizeInstructorList([...payload.allowed_instructors, ...dayAllowed]).length;
}

function findPoolIntersections(payload: PoolRuleInput): string[] {
    const dayAllowed = Object.values(normalizeDayInstructorPools(payload.allowed_instructors_by_day))
        .flatMap((list) => list ?? []);
    const allPositive = sanitizeInstructorList([...payload.allowed_instructors, ...dayAllowed]);

    return allPositive.filter((value) =>
        payload.blocked_instructors.some((blocked) => blocked.toLowerCase() === value.toLowerCase())
    );
}

function mapPoolRuleSaveErrorMessage(error: unknown): string | null {
    if (!error || typeof error !== "object") return null;

    const candidate = error as {
        code?: string;
        message?: string;
        details?: string;
    };

    const message = candidate.message ?? "";
    const details = candidate.details ?? "";
    const hitsLegacyConstraint =
        message.includes("pool_rules_non_empty_instructors")
        || details.includes("pool_rules_non_empty_instructors");

    if (candidate.code === "23514" && hitsLegacyConstraint) {
        return "Hard lock requires at least one allowed instructor in general pool or by-day pool.";
    }

    return null;
}

function toForm(rule: PoolRule): RuleFormState {
    return {
        branch: rule.branch,
        program_query: rule.program_query,
        allowed_instructors_by_day: toDayPoolRecord(rule.allowed_instructors_by_day),
        allowed_instructors: [...rule.allowed_instructors],
        blocked_instructors: [...rule.blocked_instructors],
        hard_lock: rule.hard_lock,
        is_active: rule.is_active,
        comments: rule.comments ?? "",
    };
}

export function PoolsPage() {
    const [rules, setRules] = useState<PoolRule[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<PoolRule | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [ruleToDelete, setRuleToDelete] = useState<PoolRule | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isApplyingImport, setIsApplyingImport] = useState(false);
    const [importDrafts, setImportDrafts] = useState<PoolImportDraft[]>([]);
    const instructors = useInstructors();
    const { settings } = useSettings();

    const form = useForm<RuleFormInput, unknown, RuleFormState>({
        resolver: zodResolver(poolRuleFormSchema),
        defaultValues: emptyForm,
    });

    const syncPoolConflictError = (
        nextValues?: Partial<Pick<RuleFormState, "allowed_instructors" | "allowed_instructors_by_day" | "blocked_instructors">>
    ) => {
        const current = form.getValues();
        const merged: RuleFormState = {
            ...current,
            ...nextValues,
        };

        const intersections = findPoolIntersections(toPayload(merged));
        if (intersections.length > 0) {
            form.setError("blocked_instructors", { message: "An instructor cannot be in both positive and negative pool" });
            return;
        }

        form.clearErrors("blocked_instructors");
    };

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

    const branchOptions = useMemo(() => {
        const known = new Set(DEFAULT_BRANCH_OPTIONS);
        for (const rule of rules) {
            const branch = rule.branch?.trim();
            if (branch) known.add(branch);
        }

        return Array.from(known).sort((a, b) => a.localeCompare(b));
    }, [rules]);

    const formatDateTime = (value: string) => {
        const formatted = formatTimestampForDisplay(value);
        if (!formatted) return "—";
        return formatted;
    };

    const columns = useMemo<ColumnDef<PoolRule>[]>(() => [
        {
            id: "select",
            size: 24,
            header: ({ table }) => (
                <div className="flex justify-center items-center mb-1 w-6">
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
            size: 160,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Last changed" className="text-center" />
            ),
            cell: ({ row }) => (
                <div className="text-center">
                    {formatDateTime(row.original.updated_at ?? row.original.created_at)}
                </div>
            ),
            enableSorting: false,
        },
        {
            id: "branch",
            accessorKey: "branch",
            size: 120,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Branch" />
            ),
            cell: ({ row }) => (
                <div className="truncate max-w-28" title={row.original.branch}>{row.original.branch}</div>
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
                    <div className="truncate max-w-90" title={row.original.program_query}>
                        {row.original.program_query}
                    </div>
                    {row.original.comments && (
                        <div className="text-xs text-muted-foreground truncate max-w-90" title={row.original.comments}>
                            {row.original.comments}
                        </div>
                    )}
                </div>
            ),
        },
        {
            id: "positive_pool",
            accessorFn: (row) => row.allowed_instructors.join(", "),
            size: 340,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Positive Pool" />
            ),
            cell: ({ row }) => {
                const dayPools = normalizeDayInstructorPools(row.original.allowed_instructors_by_day);
                const dayEntries = WEEKDAY_OPTIONS
                    .map((day) => {
                        const list = dayPools[day.value];
                        if (!list || list.length === 0) return null;

                        return {
                            label: day.label,
                            count: list.length,
                            instructors: list,
                        };
                    })
                    .filter((entry): entry is { label: string; count: number; instructors: string[] } => entry !== null);

                // Flat list of unique instructors across general and day pools
                const allUniqueInstructors = Array.from(new Set([
                    ...row.original.allowed_instructors,
                    ...dayEntries.flatMap(e => e.instructors)
                ]));
                
                const visibleItems = allUniqueInstructors.slice(0, MAX_VISIBLE_POOL_TAGS);
                const hiddenCount = allUniqueInstructors.length - visibleItems.length;

                return (
                    <div className="flex flex-wrap gap-1 max-w-90">
                        {allUniqueInstructors.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Any</span>
                        ) : (
                            visibleItems.map((name, i) => (
                                <Badge key={`${row.original.id}-allow-${i}`} variant="secondary">{name}</Badge>
                            ))
                        )}
                        {hiddenCount > 0 && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                                        +{hiddenCount} more
                                    </Badge>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 p-4 space-y-4" align="start" onWheel={(e) => e.stopPropagation()}>
                                    {row.original.allowed_instructors.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="font-medium text-xs text-muted-foreground">General Pool</h4>
                                            <div className="flex flex-wrap gap-1">
                                                {row.original.allowed_instructors.map((name) => (
                                                    <Badge key={`pop-gen-${name}`} variant="secondary">{name}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {dayEntries.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="font-medium text-xs text-muted-foreground">By Day ({dayEntries.length})</h4>
                                            <div className="space-y-2">
                                                {dayEntries.map((entry) => (
                                                    <div key={`pop-day-${entry.label}`} className="space-y-1">
                                                        <span className="text-xs font-medium text-muted-foreground">{entry.label}</span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {entry.instructors.map((inst) => (
                                                                <Badge key={`pop-day-${entry.label}-${inst}`} variant="outline" className="text-[11px]">{inst}</Badge>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                );
            },
        },
        {
            id: "negative_pool",
            accessorFn: (row) => row.blocked_instructors.join(", "),
            size: 260,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Negative Pool" />
            ),
            cell: ({ row }) => {
                const hiddenCount = row.original.blocked_instructors.length - MAX_VISIBLE_POOL_TAGS;
                
                return (
                    <div className="flex flex-wrap gap-1 max-w-90">
                        {row.original.blocked_instructors.length === 0 ? (
                            <span className="text-xs text-muted-foreground">None</span>
                        ) : (
                            row.original.blocked_instructors.slice(0, MAX_VISIBLE_POOL_TAGS).map((name) => (
                                <Badge key={`${row.original.id}-block-${name}`} variant="outline">{name}</Badge>
                            ))
                        )}
                        {hiddenCount > 0 && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                                        +{hiddenCount} more
                                    </Badge>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 p-4 space-y-2" align="start" onWheel={(e) => e.stopPropagation()}>
                                    <h4 className="font-medium text-xs text-muted-foreground">Negative Pool</h4>
                                    <div className="flex flex-wrap gap-1">
                                        {row.original.blocked_instructors.map((name) => (
                                            <Badge key={`pop-block-${name}`} variant="outline">{name}</Badge>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                );
            },
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
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setRuleToDelete(row.original)}>
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ], []);

    const importPreview = useMemo(() => buildPoolImportPreview(importDrafts, rules), [importDrafts, rules]);

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
        const payload = toPayload(values);

        const payloadProgramKey = normalizeProgramKey(payload.program_query);
        const hasConflictingRule = rules.some((rule) => {
            if (editingRule && rule.id === editingRule.id) {
                return false;
            }

            return normalizeProgramKey(rule.program_query) === payloadProgramKey;
        });

        if (hasConflictingRule) {
            form.setError("program_query", {
                message: "There is already a rule for this program.",
            });
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
            toast.error(mapPoolRuleSaveErrorMessage(error) ?? "Failed to save pool rule");
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
            const rows: Record<string, string>[] = data.map((rule) => ({
                branch: rule.branch,
                program: rule.program_query,
                positive_pool: rule.allowed_instructors.join(", "),
                positive_pool_by_day: formatDayInstructorPools(rule.allowed_instructors_by_day),
                negative_pool: rule.blocked_instructors.join(", "),
                hard_lock: rule.hard_lock ? "TRUE" : "FALSE",
                is_active: rule.is_active ? "TRUE" : "FALSE",
                comments: rule.comments ?? "",
            }));

            const worksheet = utils.json_to_sheet(rows, {
                header: [
                    "branch",
                    "program",
                    "positive_pool",
                    "positive_pool_by_day",
                    "negative_pool",
                    "hard_lock",
                    "is_active",
                    "comments",
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
                openAfterExport: settings.openAfterExport,
            });

            if (saved) {
                toast.success("Pool rules exported to Excel");
            }
        } catch (error) {
            console.error("Failed to export pool rules", error);
            toast.error("Failed to export pool rules");
        }
    };

    const handleImportFiles = async (files: File[]) => {
        if (files.length === 0) return;

        try {
            const { payloads, fileErrors } = await parsePoolImportFiles(files);

            for (const message of fileErrors) {
                toast.error(message);
            }

            if (payloads.length === 0) {
                toast.error("No valid pool rules found in file");
                return;
            }

            setImportDrafts(payloads.map((payload, index) => ({
                id: `${Date.now()}-${index}`,
                payload,
            })));
            setIsImportModalOpen(true);
        } catch (error) {
            console.error("Failed to import pool rules", error);
            toast.error("Failed to import pool rules");
        }
    };

    const handleConfirmImport = async () => {
        if (importPreview.rows.length === 0) {
            toast.warning("No data to import");
            return;
        }

        if (importPreview.summary.unresolvedCount > 0) {
            toast.error("Resolve duplicate/invalid/ambiguous rows before importing");
            return;
        }

        const operations = importPreview.rows
            .filter((row) => row.status === "new" || row.status === "modified")
            .map((row) => {
                const payload: PoolRuleInput = {
                    branch: row.branch,
                    program_query: row.program_query,
                    allowed_instructors_by_day: normalizeDayInstructorPools(row.allowed_instructors_by_day),
                    allowed_instructors: row.allowed_instructors,
                    blocked_instructors: row.blocked_instructors,
                    hard_lock: row.hard_lock,
                    is_active: row.is_active,
                    comments: row.comments,
                };

                if (row.status === "new") {
                    return {
                        kind: "create" as const,
                        run: () => poolsService.createRule(payload),
                    };
                }

                return {
                    kind: "update" as const,
                    run: () => {
                        if (!row.existingRuleId) throw new Error("Missing existing rule id");
                        return poolsService.updateRule(row.existingRuleId, payload);
                    },
                };
            });

        setIsApplyingImport(true);
        try {
            const results = await Promise.allSettled(operations.map((op) => op.run()));

            let createdCount = 0;
            let updatedCount = 0;
            let failCount = 0;

            results.forEach((result, index) => {
                if (result.status === "fulfilled") {
                    if (operations[index]?.kind === "create") createdCount += 1;
                    if (operations[index]?.kind === "update") updatedCount += 1;
                } else {
                    failCount += 1;
                }
            });

            const identicalCount = importPreview.summary.identicalCount;

            const messageParts: string[] = [];
            if (createdCount > 0) messageParts.push(`${createdCount} created`);
            if (updatedCount > 0) messageParts.push(`${updatedCount} updated`);
            if (identicalCount > 0) messageParts.push(`${identicalCount} identical skipped`);

            if (messageParts.length > 0) {
                toast.success(messageParts.join(", "));
            } else {
                toast.warning("No rows were applied");
            }

            if (failCount > 0) {
                toast.error(`${failCount} row${failCount > 1 ? "s" : ""} failed to import`);
            }

            await loadRules();
            if (failCount === 0) {
                setImportDrafts([]);
                setIsImportModalOpen(false);
            }
        } catch (error) {
            console.error("Failed to import pool rules", error);
            toast.error("Failed to import pool rules");
        } finally {
            setIsApplyingImport(false);
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
                        <DropdownMenuItem onClick={() => setIsUploadModalOpen(true)}>
                            <CloudUpload />
                            Import Data
                        </DropdownMenuItem>
                    }
                />
            </div>

            <UploadModal
                open={isUploadModalOpen}
                onOpenChange={setIsUploadModalOpen}
                onUploadComplete={() => { }}
                processFiles={handleImportFiles}
            />

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
                                name="branch"
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor={field.name}>Branch</FieldLabel>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger id={field.name} aria-invalid={fieldState.invalid}>
                                                <SelectValue placeholder="Select branch" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {branchOptions.map((branch) => (
                                                    <SelectItem key={branch} value={branch}>
                                                        {branch}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FieldDescription>
                                            Branch is required to create or update a rule.
                                        </FieldDescription>
                                        <FieldError errors={[fieldState.error]} />
                                    </Field>
                                )}
                            />

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
                                            onChange={(next) => {
                                                const cleaned = sanitizeInstructorList(next);
                                                field.onChange(cleaned);
                                                syncPoolConflictError({ allowed_instructors: cleaned });
                                            }}
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
                                name="allowed_instructors_by_day"
                                render={({ field }) => {
                                    const rawDayPools =
                                        field.value && typeof field.value === "object"
                                            ? (field.value as Record<string, string[]>)
                                            : {};
                                    const dayPools = normalizeDayInstructorPools(field.value);
                                    const usedDays = Object.keys(rawDayPools)
                                        .map(Number)
                                        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
                                        .sort((a, b) => a - b);
                                    const nextAvailableDay = WEEKDAY_OPTIONS.find((item) => !usedDays.includes(item.value));
                                    return (
                                        <Field>
                                            <FieldLabel>Pool by day (optional)</FieldLabel>
                                            <div className="space-y-2">
                                                {usedDays.map((dayValue) => {
                                                    const selectedSet = new Set(usedDays.filter((value) => value !== dayValue));
                                                    return (
                                                        <div key={dayValue} className="grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-2">
                                                            <Select
                                                                value={String(dayValue)}
                                                                onValueChange={(nextValue) => {
                                                                    const nextDay = Number(nextValue);
                                                                    if (!Number.isInteger(nextDay) || nextDay < 1 || nextDay > 7 || nextDay === dayValue) {
                                                                        return;
                                                                    }
                                                                    if (selectedSet.has(nextDay)) {
                                                                        return;
                                                                    }

                                                                    const current =
                                                                        field.value && typeof field.value === "object"
                                                                            ? (field.value as Record<string, string[]>)
                                                                            : {};
                                                                    const list = current[String(dayValue)] ?? [];
                                                                    const updated: Record<string, string[]> = { ...current };
                                                                    delete updated[String(dayValue)];
                                                                    updated[String(nextDay)] = list;
                                                                    field.onChange(updated);
                                                                }}
                                                            >
                                                                <SelectTrigger size="sm" className="w-full">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {WEEKDAY_OPTIONS
                                                                        .filter((item) => item.value === dayValue || !selectedSet.has(item.value))
                                                                        .map((item) => (
                                                                            <SelectItem key={item.value} value={String(item.value)}>
                                                                                {item.label}
                                                                            </SelectItem>
                                                                        ))}
                                                                </SelectContent>
                                                            </Select>

                                                            <InstructorMultiSelect
                                                                value={rawDayPools[String(dayValue)] ?? dayPools[dayValue] ?? []}
                                                                onChange={(next) => {
                                                                    const current =
                                                                        field.value && typeof field.value === "object"
                                                                            ? (field.value as Record<string, string[]>)
                                                                            : {};
                                                                    const updated: Record<string, string[]> = { ...current };
                                                                    const cleaned = sanitizeInstructorList(next);
                                                                    if (cleaned.length === 0) {
                                                                        delete updated[String(dayValue)];
                                                                    } else {
                                                                        updated[String(dayValue)] = cleaned;
                                                                    }
                                                                    field.onChange(updated);
                                                                    syncPoolConflictError({ allowed_instructors_by_day: updated });
                                                                }}
                                                                options={instructorOptions}
                                                                placeholder="Select instructors"
                                                                searchPlaceholder="Search instructor..."
                                                                emptyText="No instructor found."
                                                            />

                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="icon-sm"
                                                                onClick={() => {
                                                                    const current =
                                                                        field.value && typeof field.value === "object"
                                                                            ? (field.value as Record<string, string[]>)
                                                                            : {};
                                                                    const updated: Record<string, string[]> = { ...current };
                                                                    delete updated[String(dayValue)];
                                                                    field.onChange(updated);
                                                                    syncPoolConflictError({ allowed_instructors_by_day: updated });
                                                                }}
                                                                aria-label="Remove day"
                                                                title="Remove day"
                                                            >
                                                                <X />
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
                                                <div>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            if (!nextAvailableDay) return;
                                                            const current =
                                                                field.value && typeof field.value === "object"
                                                                    ? (field.value as Record<string, string[]>)
                                                                    : {};
                                                            const updated: Record<string, string[]> = {
                                                                ...current,
                                                                [String(nextAvailableDay.value)]: [],
                                                            };
                                                            field.onChange(updated);
                                                            syncPoolConflictError({ allowed_instructors_by_day: updated });
                                                        }}
                                                        disabled={!nextAvailableDay}
                                                    >
                                                        <Plus />
                                                        Add day
                                                    </Button>
                                                </div>
                                            </div>
                                            <FieldDescription>
                                                Add instructors for specific days.
                                            </FieldDescription>
                                        </Field>
                                    );
                                }}
                            />

                            <Controller
                                control={form.control}
                                name="blocked_instructors"
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor={field.name}>Negative pool</FieldLabel>
                                        <InstructorMultiSelect
                                            value={field.value}
                                            onChange={(next) => {
                                                const cleaned = sanitizeInstructorList(next);
                                                field.onChange(cleaned);
                                                syncPoolConflictError({ blocked_instructors: cleaned });
                                            }}
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
                                name="comments"
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor={field.name}>Comments</FieldLabel>
                                        <InputGroup>
                                            <InputGroupTextarea
                                                {...field}
                                                id={field.name}
                                                placeholder="Add comments..."
                                                rows={3}
                                                className="min-h-20 resize-none max-h-40"
                                                aria-invalid={fieldState.invalid}
                                            />
                                            <InputGroupAddon align="block-end">
                                                <InputGroupText className="tabular-nums">
                                                    {countWords(field.value ?? "")}/{NOTES_MAX_WORDS}
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

                            <p className="text-sm font-medium">Rule options</p>

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
                                        <div className="h-8 py-2">
                                            <Switch
                                                id={field.name}
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                                className="my-auto"
                                            />
                                        </div>
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
                                        <div className="h-8 py-2">
                                        <Switch id={field.name} checked={field.value} onCheckedChange={field.onChange} />
                                        </div>
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

            <PoolsImportPreviewModal
                open={isImportModalOpen}
                onOpenChange={setIsImportModalOpen}
                rows={importPreview.rows}
                summary={importPreview.summary}
                isApplying={isApplyingImport}
                onConfirm={handleConfirmImport}
                onRemoveRows={(ids) => {
                    if (ids.length === 0) return;
                    const idSet = new Set(ids);
                    setImportDrafts((prev) => prev.filter((item) => !idSet.has(item.id)));
                    toast.success(`${ids.length} row(s) removed`);
                }}
            />

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
