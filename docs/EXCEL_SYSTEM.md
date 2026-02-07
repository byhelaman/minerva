# Minerva v2 — Sistema de Excel y Horarios

> Documentación del parser de Excel, esquemas de validación, tipos, servicios y utilidades del módulo de horarios.  
> Última actualización: 2026-02-06

---

## Tabla de Contenidos

1. [Parser de Excel](#1-parser-de-excel)
2. [Esquemas de Validación (Zod)](#2-esquemas-de-validación-zod)
3. [Tipos TypeScript](#3-tipos-typescript)
4. [Servicios](#4-servicios)
5. [Utilidades](#5-utilidades)
6. [Sistema de Borrador / Auto-guardado](#6-sistema-de-borrador--auto-guardado)
7. [Archivos del Módulo](#7-archivos-del-módulo)

---

## 1. Parser de Excel

**Archivo:** `src/features/schedules/utils/excel-parser.ts`  
**Librería:** SheetJS (`xlsx`)  
**Formatos aceptados:** `.xlsx`, `.xls`

### Pipeline de parseo

```
Archivo Excel
     │
     ├── file.arrayBuffer()
     │
     ▼
SheetJS read(buffer, { type: "array" })
     │
     ▼
Para cada hoja del workbook:
     │
     ├── ¿La primera fila contiene ≥4 de [date, start_time, end_time, program, instructor]?
     │   │
     │   ├── SÍ → Ruta de formato exportado
     │   │        └── sheet_to_json() → objetos con clave por encabezado
     │   │
     │   └── NO → Ruta de formato estándar (raw)
     │            └── Parseo por posiciones fijas de celda
     │
     ▼
Validación Zod (ScheduleSchema.safeParse) por cada fila
     │
     ├── Válida → schedules[]
     └── Inválida → skipped++
     │
     ▼
Retorna { schedules: Schedule[], skipped: number }
```

### Formato exportado (tabular)

Ejecuta `sheet_to_json()` para obtener un array de objetos con clave por encabezado. Cada fila se procesa:

1. **Normalizar fechas:** Si el valor es un serial de Excel → `excelDateToString(serial)` → ISO string
2. **Normalizar horas:** `formatTimeTo24h(valor)` → `HH:MM`
3. **Rellenar defaults:** `shift` (de `determineShift()`), `minutes` (0), `units` (0)
4. **Validar** con `ScheduleSchema.safeParse()`

**Modo estricto** (`strictValidation: true`):
- Requiere formato exportado (lanza error si no lo es)
- Rechaza columnas no autorizadas fuera de `ALLOWED_HEADERS`

### Formato estándar (raw)

Layout específico del dominio con posiciones fijas de celda:

| Posición Excel | Campo |
|---------------|-------|
| Fila 2, Col O (idx 14) | `date` (fecha del horario) |
| Fila 2, Col V (idx 21) | `branch` (via extracción de keywords) |
| Fila 5, Col A | `code` (código de instructor) |
| Fila 6, Col A | `instructor` (nombre de instructor) |
| Datos Col A (idx 0) | `start_time` |
| Datos Col D (idx 3) | `end_time` |
| Datos Col R (idx 17) | `program` (nombre de grupo) |
| Datos Col T (idx 19) | bloque (fallback para program) |
| Datos Col Z (idx 25) | nombre de programa (para duración y branch) |

**Procesamiento adicional del formato estándar:**

- **Conteo de grupos:** Pre-escanea todas las filas para contar ocurrencias de cada grupo en Col R → usado como `units`
- **Determinación de turno:** `horas < 14 ? "P. ZUÑIGA" : "H. GARCIA"`
- **Determinación de branch:** Busca keywords (`CORPORATE`, `HUB`, `LA MOLINA`, `BAW`, `KIDS`) en el nombre del programa
- **Extracción de duración:** Mapeo `DURATION_MAP` (`30→30`, `45→45`, `60→30`, `CEIBAL→45`, `KIDS→45`)
- **Filtro de tags especiales:** Elimina tags como `@Corp`, `@Lima2`, etc. del nombre de bloque

### Funciones auxiliares del parser

| Función | Propósito |
|---------|-----------|
| `safeString(val)` | `toString()` seguro para null/undefined |
| `matchesWord(text, word)` | Match de palabra con boundary regex (case-insensitive) |
| `findMatchingWord(text, words)` | Primera palabra coincidente de una lista |
| `extractParenthesizedContent(text)` | Extrae contenido entre paréntesis |
| `extractBranchKeyword(text)` | Match contra `BRANCH_KEYWORDS` |
| `filterSpecialTags(text)` | Filtra tags `@Corp`, `@Lima2`, etc. |
| `extractDuration(programName)` | Mapea keyword de programa a duración |
| `determineShift(startTime)` | Determina turno por hora de inicio |
| `excelDateToString(serial)` | Serial de Excel → ISO date string |

### Manejo de errores

- Filas inválidas se **omiten silenciosamente** (`skipped++`), no lanzan error
- Hojas vacías o con filas insuficientes → `continue` (se omite la hoja)
- Faltas de metadatos → `continue`
- Falta de start/end time → `continue`
- Error de validación Zod → `skipped++`
- Modo estricto: lanza `Error` para formato inválido o columnas no autorizadas

---

## 2. Esquemas de Validación (Zod)

### ScheduleSchema

**Archivo:** `src/features/schedules/schemas/schedule-schema.ts`

| Campo | Tipo/Regla | Requerido |
|-------|-----------|-----------|
| `date` | `z.iso.date()` — ISO YYYY-MM-DD validado semánticamente | ✅ |
| `shift` | `z.string().default('')` | No (default vacío) |
| `branch` | `z.string().default('')` | No (default vacío) |
| `start_time` | `z.iso.time({ precision: -1 })` — HH:MM sin segundos | ✅ |
| `end_time` | `z.iso.time({ precision: -1 })` — HH:MM sin segundos | ✅ |
| `code` | `z.string().default('')` | No (default vacío) |
| `instructor` | `z.string().default('')` | No (default vacío) |
| `program` | `z.string().min(1, "Program/Group is missing")` | ✅ (no vacío) |
| `minutes` | `z.string().regex(/^\d+$/).default('0')` | No (default '0') |
| `units` | `z.string().regex(/^\d+$/).default('0')` | No (default '0') |
| `status` | `z.string().optional()` | No (campo de incidencia) |
| `substitute` | `z.string().optional()` | No (campo de incidencia) |
| `type` | `z.string().optional()` | No (campo de incidencia) |
| `subtype` | `z.string().optional()` | No (campo de incidencia) |
| `description` | `z.string().optional()` | No (campo de incidencia) |
| `department` | `z.string().optional()` | No (campo de incidencia) |
| `feedback` | `z.string().optional()` | No (campo de incidencia) |

**Tipo exportado:** `ValidatedSchedule = z.infer<typeof ScheduleSchema>`

### ImportScheduleSchema

**Archivo:** `src/features/schedules/services/microsoft-import-service.ts`

Versión relajada para importaciones desde Microsoft Graph. Mismos campos pero usa validación por regex (`/^\d{4}-\d{2}-\d{2}$/` y `/^\d{2}:\d{2}$/`) en lugar de `z.iso.*`.

---

## 3. Tipos TypeScript

**Archivo:** `src/features/schedules/types.ts`

### Schedule

```typescript
interface Schedule {
    date: string;          // "2025-01-15"
    shift: string;         // "P. ZUÑIGA" | "H. GARCIA" | ""
    branch: string;        // "HUB" | "CORPORATE" | ""
    start_time: string;    // "09:00"
    end_time: string;      // "10:30"
    code: string;          // Código de instructor
    instructor: string;    // Nombre completo del instructor
    program: string;       // Nombre del grupo/programa
    minutes: string;       // "30" | "45" | "60"
    units: string;         // Conteo de sesiones del grupo

    // Campos de incidencia (opcionales)
    status?: string;       // "sustitución" | "cancelación" | "cobertura" | ...
    substitute?: string;   // Nombre del sustituto
    type?: string;         // Tipo de incidencia (de presets)
    subtype?: string;
    description?: string;
    department?: string;
    feedback?: string;
}
```

### Tipos relacionados

```typescript
type DailyIncidence = Schedule;  // Alias semántico

interface PublishedSchedule {
    id: string;
    published_by: string | null;
    schedule_date: string;
    entries_count: number;
    created_at: string;
    updated_at: string;
}

interface SchedulesConfig {
    isConnected: boolean;
    schedulesFolderId: string | null;
    incidencesFileId: string | null;
    schedulesFolderName: string | null;
    incidencesFileName: string | null;
    incidencesWorksheetId: string | null;
    incidencesWorksheetName: string | null;
    incidencesTableId: string | null;
    incidencesTableName: string | null;
}
```

### Tipos de importación

```typescript
interface RowError { key: string; errors: string[] }

interface ImportPreview {
    schedules: Schedule[];
    errorMap: Map<string, string[]>;
    validCount: number;
    invalidCount: number;
}
```

---

## 4. Servicios

### 4.1 schedule-entries-service.ts

**Tabla:** `schedule_entries`  
**Clave compuesta:** `(date, program, start_time, instructor)`

| Método | Descripción |
|--------|-------------|
| `getSchedulesByDate(date)` | SELECT * WHERE date=X. Retorna `{ schedules, incidences }` separados por existencia de campo `type` |
| `getSchedulesByDateRange(start, end)` | SELECT * WHERE date BETWEEN. Misma estructura de retorno |
| `publishSchedules(schedules, publishedBy)` | UPSERT por lotes en conflict `(date, program, start_time, instructor)`. Deduplica entrada. **Excluye campos de incidencia** intencionalmente para preservar los existentes |
| `updateIncidence(key, changes)` | UPDATE campos de incidencia (status, substitute, type, subtype, description, department, feedback) por clave compuesta |
| `getEntriesPendingSync(date)` | SELECT * WHERE date=X AND (synced_at IS NULL OR updated_at > synced_at) |
| `getPendingSyncDates()` | SELECT DISTINCT date WHERE synced_at IS NULL, limit 100 |
| `getAllIncidences(start?, end?)` | SELECT * WHERE status IS NOT NULL, ordenado por date+time |
| `markDateAsSynced(date)` | UPDATE synced_at = now() WHERE date=X |
| `deleteScheduleEntry(key)` | DELETE por clave compuesta |
| `addScheduleEntry(schedule, publishedBy)` | INSERT de entrada individual con todos los campos |

### 4.2 microsoft-import-service.ts

**Interactúa con:** Edge Function `microsoft-graph` (acción `read-table-rows`)

| Función | Descripción |
|---------|-------------|
| `fetchAndValidateFromExcel(config, dateFilter?)` | Obtiene filas de tabla Excel de OneDrive, mapea encabezados via `HEADER_MAP`, valida cada fila con `ImportScheduleSchema`. Retorna `ImportPreview` |
| `validateSchedule(schedule)` | Valida un Schedule individual contra `ImportScheduleSchema` |
| `executeImport(schedules, publishedBy)` | Delega a `scheduleEntriesService.publishSchedules()` |
| `getRowKey(row)` | Genera clave compuesta `date\|program\|start_time\|instructor` |

### 4.3 microsoft-publisher.ts

**Interactúa con:** Edge Function `microsoft-graph` (múltiples acciones)

| Función | Descripción |
|---------|-------------|
| `publishIncidencesToExcel(config, activeDate, endDate?, onStatusUpdate?)` | Obtiene incidencias de DB, construye array de 17 columnas con encabezados, luego hace upsert en tabla Excel existente (por columnas clave `date, program, start_time, instructor`) o crea tabla nueva con estilos de `SCHEDULE_TABLE_CONFIG` |

---

## 5. Utilidades

### 5.1 excel-styles.ts

| Exportación | Propósito |
|-------------|-----------|
| `SCHEDULE_TABLE_CONFIG` | Estilo de tabla (`TableStyleLight1`), anchos de 17 columnas, config de fuente (`Aptos Narrow`, size 11) |
| `COLUMN_INDEX_MAP` | Mapea nombres de campo a índices de columna 1-based (A=1 hasta Q=17) |

### 5.2 merge-utils.ts

| Función | Propósito |
|---------|-----------|
| `mergeSchedulesWithIncidences(schedules, incidences)` | Merge O(N+M) usando clave compuesta `date\|program\|start_time\|instructor`. Construye Map de incidencias, luego mapea sobre schedules haciendo spread de datos de incidencia coincidentes |

### 5.3 overlap-utils.ts

| Función | Propósito |
|---------|-----------|
| `getScheduleKey(schedule)` | Genera `date\|start_time\|end_time\|instructor\|program` |
| `getUniqueScheduleKey(schedule)` | Genera clave de 8 partes: `date\|shift\|branch\|start_time\|end_time\|instructor\|code\|program` |
| `detectOverlaps(schedules)` | Detecta: **conflictos de tiempo** (mismo instructor, horas solapadas) y **clases duplicadas** (mismo slot, diferentes instructores). Retorna `OverlapResult` con tres Sets + conteo |

### 5.4 time-utils.ts

| Función | Propósito |
|---------|-----------|
| `parseTimeValue(value)` | Parsea fracciones seriales de Excel, strings AM/PM, strings 24h → `{ hours, minutes }` |
| `formatTimeTo24h(value)` | Cualquier valor de hora → `HH:MM` (24h) |
| `formatTimeTo12Hour(value)` | Cualquier valor de hora → `hh:mm AM/PM` |
| `ensureTimeFormat(time)` | Asegura formato `HH:MM` desde cualquier input (decimal, `HH:MM:SS`, string) |
| `parseTimeToMinutes(time)` | `"09:30"` → `570` (minutos desde medianoche) |

### 5.5 Utilidades duplicadas — Resueltas ✅

| Función | Estado | Nota |
|---------|--------|------|
| `ensureTimeFormat()` | ✅ Consolidada en `time-utils.ts` | Anteriormente duplicada en `schedule-entries-service.ts` y `microsoft-publisher.ts` (Fase 6) |
| `parseTimeToMinutes()` | ✅ Movida a `time-utils.ts` | Anteriormente privada en `overlap-utils.ts` (Fase 6) |
| `safeString()` | Pendiente | Existe en `excel-parser.ts` y `time-utils.ts` |

---

## 6. Sistema de Borrador / Auto-guardado

### Estado actual

En `src/lib/constants.ts` se definen constantes para un sistema de borradores basado en Tauri FS:

```typescript
STORAGE_FILES = {
    SCHEDULES_DRAFT: "minerva_schedules_draft.json",     // Tauri AppLocalData
    EXCEL_DATA_MIRROR: "minerva_excel_data_mirror.json",  // Tauri AppLocalData
}
```

**Sin embargo**, este sistema está **inactivo actualmente**. No hay código en el módulo de horarios que lea o escriba estos archivos. El flujo de datos actual es:

```
Carga Excel → parseo en memoria → Zustand store (useScheduleDataStore)
                                       │
                                       ├── Publicar → upsert a Supabase (schedule_entries)
                                       │
                                       └── Cargar → fetch desde Supabase → Zustand store
```

Las constantes de archivos existen para **uso futuro** o quedaron de una arquitectura anterior basada en archivos que migró a base de datos.

> **Nota:** La documentación de flujos de usuario (USER_FLOWS.md) describe un sistema de auto-guardado que no está implementado actualmente en el código.

---

## 7. Archivos del Módulo

```
src/features/schedules/
├── components/
│   ├── ExcelUploader.tsx          # UI de carga de archivos Excel
│   ├── ScheduleDashboard.tsx      # Panel principal de horarios
│   ├── ScheduleDataTable.tsx      # Tabla de datos con TanStack Table
│   ├── IncidenceModal.tsx         # Modal de incidencias
│   ├── AddScheduleModal.tsx       # Modal de entrada manual
│   ├── PublishToDbModal.tsx       # Modal de publicación a Supabase
│   ├── ScheduleUpdateBanner.tsx   # Banner de actualización (Realtime)
│   ├── SearchLinkModal.tsx        # Modal de búsqueda de reuniones
│   ├── CreateLinkModal.tsx        # Modal de creación de reuniones
│   ├── AssignLinkModal.tsx        # Modal de asignación de reuniones
│   └── table/                     # Definiciones de columnas TanStack
│       ├── schedule-columns.tsx
│       ├── data-source-columns.tsx
│       └── cell components (StatusCell, InstructorCell, etc.)
├── schemas/
│   └── schedule-schema.ts         # ScheduleSchema (Zod v4)
├── services/
│   ├── schedule-entries-service.ts    # CRUD Supabase schedule_entries
│   ├── microsoft-import-service.ts    # Importación desde OneDrive
│   └── microsoft-publisher.ts         # Publicación a OneDrive
├── stores/
│   ├── useScheduleDataStore.ts    # Zustand: datos de horarios (baseSchedules)
│   ├── useScheduleSyncStore.ts    # Zustand: sincronización y publicación
│   └── useScheduleUIStore.ts      # Zustand: estado de UI (activeDate, filters)
├── utils/
│   ├── excel-parser.ts            # Parser de Excel (.xlsx/.xls)
│   ├── excel-styles.ts            # Config de estilos para Excel
│   ├── merge-utils.ts             # Merge de schedules con incidencias
│   ├── overlap-utils.ts           # Detección de solapamientos
│   └── time-utils.ts              # Parseo y formato de horas
└── types.ts                       # Schedule, PublishedSchedule, SchedulesConfig
```
