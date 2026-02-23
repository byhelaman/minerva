import { useState, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Loader2, CalendarIcon, Clock2, ArrowRight, ArrowLeft, X } from "lucide-react";
import { Schedule } from "../../types";
import { useInstructors } from "../../hooks/useInstructors";
import { useZoomStore } from "@/features/matching/stores/useZoomStore";
import { InstructorSelector } from "./InstructorSelector";
import { parseTimeValue } from "../../utils/time-utils";
import { normalizeString, getSchedulePrimaryKey } from "../../utils/string-utils";
import { IncidenceFormContent } from "./IncidenceFormContent";
import { ScheduleInfo } from "./ScheduleInfo";
import { ScrollArea } from "@/components/ui/scroll-area";

// Shift calculation logic (from excel-parser.ts)
function determineShift(startTime: string): string {
    const { hours } = parseTimeValue(startTime);
    return hours < 14 ? "P. ZUÑIGA" : "H. GARCIA";
}

// Branch options
const BRANCH_OPTIONS = ["CORPORATE", "HUB", "LA MOLINA"] as const;

// Combined Form validation schema
const addScheduleFormSchema = z.object({
    // Step 1: Schedule
    date: z.string().min(1, "Date is required"),
    branch: z.string().min(1, "Branch is required"),
    start_time: z.string().min(1, "Start time is required"),
    end_time: z.string().min(1, "End time is required"),
    instructor: z.string().optional(),
    program: z.string().min(1, "Program is required"),
    code: z.string().optional(),
    minutes: z.string().optional(),
    units: z.string().optional(),

    // Step 2: Incidence (Optional)
    status: z.string().optional(),
    type: z.string().optional(),
    subtype: z.string().optional(),
    substitute: z.string().optional(),
    description: z.string().optional(),
    department: z.string().optional(),
}).refine((data) => {
    // Validate end_time > start_time
    if (data.start_time && data.end_time) {
        return data.end_time > data.start_time;
    }
    return true;
}, {
    message: "End time must be after start time",
    path: ["end_time"],
});

type AddScheduleFormValues = z.infer<typeof addScheduleFormSchema>;

interface AddScheduleModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (schedule: Schedule) => Promise<void> | void;
    activeDate?: string | null;
    allowAnyDate?: boolean;
    existingSchedules?: Schedule[];
}

export function AddScheduleModal({
    open,
    onOpenChange,
    onSubmit,
    activeDate,
    allowAnyDate = false,
    existingSchedules = [],
}: AddScheduleModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);

    const uniqueInstructors = useInstructors();
    const { isInitialized, fetchZoomData } = useZoomStore();

    // Fetch Zoom data if not initialized
    useEffect(() => {
        if (!isInitialized && open) {
            fetchZoomData();
        }
    }, [isInitialized, fetchZoomData, open]);

    const form = useForm<AddScheduleFormValues>({
        mode: "onChange",
        resolver: zodResolver(addScheduleFormSchema),
        defaultValues: {
            // Step 1
            date: activeDate || "",
            branch: "",
            start_time: "",
            end_time: "",
            instructor: "",
            program: "",
            code: "",
            minutes: "",
            units: "",
            // Step 2
            status: "Yes",
            type: "",
            subtype: "",
            substitute: "",
            description: "",
            department: "",
        },
    });

    // Reset form when modal opens
    useEffect(() => {
        if (open) {
            setStep(1);
            form.reset({
                date: activeDate || "",
                branch: "",
                start_time: "",
                end_time: "",
                instructor: "",
                program: "",
                code: "",
                minutes: "",
                units: "",
                status: "Yes",
                type: "",
                subtype: "",
                substitute: "",
                description: "",
                department: "",
            });
        }
    }, [open, activeDate, form]);

    // Check if date should be locked
    const isDateLocked = !allowAnyDate && !!activeDate;

    // Helper to validate step 1 and move to step 2
    const handleNext = async () => {
        const step1Fields = ['date', 'start_time', 'end_time', 'program', 'branch'] as const;
        const valid = await form.trigger(step1Fields);

        // Also check manual duplicate validation
        if (valid) {
            const values = form.getValues();
            const cleanProgram = normalizeString(values.program);
            const cleanInstructor = normalizeString(values.instructor) || "none";

            const duplicateKey = getSchedulePrimaryKey({
                date: values.date,
                start_time: values.start_time,
                instructor: cleanInstructor,
                program: cleanProgram
            });

            const isDuplicate = existingSchedules.some(s => getSchedulePrimaryKey(s) === duplicateKey);

            if (isDuplicate) {
                form.setError("program", {
                    type: "manual",
                    message: "A schedule already exists",
                });
                return;
            }

            setStep(2);
        }
    };

    const handleSubmit = async (values: AddScheduleFormValues) => {
        if (isSubmitting) return;

        const cleanProgram = normalizeString(values.program);
        const cleanInstructor = normalizeString(values.instructor) || "none";

        // Re-validate duplicates just in case
        const duplicateKey = getSchedulePrimaryKey({
            date: values.date,
            start_time: values.start_time,
            instructor: cleanInstructor,
            program: cleanProgram
        });
        const isDuplicate = existingSchedules.some(s => getSchedulePrimaryKey(s) === duplicateKey);

        if (isDuplicate) {
            form.setError("program", {
                type: "manual",
                message: "A schedule already exists",
            });
            return;
        }

        setIsSubmitting(true);

        try {
            const schedule: Schedule = {
                date: values.date,
                shift: determineShift(values.start_time),
                branch: values.branch || "",
                start_time: values.start_time,
                end_time: values.end_time,
                code: values.code || "",
                instructor: cleanInstructor, // Always store sanitized
                program: cleanProgram, // Always store sanitized
                minutes: values.minutes || "",
                units: values.units || "",
                // Include incidence fields if we are in step 2 (Incidence details)
                ...(step === 2 ? {
                    status: values.status,
                    type: values.type,
                    subtype: values.subtype,
                    substitute: values.substitute,
                    description: values.description,
                    department: values.department,
                } : {})
            };

            await onSubmit(schedule);
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to add schedule:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !isSubmitting && onOpenChange(val)}>
            <DialogContent className="flex max-h-[85vh] flex-col gap-6">
                <DialogHeader>
                    <DialogTitle>{step === 1 ? "Add Schedule Entry" : "Add Incidence Details"}</DialogTitle>
                    <DialogDescription>
                        {step === 1 ? "Add a new schedule entry. Required fields are marked." : "Optional: Add incidence details for this class."}
                    </DialogDescription>
                </DialogHeader>

                {step === 2 && (
                    <ScheduleInfo
                        schedule={{
                            program: form.getValues("program"),
                            start_time: form.getValues("start_time"),
                            end_time: form.getValues("end_time"),
                            instructor: form.getValues("instructor") || "No Instructor",
                        }}
                    />
                )}
                <form onSubmit={form.handleSubmit(handleSubmit)} id="add-schedule-form" className="flex min-h-0 flex-col">
                    {step === 1 && (
                        <ScrollArea className="overflow-auto">
                            <div className="space-y-6 p-1">
                                {/* Date & Time */}
                                <div className="grid grid-cols-2 gap-3">
                                    <Controller
                                        name="date"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid} className="flex flex-col">
                                                <FieldLabel>Date *</FieldLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant={"outline"}
                                                            disabled={isDateLocked}
                                                            className={cn(
                                                                "w-full pl-3 text-left font-normal",
                                                                !field.value && "text-muted-foreground"
                                                            )}
                                                        >
                                                            {field.value ? (
                                                                format(new Date(field.value + "T00:00:00"), "dd/MM/yyyy")
                                                            ) : (
                                                                <span>Pick a date</span>
                                                            )}
                                                            <CalendarIcon className="ml-auto opacity-50" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <Calendar
                                                            mode="single"
                                                            selected={field.value ? new Date(field.value + "T00:00:00") : undefined}
                                                            onSelect={(date) => {
                                                                if (date) {
                                                                    const y = date.getFullYear();
                                                                    const m = String(date.getMonth() + 1).padStart(2, '0');
                                                                    const d = String(date.getDate()).padStart(2, '0');
                                                                    field.onChange(`${y}-${m}-${d}`);
                                                                }
                                                            }}
                                                            disabled={allowAnyDate ? undefined : { before: new Date() }}
                                                            className="[--cell-size:--spacing(7.5)]"
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                            </Field>
                                        )}
                                    />
                                    {/* Time Range */}
                                    <div className="space-y-3">
                                        <Label className={cn("h-4.5", (form.formState.errors.start_time || form.formState.errors.end_time) && "text-destructive")}>
                                            Time *
                                        </Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Controller
                                                name="start_time"
                                                control={form.control}
                                                render={({ field, fieldState }) => (
                                                    <InputGroup>
                                                        <InputGroupInput
                                                            type="time"
                                                            className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                                            {...field}
                                                            aria-invalid={fieldState.invalid}
                                                        />
                                                        <InputGroupAddon>
                                                            <Clock2 className="text-muted-foreground" />
                                                        </InputGroupAddon>
                                                    </InputGroup>
                                                )}
                                            />
                                            <Controller
                                                name="end_time"
                                                control={form.control}
                                                render={({ field, fieldState }) => (
                                                    <InputGroup>
                                                        <InputGroupInput
                                                            type="time"
                                                            className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                                            {...field}
                                                            aria-invalid={fieldState.invalid}
                                                        />
                                                        <InputGroupAddon>
                                                            <Clock2 className="text-muted-foreground" />
                                                        </InputGroupAddon>
                                                    </InputGroup>
                                                )}
                                            />
                                        </div>
                                        {(form.formState.errors.start_time ||
                                            form.formState.errors.end_time) && (
                                                <FieldError
                                                    errors={[
                                                        form.formState.errors.start_time ||
                                                        form.formState.errors.end_time,
                                                    ]}
                                                />
                                            )}
                                    </div>
                                </div>

                                {/* Code & Instructor */}
                                <div className="grid grid-cols-2 gap-3">
                                    <Controller
                                        name="code"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel htmlFor={field.name}>Code</FieldLabel>
                                                <Input {...field} id={field.name} placeholder="Optional" aria-invalid={fieldState.invalid} />
                                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        name="instructor"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel>Instructor</FieldLabel>
                                                <div className="flex gap-1 items-center w-full">
                                                    <InstructorSelector
                                                        value={field.value}
                                                        onChange={(value) => field.onChange(value)}
                                                        instructors={uniqueInstructors}
                                                        aria-invalid={fieldState.invalid}
                                                        className="flex-1"
                                                        popoverClassName="max-w-[220px]"
                                                    />
                                                    {field.value && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-9 w-9 shrink-0"
                                                            onClick={() => field.onChange("")}
                                                            title="Clear instructor"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                            </Field>
                                        )}
                                    />
                                </div>

                                {/* Program */}
                                <Controller
                                    name="program"
                                    control={form.control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor={field.name}>Program *</FieldLabel>
                                            <Input {...field} id={field.name} placeholder="e.g. English Level 5" aria-invalid={fieldState.invalid} />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />

                                <div className="grid grid-cols-2 gap-3">
                                    {/* Branch */}
                                    <Controller
                                        name="branch"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel>Branch *</FieldLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <SelectTrigger className="w-full" aria-invalid={fieldState.invalid}>
                                                        <SelectValue placeholder="Select branch" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {BRANCH_OPTIONS.map((branch) => (
                                                            <SelectItem key={branch} value={branch}>
                                                                {branch}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                            </Field>
                                        )}
                                    />
                                </div>

                                {/* Optional Fields Row */}
                                <div className="grid grid-cols-2 gap-3">
                                    <Controller
                                        name="minutes"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel htmlFor={field.name}>Minutes</FieldLabel>
                                                <Input {...field} id={field.name} placeholder="Optional" aria-invalid={fieldState.invalid} />
                                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        name="units"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel htmlFor={field.name}>Units</FieldLabel>
                                                <Input {...field} id={field.name} placeholder="Optional" aria-invalid={fieldState.invalid} />
                                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                            </Field>
                                        )}
                                    />
                                </div>
                            </div>
                        </ScrollArea>
                    )}

                    {step === 2 && (
                        <IncidenceFormContent
                            form={form as unknown as import("react-hook-form").UseFormReturn<import("./IncidenceFormContent").IncidenceFormValues>}
                            uniqueInstructors={uniqueInstructors}
                            canEdit={true}
                        />
                    )}
                </form>
                <DialogFooter>
                    {step === 1 ? (
                        <>
                            <div className="w-full flex justify-between gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => onOpenChange(false)}
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={handleNext}
                                        disabled={isSubmitting}
                                    >
                                        Next: Incidence <ArrowRight />
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting} form="add-schedule-form">
                                        {isSubmitting && <Loader2 className="animate-spin" />}
                                        Add Entry
                                    </Button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setStep(1)}
                                disabled={isSubmitting}
                            >
                                <ArrowLeft /> Back
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="animate-spin" />}
                                Save with Incidence
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
