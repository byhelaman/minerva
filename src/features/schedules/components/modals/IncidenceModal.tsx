import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/components/auth-provider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Schedule, DailyIncidence } from "../../types";
import { useScheduleDataStore } from "../../stores/useScheduleDataStore";
import { getSchedulePrimaryKey } from "../../utils/string-utils";
import { useInstructors } from "../../hooks/useInstructors";
import { useZoomStore } from "@/features/matching/stores/useZoomStore";
import {
    Form,
} from "@/components/ui/form";
import { BrushCleaning, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IncidenceFormContent } from "./IncidenceFormContent";
import { ScheduleInfo } from "./ScheduleInfo";

// Esquema de validación Zod
const incidenceFormSchema = z.object({
    status: z.string().optional(),
    type: z.string().min(1, "Type is required"),
    subtype: z.string().min(1, "Subtype is required"),
    substitute: z.string().optional(),
    description: z.string().optional(),
    department: z.string().optional(),
}).refine((data) => {
    // Department es requerido A MENOS que el tipo sea 'Novedad'
    if (data.type !== 'Novedad' && (!data.department || data.department.trim() === '')) {
        return false;
    }
    return true;
}, {
    message: "Department is required",
    path: ["department"],
});

type IncidenceFormValues = z.infer<typeof incidenceFormSchema>;

interface IncidenceModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    schedule: Schedule | null;
    initialValues?: Partial<IncidenceFormValues>; // Valores iniciales para Quick Status
}

export function IncidenceModal({ open, onOpenChange, schedule, initialValues }: IncidenceModalProps) {
    const { updateIncidence, deleteIncidence, incidences } = useScheduleDataStore();
    const { hasPermission } = useAuth();
    const canEdit = hasPermission("schedules.manage");
    const [isDeleting, setIsDeleting] = useState(false);

    // Obtener instructores únicos de Supabase (usuarios Zoom)
    const uniqueInstructors = useInstructors();
    const { isInitialized, fetchZoomData } = useZoomStore();

    useEffect(() => {
        if (!isInitialized && open) {
            fetchZoomData();
        }
    }, [isInitialized, fetchZoomData, open]);

    // Inicializar formulario con react-hook-form
    const form = useForm<IncidenceFormValues>({
        resolver: zodResolver(incidenceFormSchema),
        defaultValues: {
            status: "",
            type: "",
            subtype: "",
            substitute: "",
            description: "",
            department: "",
        },
    });

    // Cargar datos existentes o valores iniciales al abrir
    useEffect(() => {
        if (open && schedule) {
            // Prioridad 1: Verificar datos de incidencia existentes
            const existing = incidences.find(i =>
                i.date === schedule.date &&
                i.program === schedule.program &&
                i.start_time === schedule.start_time &&
                i.instructor === schedule.instructor
            );

            if (existing) {
                // Cargar datos de incidencia existentes
                form.reset({
                    status: existing.status || "",
                    type: existing.type || "",
                    subtype: existing.subtype || "",
                    substitute: existing.substitute || "",
                    description: existing.description || "",
                    department: existing.department || "",
                });
            } else if (initialValues) {
                // Prioridad 2: Aplicar valores iniciales de Quick Status
                form.reset({
                    status: initialValues.status || "",
                    type: initialValues.type || "",
                    subtype: initialValues.subtype || "",
                    substitute: initialValues.substitute || "",
                    description: initialValues.description || "",
                    department: initialValues.department || "",
                });
            } else {
                // Prioridad 3: Usar campos existentes del schedule (de Excel/computed) o defaults
                form.reset({
                    status: schedule.status || "",
                    type: schedule.type || "",
                    subtype: schedule.subtype || "",
                    substitute: schedule.substitute || "",
                    description: schedule.description || "",
                    department: schedule.department || "",
                });
            }
        }
    }, [open, schedule, incidences, initialValues, form]);

    // Estado local de envío para deshabilitación robusta del botón
    const [isSubmitting, setIsSubmitting] = useState(false);

    const onSubmit = async (values: IncidenceFormValues) => {
        if (!schedule || isSubmitting) return;

        setIsSubmitting(true);
        form.clearErrors();

        try {
            const incidence: DailyIncidence = {
                // Clave Compuesta
                date: schedule.date,
                program: schedule.program,
                start_time: schedule.start_time,
                instructor: schedule.instructor,

                // Campos base del Schedule
                shift: schedule.shift,
                branch: schedule.branch,
                end_time: schedule.end_time,
                code: schedule.code,
                minutes: schedule.minutes,
                units: schedule.units,

                // Datos de Incidencia del formulario
                status: values.status || null,
                type: values.type || null,
                subtype: values.subtype || null,
                substitute: values.substitute || null,
                description: values.description || null,
                department: values.department || null,
            };

            await updateIncidence(incidence);
            toast.success("Incidence updated");
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save incidence:", error);

            if (error instanceof Error && error.message === 'SCHEDULE_NOT_PUBLISHED') {
                if (canEdit) {
                    toast.error("This schedule has not been published. Please publish it first before adding incidences.");
                } else {
                    toast.error("Update failed. You lack permission to edit this schedule.");
                }
            } else {
                toast.error("Failed to save incidence");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!schedule || isDeleting) return;
        setIsDeleting(true);
        try {
            await deleteIncidence({
                date: schedule.date,
                program: schedule.program,
                start_time: schedule.start_time,
                instructor: schedule.instructor,
                shift: schedule.shift,
                branch: schedule.branch,
                end_time: schedule.end_time,
                code: schedule.code,
                minutes: schedule.minutes,
                units: schedule.units,
                type: undefined,
            });
            onOpenChange(false);
        } catch (error) {
            console.error(error);
        } finally {
            setIsDeleting(false);
        }
    };

    // Verificar si hay una incidencia real guardada para mostrar el botón de eliminar
    const existingIncidence = schedule ? incidences.find(i =>
        getSchedulePrimaryKey(i) === getSchedulePrimaryKey(schedule) &&
        i.type // Asegurar que tiene type (incidencia activa)
    ) : null;

    if (!schedule) return null;


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-6">
                <DialogHeader>
                    <div className="flex gap-2 items-center">
                        <DialogTitle>Incidence Details</DialogTitle>
                        {!canEdit && (
                            <Badge variant="outline">
                                Read Only
                            </Badge>
                        )}
                    </div>
                    <DialogDescription>
                        {canEdit ? "Update status and details for this class." : "View details for this class. You do not have permission to edit."}
                    </DialogDescription>
                </DialogHeader>

                {/* Schedule Info */}
                <ScheduleInfo schedule={schedule} />

                {/* Form */}
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <IncidenceFormContent
                            form={form}
                            uniqueInstructors={uniqueInstructors}
                            canEdit={canEdit}
                        />
                        <DialogFooter className="mt-6 flex sm:justify-between gap-2">
                            {canEdit && existingIncidence ? (
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? <Loader2 className="animate-spin" /> : <BrushCleaning />}
                                    <span className="sr-only">Delete</span>
                                </Button>
                            ) : <div></div>}

                            <div className="flex gap-2 justify-end flex-1">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                                    {canEdit ? "Cancel" : "Close"}
                                </Button>
                                {canEdit && (
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="animate-spin" />}
                                        {isSubmitting ? "Saving..." : "Save Changes"}
                                    </Button>
                                )}
                            </div>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
