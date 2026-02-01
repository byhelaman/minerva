import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { Schedule, DailyIncidence } from "../../types";
import { useScheduleDataStore } from "../../stores/useScheduleDataStore";
import { useInstructors } from "../../hooks/useInstructors";
import { useZoomStore } from "@/features/matching/stores/useZoomStore";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { INCIDENCE_PRESETS } from "../../constants/incidence-presets";
import { InstructorSelector } from "./InstructorSelector";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";

// Zod validation schema
const incidenceFormSchema = z.object({
    status: z.string().min(1, "Status is required"),
    type: z.string().min(1, "Type is required"),
    subtype: z.string().min(1, "Subtype is required"),
    substitute: z.string().optional(),
    description: z.string().optional(),
    department: z.string().min(1, "Department is required"),
}).refine((data) => {
    // If status is 'Substitute', substitute field is required
    if (data.status === 'Substitute' && (!data.substitute || data.substitute.trim() === '')) {
        return false;
    }
    return true;
}, {
    message: "Substitute Instructor is required when status is 'Substitute'",
    path: ["substitute"],
});

type IncidenceFormValues = z.infer<typeof incidenceFormSchema>;

interface IncidenceModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    schedule: Schedule | null;
    initialValues?: Partial<IncidenceFormValues>; // Valores iniciales para Quick Status
}

export function IncidenceModal({ open, onOpenChange, schedule, initialValues }: IncidenceModalProps) {
    const { updateIncidence, incidences } = useScheduleDataStore();
    const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

    // Get unique instructors from Supabase (Zoom users)
    const uniqueInstructors = useInstructors();
    const { isInitialized, fetchZoomData } = useZoomStore();

    useEffect(() => {
        if (!isInitialized && open) {
            fetchZoomData();
        }
    }, [isInitialized, fetchZoomData, open]);

    // Initialize form with react-hook-form
    const form = useForm<IncidenceFormValues>({
        resolver: zodResolver(incidenceFormSchema),
        defaultValues: {
            status: "Yes",
            type: "",
            subtype: "",
            substitute: "",
            description: "",
            department: "",
        },
    });

    // Load existing data or initial values when opening
    useEffect(() => {
        if (open && schedule) {
            // Priority 1: Check for existing incidence data
            const existing = incidences.find(i =>
                i.date === schedule.date &&
                i.program === schedule.program &&
                i.start_time === schedule.start_time &&
                i.instructor === schedule.instructor
            );

            if (existing) {
                // Load existing incidence data
                form.reset({
                    status: existing.status || "",
                    type: existing.type || "",
                    subtype: existing.subtype || "",
                    substitute: existing.substitute || "",
                    description: existing.description || "",
                    department: existing.department || "",
                });
            } else if (initialValues) {
                // Priority 2: Apply initial values from Quick Status
                form.reset({
                    status: initialValues.status || "",
                    type: initialValues.type || "",
                    subtype: initialValues.subtype || "",
                    substitute: initialValues.substitute || "",
                    description: initialValues.description || "",
                    department: initialValues.department || "",
                });
            } else {
                // Priority 3: Reset to empty form
                form.reset({
                    status: "Yes",
                    type: "",
                    subtype: "",
                    substitute: "",
                    description: "",
                    department: "",
                });
            }
            setSelectedPreset(null);
        }
    }, [open, schedule, incidences, initialValues, form]);

    const applyPreset = (preset: typeof INCIDENCE_PRESETS[0]) => {
        form.clearErrors();
        // Toggle: if clicking the same preset, clear it
        if (selectedPreset === preset.label) {
            form.reset({
                status: "Yes",
                type: "",
                subtype: "",
                description: "",
                department: "",
                substitute: form.getValues("substitute"),
            });
            setSelectedPreset(null);
        } else {
            form.setValue("status", preset.status || "");
            form.setValue("type", preset.type);
            form.setValue("subtype", preset.subtype);
            form.setValue("description", preset.description);
            form.setValue("department", preset.department);
            setSelectedPreset(preset.label);
        }
    };

    const onSubmit = async (values: IncidenceFormValues) => {
        if (!schedule) return;

        form.clearErrors();

        try {
            const incidence: DailyIncidence = {
                // Composite Key
                date: schedule.date,
                program: schedule.program,
                start_time: schedule.start_time,
                instructor: schedule.instructor,

                // Base Schedule Fields
                shift: schedule.shift,
                branch: schedule.branch,
                end_time: schedule.end_time,
                code: schedule.code,
                minutes: schedule.minutes,
                units: schedule.units,

                // Incidence Data from form
                status: values.status || undefined,
                type: values.type || undefined,
                subtype: values.subtype || undefined,
                substitute: values.substitute || undefined,
                description: values.description || undefined,
                department: values.department || undefined,
            };

            await updateIncidence(incidence);
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save incidence:", error);
            toast.error("Failed to save incidence");
        }
    };

    if (!schedule) return null;



    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-6">
                <DialogHeader>
                    <DialogTitle>Incidence Details</DialogTitle>
                    <DialogDescription>
                        Update status and details for this class.
                    </DialogDescription>
                </DialogHeader>

                {/* Schedule Info */}
                <div className="space-y-1 border-y py-4">
                    <Label className="text-xs">Schedule Info</Label>
                    <p className="font-medium text-sm">{schedule.program}</p>
                    <div className="flex text-sm text-muted-foreground gap-2">
                        <span> {schedule.start_time} - {schedule.end_time}</span>
                        <span className="text-border">|</span>
                        <span>{schedule.instructor}</span>
                    </div>
                </div>

                {/* Form */}
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <ScrollArea className="h-[400px] pr-3">
                            <div className="space-y-6 px-1 pb-2">
                                <FormField
                                    control={form.control}
                                    name="status"
                                    render={({ field }) => (
                                        <FormItem className="">
                                            <FormLabel className="text-xs">Was the class taught?</FormLabel>
                                            <FormControl>
                                                <Switch
                                                    checked={field.value === "Yes"}
                                                    onCheckedChange={(checked) => {
                                                        field.onChange(checked ? "Yes" : "No");
                                                    }}
                                                    className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />

                                {/* Quick Presets */}
                                <div className="space-y-2">
                                    <Label className="text-xs">Quick Presets</Label>
                                    <ToggleGroup
                                        type="single"
                                        value={selectedPreset || ""}
                                        className="flex flex-wrap"
                                        spacing={2}
                                        onValueChange={(value) => {
                                            // Si value es vacío o undefined, significa que se deseleccionó
                                            if (!value) {
                                                form.reset({
                                                    status: "Yes",
                                                    type: "",
                                                    subtype: "",
                                                    description: "",
                                                    department: "",
                                                    substitute: form.getValues("substitute"),
                                                });
                                                setSelectedPreset(null);
                                                return;
                                            }

                                            // Si es el mismo preset, deseleccionar (toggle off)
                                            if (value === selectedPreset) {
                                                form.reset({
                                                    status: "Yes",
                                                    type: "",
                                                    subtype: "",
                                                    description: "",
                                                    department: "",
                                                    substitute: form.getValues("substitute"),
                                                });
                                                setSelectedPreset(null);
                                                return;
                                            }

                                            // Aplicar nuevo preset
                                            const preset = INCIDENCE_PRESETS.find((preset) => preset.label === value);
                                            if (preset) {
                                                applyPreset(preset);
                                            }
                                        }}
                                    >
                                        {INCIDENCE_PRESETS.map((preset) => (
                                            <ToggleGroupItem
                                                key={preset.label}
                                                size="sm"
                                                variant="outline"
                                                value={preset.label}
                                                className="px-2.5 border-dashed"
                                            >
                                                {preset.label}
                                            </ToggleGroupItem>
                                        ))}
                                    </ToggleGroup>
                                    <div className="flex  gap-2">
                                    </div>
                                </div>

                                {/* Substitute & Type */}
                                <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                        control={form.control}
                                        name="substitute"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Substitute</FormLabel>
                                                <FormControl>
                                                    <InstructorSelector
                                                        value={field.value || ""}
                                                        onChange={field.onChange}
                                                        instructors={uniqueInstructors}
                                                        className="max-w-[225px]"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Type</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="Select" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Instructor">Instructor</SelectItem>
                                                        <SelectItem value="Novedad">Novedad</SelectItem>
                                                        <SelectItem value="Programación">Programación</SelectItem>
                                                        <SelectItem value="Servicios">Servicios</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                        control={form.control}
                                        name="subtype"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Subtype</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="Select" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Problemas de salud">Problemas de salud</SelectItem>
                                                        <SelectItem value="Imprevistos en red eléctrica">Imprevistos en red eléctrica</SelectItem>
                                                        <SelectItem value="Beneficio cancelación">Beneficio cancelación</SelectItem>
                                                        <SelectItem value="No debió ser programada">No debió ser programada</SelectItem>
                                                        <SelectItem value="Fuera de disponibilidad">Fuera de disponibilidad</SelectItem>
                                                        <SelectItem value="Instructor sin competencias">Instructor sin competencias</SelectItem>
                                                        <SelectItem value="Instructor con bloqueo">Instructor con bloqueo</SelectItem>
                                                        <SelectItem value="Error en modalidad">Error en modalidad</SelectItem>
                                                        <SelectItem value="Omisión de horario fijo">Omisión de horario fijo</SelectItem>
                                                        <SelectItem value="Cruce de programación">Cruce de programación</SelectItem>
                                                        <SelectItem value="Error en inicio">Error en inicio</SelectItem>
                                                        <SelectItem value="Error aplicación de pool">Error aplicación de pool</SelectItem>
                                                        <SelectItem value="Programación en otro horario">Programación en otro horario</SelectItem>
                                                        <SelectItem value="Otros">Otros</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="department"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Department</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="Select" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Q&T">Q&T</SelectItem>
                                                        <SelectItem value="Programación Latam">Programación Latam</SelectItem>
                                                        <SelectItem value="Coordinacion B2C (Consumidor)">Coordinacion B2C (Consumidor)</SelectItem>
                                                        <SelectItem value="Coordinacion B2B (Corporativo)">Coordinacion B2B (Corporativo)</SelectItem>
                                                        <SelectItem value="Coordinacion Kids & Teens">Coordinacion Kids & Teens</SelectItem>
                                                        <SelectItem value="Admisiones/TBO"> Admisiones/TBO</SelectItem>
                                                        <SelectItem value="Ventas B2C">Ventas B2C</SelectItem>
                                                        <SelectItem value="Recursos Humanos">Recursos Humanos</SelectItem>
                                                        <SelectItem value="Soporte">Soporte</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Description */}
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Add details..."
                                                    rows={3}
                                                    className="resize-none"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </ScrollArea>
                        <DialogFooter className="mt-6">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
