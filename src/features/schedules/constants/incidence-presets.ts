/**
 * Incidence Presets
 * 
 * Standardized presets based on analysis of 120+ real incidence cases.
 * These presets cover ~74% of all common incidence scenarios.
 */

export interface IncidencePreset {
    label: string;
    status?: string;
    type: string;
    subtype: string;
    description: string;
    department: string;
}

/**
 * Complete list of 12 standardized presets
 * Optimized based on real usage frequency
 */
export const INCIDENCE_PRESETS: IncidencePreset[] = [
    {
        label: "Enfermedad Instructor",
        status: "Yes",
        type: "Instructor",
        subtype: "Problemas de salud",
        description: "Instructor reportó encontrarse mal de salud / se busca reemplazo",
        department: "Q&T"
    },
    {
        label: "Beneficio Cancelación",
        status: "No",
        type: "Novedad",
        subtype: "Beneficio cancelación",
        description: "Retirar clase / asignar nptts / beneficio de cancelación",
        department: ""
    },
    {
        label: "Falta Programación",
        status: "Yes",
        type: "Programación",
        subtype: "No fue programada",
        description: "Clase no fue programada / se busca reemplazo",
        department: "Programación Latam"
    },
    {
        label: "Programación Errónea",
        status: "No",
        type: "Programación",
        subtype: "No debió ser programada",
        description: "Retirar clase / asignar nptts",
        department: "Programación Latam"
    },
    {
        label: "Sin Disponibilidad",
        status: "Yes",
        type: "Programación",
        subtype: "Fuera de disponibilidad",
        description: "Instructor no cuenta con disponibilidad / se busca reemplazo",
        department: "Programación Latam"
    },
    {
        label: "Problema Eléctrico",
        status: "Yes",
        type: "Instructor",
        subtype: "Imprevistos en red eléctrica",
        description: "Instructor presentó problemas con red eléctrica / se busca reemplazo",
        department: "Q&T"
    },
    {
        label: "Cruce de Horario",
        status: "Yes",
        type: "Programación",
        subtype: "Cruce de programación",
        description: "Clase fue programada con cruce / se busca reemplazo",
        department: "Programación Latam"
    },
    {
        label: "Instructor Bloqueado",
        status: "Yes",
        type: "Programación",
        subtype: "Instructor con bloqueo",
        description: "Instructor tenía bloqueo sin embargo fue programado / se busca reemplazo",
        department: "Programación Latam"
    },
    {
        label: "Emergencia Personal",
        status: "Yes",
        type: "Instructor",
        subtype: "Otros",
        description: "Instructor reportó emergencia personal o familiar / se busca reemplazo",
        department: "Q&T"
    },
    {
        label: "Cambio de Horario",
        status: "Yes",
        type: "Programación",
        subtype: "Programación en otro horario",
        description: "Clase debe ser programada en otro horario",
        department: "Programación Latam"
    },
    {
        label: "Cancelación Manual",
        status: "No",
        type: "Novedad",
        subtype: "Otros",
        description: "Retirar clase / Cancelación manual",
        department: ""
    },
    {
        label: "Programación Manual",
        status: "Yes",
        type: "Novedad",
        subtype: "Otros",
        description: "Programación manual",
        department: ""
    }
];

/**
 * Top 5 most common presets for Quick Status menu
 * Selected based on frequency analysis (~55% of all cases)
 */
export const QUICK_STATUS_PRESETS: IncidencePreset[] = [
    INCIDENCE_PRESETS[0], // Enfermedad Instructor (~18%)
    INCIDENCE_PRESETS[1], // Beneficio Cancelación (~11%)
    // INCIDENCE_PRESETS[2], // Clase No Programada (~11%) 
    INCIDENCE_PRESETS[3], // Sin Disponibilidad (~4%)
    INCIDENCE_PRESETS[4], // Problema Eléctrico (~4%)
];
