import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Instructor } from "@/features/schedules/types";
import { InstructorSelector } from "./InstructorSelector";
import { INCIDENCE_PRESETS } from "../../constants/incidence-presets";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

/** Fields used by IncidenceFormContent */
export interface IncidenceFormValues {
    status?: string;
    type?: string;
    subtype?: string;
    description?: string;
    department?: string;
    substitute?: string;
}

interface IncidenceFormContentProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    form: UseFormReturn<any>;
    uniqueInstructors: Instructor[];
    canEdit: boolean;
}

export function IncidenceFormContent({ form, uniqueInstructors, canEdit }: IncidenceFormContentProps) {
    const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

    const applyPreset = (preset: typeof INCIDENCE_PRESETS[0]) => {
        form.clearErrors();
        // Toggle: if clicking the same preset, clear it
        if (selectedPreset === preset.label) {
            form.setValue("status", "", { shouldValidate: true });
            form.setValue("type", "", { shouldValidate: true });
            form.setValue("subtype", "", { shouldValidate: true });
            form.setValue("description", "", { shouldValidate: true });
            form.setValue("department", "", { shouldValidate: true });
            // Keep substitute as is or clear? IncidenceModal kept it:
            // form.setValue("substitute", form.getValues("substitute")); 
            setSelectedPreset(null);
        } else {
            form.setValue("status", preset.status || "Yes", { shouldValidate: true });
            form.setValue("type", preset.type, { shouldValidate: true });
            form.setValue("subtype", preset.subtype, { shouldValidate: true });
            form.setValue("description", preset.description, { shouldValidate: true });
            form.setValue("department", preset.department, { shouldValidate: true });
            setSelectedPreset(preset.label);
        }
    };

    return (
        <ScrollArea className="h-[400px] pr-3 -mr-3">
            <div className="space-y-6 px-1 pb-2">
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem className="">
                            <FormLabel className="text-xs">Was the class taught?</FormLabel>
                            <FormControl>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        disabled={!canEdit}
                                        checked={field.value === "Yes"}
                                        onCheckedChange={(checked) => {
                                            field.onChange(checked ? "Yes" : "No");
                                        }}
                                        className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                    />
                                    <span className="text-sm text-muted-foreground">{field.value}</span>
                                </div>
                            </FormControl>
                        </FormItem>
                    )}
                />

                {/* Quick Presets */}
                <div className="space-y-2">
                    <Label className="text-xs">Quick Presets</Label>
                    <ToggleGroup
                        type="single"
                        disabled={!canEdit}
                        spacing={2}
                        value={selectedPreset || ""}
                        className="flex flex-wrap justify-start"
                        onValueChange={(value) => {
                            if (!value) {
                                // Deselecting via clicking same item handled by ToggleGroup logic usually gives empty string?
                                // Actually ToggleGroup with type="single" provides the value or empty string if unselected.
                                // We handle explicit clear in applyPreset if matched, but here we just check value.
                                // Let's replicate manual reset if value is empty
                                form.setValue("status", "Yes", { shouldValidate: true });
                                form.setValue("type", "", { shouldValidate: true });
                                form.setValue("subtype", "", { shouldValidate: true });
                                form.setValue("description", "", { shouldValidate: true });
                                form.setValue("department", "", { shouldValidate: true });
                                setSelectedPreset(null);
                                return;
                            }

                            if (value === selectedPreset) {
                                // This block might be redundant if ToggleGroup unselects automatically,
                                // but safe to keep for logic symmetry
                                form.setValue("status", "Yes", { shouldValidate: true });
                                form.setValue("type", "", { shouldValidate: true });
                                form.setValue("subtype", "", { shouldValidate: true });
                                form.setValue("description", "", { shouldValidate: true });
                                form.setValue("department", "", { shouldValidate: true });
                                setSelectedPreset(null);
                                return;
                            }

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
                                    <div className="flex gap-1 items-center w-full">
                                        <InstructorSelector
                                            disabled={!canEdit}
                                            value={field.value || ""}
                                            onChange={(value, _email, _id) => field.onChange(value)}
                                            instructors={uniqueInstructors}
                                            className="flex-1"
                                            popoverClassName="max-w-[225px]"
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
                                <Select disabled={!canEdit} onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
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
                                        <SelectItem value="Sistema">Sistema</SelectItem>
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
                                <Select disabled={!canEdit} onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="Problemas de salud">Problemas de salud</SelectItem>
                                        <SelectItem value="Imprevistos en red eléctrica">Imprevistos en red eléctrica</SelectItem>
                                        <SelectItem value="Cancelación manual">Cancelación manual</SelectItem>
                                        <SelectItem value="Beneficio cancelación">Beneficio cancelación</SelectItem>
                                        <SelectItem value="No fue programada">No fue programada</SelectItem>
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
                                <Select disabled={!canEdit} onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
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
                                    disabled={!canEdit}
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
    );
}
