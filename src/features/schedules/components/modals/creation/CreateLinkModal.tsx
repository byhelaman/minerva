import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScheduleDataTable } from "@schedules/components/table/ScheduleDataTable";
import { useZoomStore } from "@/features/matching/stores/useZoomStore";
import { MatchingService } from "@/features/matching/services/matcher";
import { ArrowLeft, Loader2, HelpCircle, RefreshCw, Hand, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHostMap } from "@schedules/hooks/useHostMap";
import { useInstructors } from "@schedules/hooks/useInstructors";
import { getCreateLinkColumns, type ValidationResult, type ValidationStatus } from "./create-link-columns";

interface CreateLinkModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateLinkModal({ open, onOpenChange }: CreateLinkModalProps) {
    const { meetings, users, isLoadingData, fetchZoomData, createMeetings, updateMatchings, isExecuting } = useZoomStore();

    // Usar hook reutilizable para mapa de anfitriones
    const hostMap = useHostMap();

    // Estado del asistente
    const [step, setStep] = useState<'input' | 'results'>('input');
    const [inputText, setInputText] = useState("");
    const [isValidating, setIsValidating] = useState(false);
    const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
    const [dailyOnly, setDailyOnly] = useState(false);

    // Reset cuando se cierra el modal
    useEffect(() => {
        if (!open) {
            setStep('input');
            setInputText("");
            setValidationResults([]);
            setIsValidating(false);
            setDailyOnly(false);
        }
    }, [open]);

    // Crear instancia del MatchingService (ahora permite arrays vacíos)
    const matcher = useMemo(() => {
        return new MatchingService(meetings, users);
    }, [meetings, users]);

    // Función de revalidación que usa datos frescos del store
    const revalidateWithFreshData = () => {
        // Obtener datos frescos directamente del store
        const { meetings: freshMeetings, users: freshUsers } = useZoomStore.getState();
        const freshMatcher = new MatchingService(freshMeetings, freshUsers);

        const lines = inputText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (lines.length === 0) {
            setIsValidating(false);
            return;
        }

        const results: ValidationResult[] = lines.map((inputName, index) => {
            const matchResult = freshMatcher.findMatchByTopic(inputName, { ignoreLevelMismatch: true });

            if (matchResult.status === 'not_found') {
                return {
                    id: `${index}-${inputName}`,
                    inputName,
                    status: 'to_create' as ValidationStatus,
                };
            }

            if (matchResult.status === 'ambiguous' && matchResult.ambiguousCandidates) {
                return {
                    id: `${index}-${inputName}`,
                    inputName,
                    status: 'ambiguous' as ValidationStatus,
                    ambiguousCandidates: matchResult.ambiguousCandidates.map(m => ({
                        meeting_id: m.meeting_id,
                        topic: m.topic,
                        join_url: m.join_url,
                        host_id: m.host_id,
                    })),
                };
            }

            const matchedMeeting = matchResult.matchedCandidate || matchResult.bestMatch;
            return {
                id: `${index}-${inputName}`,
                inputName,
                status: 'exists' as ValidationStatus,
                meeting_id: matchedMeeting?.meeting_id,
                join_url: matchedMeeting?.join_url,
                matchedTopic: matchedMeeting?.topic,
                host_id: matchedMeeting?.host_id,
                created_at: matchedMeeting?.created_at,
            };
        });

        setValidationResults(results);
        setRowSelection({});
        setIsValidating(false);
    };

    // Función de validación usando MatchingService
    const handleValidate = async () => {
        const lines = inputText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (lines.length === 0) return;

        if (meetings.length === 0) {
            toast.info("No existing Zoom meetings found.");
        }

        setIsValidating(true);
        // Validación instantánea sin delays artificiales

        const results: ValidationResult[] = lines.map((inputName, index) => {
            // Usar findMatchByTopic que no requiere instructor
            // Pasamos ignoreLevelMismatch: true para detectar duplicados incluso si el nivel cambió
            const matchResult = matcher.findMatchByTopic(inputName, { ignoreLevelMismatch: true });

            // Mapear el resultado del matcher a ValidationResult
            if (matchResult.status === 'not_found') {
                // No existe - se puede crear
                return {
                    id: `${index}-${inputName}`,
                    inputName,
                    status: 'to_create' as ValidationStatus,
                };
            }

            if (matchResult.status === 'ambiguous' && matchResult.ambiguousCandidates) {
                // Múltiples coincidencias
                return {
                    id: `${index}-${inputName}`,
                    inputName,
                    status: 'ambiguous' as ValidationStatus,
                    ambiguousCandidates: matchResult.ambiguousCandidates.map(m => ({
                        meeting_id: m.meeting_id,
                        topic: m.topic,
                        join_url: m.join_url,
                        host_id: m.host_id,
                    })),
                };
            }

            // Existe (assigned o to_update)
            const matchedMeeting = matchResult.matchedCandidate || matchResult.bestMatch;
            return {
                id: `${index}-${inputName}`,
                inputName,
                status: 'exists' as ValidationStatus,
                meeting_id: matchedMeeting?.meeting_id,
                join_url: matchedMeeting?.join_url,
                matchedTopic: matchedMeeting?.topic,
                host_id: matchedMeeting?.host_id,
                created_at: matchedMeeting?.created_at,
            };
        });

        setValidationResults(results);
        setIsValidating(false);
        setStep('results');
    };

    // Función de refresh que actualiza datos de Zoom y luego revalida
    const handleRefresh = async () => {
        setIsValidating(true);
        await fetchZoomData();
        revalidateWithFreshData();
    };

    // Selección de filas
    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

    // Reset selección al cambiar de paso
    useEffect(() => {
        setRowSelection({});
    }, [step]);

    // Contadores de estado (Totales para la barra de estado)
    const statusCounts = useMemo(() => {
        const counts = { to_create: 0, exists: 0, ambiguous: 0, manual: 0 };
        for (const r of validationResults) {
            if (r.status === 'to_create') counts.to_create++;
            else if (r.status === 'exists') counts.exists++;
            else if (r.status === 'ambiguous') counts.ambiguous++;
            else if (r.status === 'manual') counts.manual++;
        }
        return counts;
    }, [validationResults]);

    // Contadores para selección
    const selectedCount = useMemo(() => {
        return Object.keys(rowSelection).length;
    }, [rowSelection]);

    // Manejador para volver atrás
    const handleBack = () => {
        setStep('input');
        setValidationResults([]);
    };

    // Manejador para seleccionar candidato manualmente
    const handleSelectCandidate = (rowId: string, candidate: { meeting_id: string; topic: string; join_url?: string; host_id?: string } | null) => {
        setValidationResults(prev => prev.map(row => {
            if (row.id === rowId) {
                if (!candidate) {
                    // Reiniciar a ambiguo
                    return {
                        ...row,
                        status: 'ambiguous' as ValidationStatus,
                        meeting_id: undefined,
                        join_url: undefined,
                        matchedTopic: undefined,
                    };
                }

                return {
                    ...row,
                    status: 'manual' as ValidationStatus,
                    meeting_id: candidate.meeting_id,
                    join_url: candidate.join_url,
                    matchedTopic: candidate.topic,
                    matchedCandidate: candidate,
                    host_id: candidate.host_id,
                };
            }
            return row;
        }));
    };

    // Manejador para marcar como nuevo (ignorar coincidencias)
    const handleMarkAsNew = (rowId: string) => {
        setValidationResults(prev => prev.map(row => {
            if (row.id === rowId) {
                // Guardar match anterior si viene de 'exists'
                const previousMatch = row.status === 'exists' && row.meeting_id ? {
                    meeting_id: row.meeting_id,
                    join_url: row.join_url,
                    matchedTopic: row.matchedTopic,
                    host_id: row.host_id,
                } : undefined;

                return {
                    ...row,
                    status: 'to_create' as ValidationStatus,
                    meeting_id: undefined,
                    join_url: undefined,
                    matchedTopic: undefined,
                    forcedNew: true,
                    previousMatch: previousMatch || row.previousMatch, // Mantener si ya existía
                };
            }
            return row;
        }));
    };

    // Manejador para revertir a ambiguo
    const handleRevertToAmbiguous = (rowId: string) => {
        setValidationResults(prev => prev.map(row => {
            if (row.id === rowId) {
                return {
                    ...row,
                    status: 'ambiguous' as ValidationStatus,
                    forcedNew: undefined,
                };
            }
            return row;
        }));
    };

    // Manejador para revertir a exists (desde forcedNew con previousMatch)
    const handleRevertToExists = (rowId: string) => {
        setValidationResults(prev => prev.map(row => {
            if (row.id === rowId && row.previousMatch) {
                return {
                    ...row,
                    status: 'exists' as ValidationStatus,
                    meeting_id: row.previousMatch.meeting_id,
                    join_url: row.previousMatch.join_url,
                    matchedTopic: row.previousMatch.matchedTopic,
                    host_id: row.previousMatch.host_id,
                    forcedNew: undefined,
                    previousMatch: undefined,
                };
            }
            return row;
        }));
    };

    // Manejador para cambiar fecha seleccionada
    const handleDateChange = (rowId: string, date: string) => {
        setValidationResults(prev => prev.map(row => {
            if (row.id === rowId) {
                return { ...row, selected_date: date };
            }
            return row;
        }));
    };

    // Manejador para cambiar hora de inicio
    const handleTimeChange = (rowId: string, time: string) => {
        setValidationResults(prev => prev.map(row => {
            if (row.id === rowId) {
                return { ...row, start_time: time };
            }
            return row;
        }));
    };

    // Manejador para cambiar host seleccionado
    const handleHostChange = (rowId: string, host: string, email: string, _id: string) => {
        setValidationResults(prev => prev.map(row => {
            if (row.id === rowId) {
                return { ...row, selected_host: host, selected_host_email: email };
            }
            return row;
        }));
    };

    // Lista de hosts disponibles usando el hook centralizado
    const hostsList = useInstructors();

    // Columnas con manejador memorizado
    const columns = useMemo(() =>
        getCreateLinkColumns(hostMap, handleSelectCandidate, handleMarkAsNew, handleRevertToAmbiguous, handleRevertToExists, dailyOnly, handleDateChange, handleTimeChange, handleHostChange, hostsList),
        [hostMap, dailyOnly, hostsList]
    );

    // Líneas analizadas para vista previa
    const parsedLines = inputText.split('\n').filter(l => l.trim().length > 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn(
                "flex flex-col max-h-[85vh]",
                step === 'input' ? "sm:max-w-lg" : "max-w-4xl!"
            )}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {step === 'results' && (
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={handleBack}
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        )}
                        Create Zoom Links
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'input'
                            ? "Enter program names (one per line) to validate."
                            : "Review and confirm Zoom meeting links"
                        }
                    </DialogDescription>
                </DialogHeader>

                {/* Step 1: Input */}
                {step === 'input' && (
                    <>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-3">
                                <Label htmlFor="programs">Program Names</Label>
                                <Textarea
                                    id="programs"
                                    placeholder="Corporate English 9AM&#10;Kids Program 10AM&#10;Business English 2PM"
                                    className="min-h-[240px] font-mono text-sm max-h-[400px] resize-none no-scrollbar"
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                />
                                <p className="text-sm text-muted-foreground">
                                    {parsedLines.length} program{parsedLines.length !== 1 ? 's' : ''} to validate
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleValidate}
                                disabled={parsedLines.length === 0 || isValidating || isLoadingData}
                            >
                                {isValidating ? (
                                    <>
                                        <Loader2 className="animate-spin" />
                                        Validating...
                                    </>
                                ) : (
                                    "Validate"
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {/* Step 2: Results */}
                {step === 'results' && (
                    <>
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden pr-2">
                            {isLoadingData || isValidating || isExecuting ? (
                                <div className="flex flex-col items-center justify-center gap-2 h-full border border-dashed rounded-lg bg-muted/10 p-8 min-h-[400px]">
                                    <div className="relative flex items-center justify-center">
                                        <Loader2 className="h-6 w-6 animate-spin" />
                                    </div>
                                    <div className="text-center space-y-2">
                                        <p className="text-sm font-medium">
                                            {isExecuting ? "Processing changes..." : (isLoadingData ? "Loading Zoom data..." : "Validating schedules...")}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {isExecuting ? "Syncing with Zoom and updating records" : (isLoadingData ? "Fetching meetings and users" : "Analyzing input data")}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <ScheduleDataTable
                                    columns={columns}
                                    data={validationResults}
                                    hideFilters={false}
                                    filterConfig={{
                                        showStatus: true,
                                        showIncidenceType: false,
                                    }}
                                    hideUpload
                                    hideActions
                                    hideOverlaps
                                    onRefresh={handleRefresh}
                                    disableRefresh={isValidating || isLoadingData}
                                    enableRowSelection={(row) => row.status !== 'ambiguous'}
                                    controlledSelection={rowSelection}
                                    onControlledSelectionChange={setRowSelection}
                                    initialPageSize={25}
                                    statusOptions={[
                                        { label: "New", value: "to_create", icon: PlusCircle },
                                        { label: "Exists", value: "exists", icon: RefreshCw },
                                        { label: "Ambiguous", value: "ambiguous", icon: HelpCircle },
                                        { label: "Manual", value: "manual", icon: Hand },
                                    ]}
                                />
                            )}
                        </div>
                        <DialogFooter className="mt-auto flex-col sm:flex-row gap-4">
                            {/* Barra de estado con conteos a la izquierda */}
                            <div className="flex items-center gap-3 mr-auto text-sm text-muted-foreground">
                                {isValidating || isExecuting ? (
                                    <span className="text-muted-foreground">Processing...</span>
                                ) : (
                                    <>
                                        <span>New: <strong className="text-foreground font-medium">{statusCounts.to_create}</strong></span>
                                        <span className="text-border">|</span>
                                        <span>Exists: <strong className="text-foreground font-medium">{statusCounts.exists}</strong></span>
                                        {statusCounts.ambiguous > 0 && (
                                            <>
                                                <span className="text-border">|</span>
                                                <span>Ambiguous: <strong className="text-foreground font-medium">{statusCounts.ambiguous}</strong></span>
                                            </>
                                        )}
                                        {statusCounts.manual > 0 && (
                                            <>
                                                <span className="text-border">|</span>
                                                <span>Manual: <strong className="text-foreground font-medium">{statusCounts.manual}</strong></span>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Botones a la derecha */}
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 mr-2">
                                    <Switch
                                        id="daily-only"
                                        checked={dailyOnly}
                                        onCheckedChange={setDailyOnly}
                                        disabled={isExecuting || isValidating || isLoadingData}
                                        className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                    />
                                    <Label htmlFor="daily-only" className={cn('text-sm cursor-pointer', dailyOnly ? 'text-primary' : 'text-muted-foreground')}>
                                        Daily links
                                    </Label>
                                </div>

                                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExecuting}>
                                    Cancel
                                </Button>

                                <Button
                                    disabled={selectedCount === 0 || isExecuting || isValidating || isLoadingData}
                                    onClick={async () => {
                                        const selectedRows = validationResults.filter(r => rowSelection[r.id]);

                                        // Separar acciones
                                        const toCreate = selectedRows
                                            .filter(r => r.status === 'to_create')
                                            .map(r => ({
                                                topic: r.inputName,
                                                startTime: r.start_time,
                                                selectedDate: r.selected_date,
                                                schedule_for: r.selected_host_email // Ya tenemos el email directamente
                                            }));

                                        const updates = selectedRows
                                            .filter(r => (r.status === 'exists' || r.status === 'manual') && r.meeting_id)
                                            .map(r => {
                                                let schedule_for = undefined;
                                                if (r.host_id) {
                                                    const hostUser = users.find(u => u.id === r.host_id);
                                                    if (hostUser) schedule_for = hostUser.email;
                                                }
                                                return {
                                                    meeting_id: r.meeting_id!,
                                                    topic: r.inputName,
                                                    schedule_for
                                                };
                                            });

                                        if (toCreate.length === 0 && updates.length === 0) return;

                                        // Ejecutar en paralelo para máxima velocidad
                                        let successCount = 0;
                                        let failureCount = 0;

                                        if (toCreate.length > 0) {
                                            const res = await createMeetings(toCreate, { dailyOnly });
                                            successCount += res.succeeded;
                                            failureCount += res.failed;
                                        }

                                        if (updates.length > 0) {
                                            const res = await updateMatchings(updates);
                                            successCount += res.succeeded;
                                            failureCount += res.failed;
                                        }

                                        if (successCount > 0) {
                                            toast.success(`Successfully processed ${successCount} meetings`);
                                        }

                                        if (failureCount > 0) {
                                            toast.error(`Failed to process ${failureCount} meetings`);
                                        }

                                        if (successCount > 0) {
                                            // 1. Actualización ÚNICA y forzada de datos
                                            await fetchZoomData({ force: true });

                                            // 2. Revalidación con datos frescos
                                            revalidateWithFreshData();
                                        }
                                    }}
                                >
                                    {isExecuting || isLoadingData ? (
                                        <>
                                            <Loader2 className="animate-spin" />
                                            Executing...
                                        </>
                                    ) : (
                                        selectedCount > 0 ? `Execute (${selectedCount})` : 'Execute'
                                    )}
                                </Button>
                            </div>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
