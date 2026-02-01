export const SCHEDULE_TABLE_CONFIG = {
    // Estilo visual de la tabla (Blue Medium)
    style: "TableStyleMedium2",

    // Ancho de columnas en caracteres (aprox. ancho de un '0')
    // 10 chars ≈ 70-80px
    columns: {
        "date": 12,        // ~100px
        "shift": 12,
        "branch": 15,
        "start_time": 12,
        "end_time": 12,
        "code": 10,
        "instructor": 25,  // ~200px
        "program": 40,     // ~320px (Ancho para nombres largos)
        "minutes": 8,
        "units": 8,
        "status": 12,
        "substitute": 20,
        "type": 15,
        "subtype": 15,
        "description": 60, // ~480px (Muy ancho para comentarios)
        "department": 20,
        "feedback": 50     // ~400px
    }
};

// Mapeo de índices de columnas para API de Graph (A=1, B=2...)
// Usado si necesitamos referenciar columnas por índice
export const COLUMN_INDEX_MAP: Record<string, number> = {
    "date": 1,
    "shift": 2,
    "branch": 3,
    "start_time": 4,
    "end_time": 5,
    "code": 6,
    "instructor": 7,
    "program": 8,
    "minutes": 9,
    "units": 10,
    "status": 11,
    "substitute": 12,
    "type": 13,
    "subtype": 14,
    "description": 15,
    "department": 16,
    "feedback": 17
};
