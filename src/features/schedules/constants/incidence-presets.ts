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
 * Complete list of 7 standardized presets
 * Optimized based on real usage frequency
 */
export const INCIDENCE_PRESETS: IncidencePreset[] = [
    {
        label: "Enfermedad Instructor",
        status: "Yes",
        type: "Instructor",
        subtype: "Problemas de salud",
        description: "Instructor reportó encontrarse mal de salud // se busca reemplazo",
        department: "Q&T"
    },
    {
        label: "Emergencia Personal",
        status: "Yes",
        type: "Instructor",
        subtype: "Otros",
        description: "Instructor reportó emergencia personal o familiar // se busca reemplazo",
        department: "Q&T"
    },
    {
        label: "Beneficio Cancelación",
        status: "No",
        type: "Novedad",
        subtype: "Beneficio cancelación",
        description: "Retirar clase // asignar nptts // beneficio de cancelación",
        department: ""
    },
    {
        label: "Problema eléctrico/Wi-Fi",
        status: "Yes",
        type: "Instructor",
        subtype: "Problema eléctrico/Wi-Fi",
        description: "Problema eléctrico/Wi-Fi // se busca reemplazo",
        department: "Q&T"
    },
    {
        label: "Sin Disponibilidad",
        status: "Yes",
        type: "Programación",
        subtype: "Fuera de disponibilidad",
        description: "Instructor no cuenta con disponibilidad // se busca reemplazo",
        department: "Programación Latam"
    },
    {
        label: "Cancelación Manual",
        status: "No",
        type: "Novedad",
        subtype: "Otros",
        description: "Retirar clase // Cancelación manual",
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
    INCIDENCE_PRESETS[0], // Enfermedad Instructor
    INCIDENCE_PRESETS[2], // Beneficio Cancelación
    INCIDENCE_PRESETS[3], // Problema eléctrico/Wi-Fi
];
