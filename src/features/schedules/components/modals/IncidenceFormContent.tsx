import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { Instructor } from "@/features/schedules/types";
import { InstructorSelector } from "./InstructorSelector";
import { INCIDENCE_PRESETS } from "../../constants/incidence-presets";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

const DEPARTMENTS = [
    { label: "Admisiones/TBO", value: "Admisiones/TBO" },
    { label: "Coordinación B2C (Consumidor)", value: "Coordinación B2C (Consumidor)" },
    { label: "Coordinación ESNA", value: "Coordinación ESNA" },
    { label: "Coordinación Kids & Teens", value: "Coordinación Kids & Teens" },
    { label: "Matrículas Latam", value: "Matrículas Latam" },
    { label: "Programación Latam", value: "Programación Latam" },
    { label: "Q&T (Quality & Training)", value: "Q&T (Quality & Training)" },
    { label: "Recursos Humanos", value: "Recursos Humanos" },
    { label: "Soporte", value: "Soporte" },
    { label: "Ventas B2C (Consumidor)", value: "Ventas B2C (Consumidor)" },
    // Corporate
    { label: "Coord. de programas B2B", value: "Coord. de programas B2B" },
    { label: "Customer Experience B2B", value: "Customer Experience B2B" },
    { label: "Customer Success B2B", value: "Customer Success B2B" },
    { label: "Recepcion B2B", value: "Recepcion B2B" }
];

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
    uniqueInstructors: Instructor[];
    canEdit: boolean;
}

export function IncidenceFormContent({ uniqueInstructors, canEdit }: IncidenceFormContentProps) {
    const form = useFormContext();
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
        <ScrollArea className="overflow-auto">
            <FieldGroup className="p-1">
                <Controller
                    name="status"
                    control={form.control}
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel>Was the class taught?</FieldLabel>
                            <div className="flex items-center gap-2">
                                <div className="h-5 pt-px">
                                    <Switch
                                        disabled={!canEdit}
                                        checked={field.value === "Yes"}
                                        onCheckedChange={(checked) => {
                                            field.onChange(checked ? "Yes" : "No");
                                        }}
                                    />
                                </div>
                                <span className="text-sm text-muted-foreground">{field.value}</span>
                            </div>
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                    )}
                />

                {/* Quick Presets */}
                <div className="space-y-2">
                    <FieldLabel>Quick Presets</FieldLabel>
                    <ToggleGroup
                        type="single"
                        disabled={!canEdit}
                        spacing={2}
                        value={selectedPreset || ""}
                        className="flex flex-wrap justify-start"
                        onValueChange={(value) => {
                            if (!value) {
                                form.setValue("status", "Yes", { shouldValidate: true });
                                form.setValue("type", "", { shouldValidate: true });
                                form.setValue("subtype", "", { shouldValidate: true });
                                form.setValue("description", "", { shouldValidate: true });
                                form.setValue("department", "", { shouldValidate: true });
                                setSelectedPreset(null);
                                return;
                            }

                            if (value === selectedPreset) {
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
                    <Controller
                        name="substitute"
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel>Substitute</FieldLabel>
                                <div className="flex gap-1 items-center w-full">
                                    <InstructorSelector
                                        disabled={!canEdit}
                                        allowFreeText
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
                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                            </Field>
                        )}
                    />
                    <Controller
                        name="type"
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel>Type</FieldLabel>
                                <Select disabled={!canEdit} onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                    <SelectTrigger className="w-full [&>span]:truncate" aria-invalid={fieldState.invalid}>
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Instructor">Instructor</SelectItem>
                                        <SelectItem value="Novedad">Novedad</SelectItem>
                                        <SelectItem value="Programación">Programación</SelectItem>
                                        <SelectItem value="Servicios">Servicios</SelectItem>
                                        <SelectItem value="Sistema">Sistema</SelectItem>
                                    </SelectContent>
                                </Select>
                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                            </Field>
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Controller
                        name="subtype"
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel>Subtype</FieldLabel>
                                <Select disabled={!canEdit} onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                    <SelectTrigger className="w-full [&>span]:truncate" aria-invalid={fieldState.invalid}>
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel>Instructor</SelectLabel>
                                            <SelectItem value="Tardanza/Ausencia">Tardanza/Ausencia</SelectItem>
                                            <SelectItem value="Emergencia Personal">Emergencia Personal</SelectItem>
                                            <SelectItem value="Problemas de salud">Problemas de salud</SelectItem>
                                            <SelectItem value="Problema eléctrico/Wi-Fi">Problema eléctrico/Wi-Fi</SelectItem>
                                        </SelectGroup>
                                        <SelectGroup>
                                            <SelectLabel>Programación</SelectLabel>
                                            <SelectItem value="Instructor sin competencias">Instructor sin competencias</SelectItem>
                                            <SelectItem value="Fuera de disponibilidad">Fuera de disponibilidad</SelectItem>
                                            <SelectItem value="Instructor con bloqueo">Instructor con bloqueo</SelectItem>
                                            <SelectItem value="Cruce de programación">Cruce de programación</SelectItem>
                                            <SelectItem value="Error aplicación de pool">Error aplicación de pool</SelectItem>
                                            <SelectItem value="No fue programada">No fue programada</SelectItem>
                                            <SelectItem value="No debió ser programada">No debió ser programada</SelectItem>
                                            <SelectItem value="Error de horario">Error de horario</SelectItem>
                                        </SelectGroup>

                                        <SelectGroup>
                                            <SelectLabel>Servicios</SelectLabel>
                                            <SelectItem value="Error en inicio">Error en inicio</SelectItem>
                                            <SelectItem value="Beneficio cancelación">Beneficio cancelación</SelectItem>
                                            <SelectItem value="Programación manual">Programación manual</SelectItem>
                                            <SelectItem value="Cancelación manual">Cancelación manual</SelectItem>
                                            <SelectItem value="Otros">Otros</SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                            </Field>
                        )}
                    />
                    <Controller
                        name="department"
                        control={form.control}
                        render={({ field, fieldState }) => {
                            const [open, setOpen] = useState(false);
                            const [inputValue, setInputValue] = useState("");
                            
                            // Check if typed text perfectly matches any department
                            const allDepts = DEPARTMENTS;
                            const selectedDept = allDepts.find(d => d.value === field.value);
                            const displayValue = selectedDept ? selectedDept.label : field.value;

                            const inputRaw = inputValue.trim().toLowerCase();
                            const hasPerfectMatch = allDepts.some(d => d.label.toLowerCase() === inputRaw || d.value.toLowerCase() === inputRaw);
                            const showFreeTextOption = inputValue.trim().length > 0 && !hasPerfectMatch;
                            
                            return (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Department</FieldLabel>
                                    <div className="flex gap-1 items-center w-full">
                                        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setInputValue(""); }} modal={true}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={open}
                                                    className={cn("w-full justify-between font-normal", !field.value && "text-muted-foreground")}
                                                    disabled={!canEdit}
                                                >
                                                    <span className="truncate">{displayValue || "Select department"}</span>
                                                    <ChevronDown className="w-4 h-4 text-muted-foreground opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-60 p-0 z-200" align="start">
                                                <Command>
                                                    <CommandInput 
                                                        placeholder="Search department..." 
                                                        value={inputValue}
                                                        onValueChange={setInputValue}
                                                    />
                                                    <CommandList className="max-h-75 overflow-y-auto overflow-x-hidden">
                                                        {showFreeTextOption && (
                                                            <CommandGroup heading="Custom">
                                                                <CommandItem
                                                                    value={`__freetext__${inputValue}`}
                                                                    onSelect={() => {
                                                                        field.onChange(inputValue.trim());
                                                                        setInputValue("");
                                                                        setOpen(false);
                                                                    }}
                                                                >
                                                                    <Check className="opacity-0" />
                                                                    <span className="truncate">Use &ldquo;{inputValue.trim()}&rdquo;</span>
                                                                </CommandItem>
                                                            </CommandGroup>
                                                        )}
                                                        <CommandEmpty>No results found.</CommandEmpty>
                                                        <CommandGroup>
                                                            {DEPARTMENTS.map(dept => (
                                                                <CommandItem 
                                                                    key={dept.value} 
                                                                    value={dept.label} 
                                                                    onSelect={() => { 
                                                                        field.onChange(dept.value); 
                                                                        setInputValue("");
                                                                        setOpen(false); 
                                                                    }}
                                                                >
                                                                    <Check
                                                                        className={
                                                                            field.value === dept.value ? "opacity-100" : "opacity-0"
                                                                        }
                                                                    />
                                                                    {dept.label}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                        
                                        {field.value && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 shrink-0"
                                                onClick={() => field.onChange("")}
                                                title="Clear department"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            );
                        }}
                    />
                </div>

                {/* Description */}
                <Controller
                    name="description"
                    control={form.control}
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel>Description</FieldLabel>
                            <Textarea
                                {...field}
                                disabled={!canEdit}
                                placeholder="Add details..."
                                rows={3}
                                className="resize-none"
                                aria-invalid={fieldState.invalid}
                            />
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                    )}
                />
            </FieldGroup>
        </ScrollArea>
    );
}
