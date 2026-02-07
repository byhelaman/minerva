# Minerva v2 — Motor de Emparejamiento (Matching Engine)

> Documentación técnica completa del sistema de emparejamiento Zoom.  
> Fuente de verdad: `src/features/matching/config/matching.config.json`  
> Última actualización: 2026-02-06

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Arquitectura de Archivos](#2-arquitectura-de-archivos)
3. [Flujo de Emparejamiento](#3-flujo-de-emparejamiento)
4. [Normalización](#4-normalización)
5. [Búsqueda de Candidatos (3 niveles)](#5-búsqueda-de-candidatos-3-niveles)
6. [Scoring y Penalizaciones](#6-scoring-y-penalizaciones)
7. [Decisión Final](#7-decisión-final)
8. [Heurísticas Especiales](#8-heurísticas-especiales)
9. [Configuración](#9-configuración)
10. [Web Worker e Integración](#10-web-worker-e-integración)
11. [Tipos TypeScript](#11-tipos-typescript)
12. [Ejemplos Prácticos](#12-ejemplos-prácticos)
13. [Debugging](#13-debugging)

---

## 1. Visión General

El sistema conecta **horarios de clases (schedules)** con **reuniones de Zoom (meetings)** e **instructores (users)**. El objetivo es encontrar automáticamente qué reunión corresponde a cada clase programada y verificar si el instructor correcto es el host.

```
┌─────────────────────────────────────────────────────────────────┐
│                        MatchingService                          │
│                      (services/matcher.ts)                      │
├─────────────────────────────────────────────────────────────────┤
│  1. Buscar Instructor                                           │
│     ├── Exact name → Exact display → Token subset → Fuse.js    │
├─────────────────────────────────────────────────────────────────┤
│  2. Buscar Candidatos de Reunión                                │
│     ├── Exact Match (diccionario normalizado)                   │
│     ├── Fuse.js (búsqueda fuzzy, threshold ≤ 0.3)              │
│     └── Token Set Match (overlap ≥ 0.5, ≥ 2 tokens)            │
├─────────────────────────────────────────────────────────────────┤
│  3. Scoring (ScoringEngine + 10 penalizaciones)                 │
│     └── Cada candidato inicia con 100 puntos                    │
├─────────────────────────────────────────────────────────────────┤
│  4. Decisión                                                    │
│     ├── assigned    (score ≥ 50, confianza alta/media)          │
│     ├── to_update   (match encontrado pero host ≠ instructor)   │
│     ├── ambiguous   (score < 50 o candidatos muy cercanos)      │
│     └── not_found   (descalificado o sin candidatos)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Arquitectura de Archivos

```
src/features/matching/
├── types.ts                      # Tipos compartidos: ZoomMeeting, ZoomUser, ZoomMeetingCandidate, MatchResult
├── config/
│   ├── matching.config.json      # Fuente de verdad: penalizaciones, umbrales, palabras irrelevantes
│   ├── matching.config.ts        # Exporta constantes tipadas: PENALTIES, THRESHOLDS, PROGRAM_TYPE_GROUPS, LEVENSHTEIN_CONFIG
│   └── matching.schema.json      # JSON Schema para validar matching.config.json
├── scoring/
│   ├── penalties.ts              # 10 funciones de penalización + registro ALL_PENALTIES
│   ├── scorer.ts                 # ScoringEngine, scoreCandidate(), evaluateMatch()
│   └── types.ts                  # ScoringContext, MatchOptions, AppliedPenalty, etc.
├── services/
│   └── matcher.ts                # MatchingService — orquesta búsqueda e integración
├── utils/
│   └── normalizer.ts             # normalizeString(), removeIrrelevant(), canonical()
├── workers/
│   └── match.worker.ts           # Web Worker: recibe INIT/MATCH, ejecuta fuera del hilo principal
└── stores/
    └── useZoomStore.ts           # Zustand: datos Zoom, Worker lifecycle, batch operations
```

> **Nota:** No existe `irrelevant-words.json` como archivo separado — las palabras irrelevantes están embebidas en `matching.config.json`. El logger (`src/lib/logger.ts`) es una utilidad compartida, no específica del matching.

---

## 3. Flujo de Emparejamiento

```
Web Worker recibe mensaje { type: 'MATCH', schedules }
     │
     ▼
MatchingService.matchAll(schedules)
     │  └── Limpia caché de Levenshtein (max 5000 entradas)
     │
     ▼  Para cada schedule:
     │
     ├── 1. Buscar instructor
     │   ├── Exact name (diccionario normalizado)
     │   ├── Exact display name
     │   ├── Token subset (tokens del instructor ⊆ tokens del candidato)
     │   └── Fuse.js fuzzy (threshold 0.45, requiere ≥ minRequiredMatches tokens)
     │
     ├── 2. Buscar reuniones candidatas
     │   ├── Exact match → Fuse.js → Token set (ver §5)
     │
     ├── 3. Evaluar candidatos (scorer)
     │   ├── Aplicar 10 penalizaciones
     │   └── Decidir: assigned / ambiguous / not_found
     │
     └── 4. Validar host (si hay usuarios cargados)
         ├── host_id === instructor.id → `assigned`
         └── host_id ≠ instructor.id → `to_update`
     │
     ▼
Worker.postMessage({ type: 'MATCH_RESULT', results })
```

---

## 4. Normalización

**Archivo:** `utils/normalizer.ts`

### normalizeString()

Orden exacto de operaciones:

1. Reemplazar `-`, `_`, `–`, `—` con espacios
2. `removeIrrelevant()` — elimina palabras irrelevantes via regex `\b(word1|word2|...)\b` con flag `gi`
3. `.normalize("NFD")` — descomposición Unicode
4. Eliminar marcas diacríticas (`[\u0300-\u036f]`)
5. Convertir a minúsculas
6. Normalizar comillas fancy a `'`
7. Reemplazar caracteres no-word/no-space/no-quote con espacio
8. Colapsar múltiples espacios
9. Trim

```
Input:  "BVP - JUAN GARCÍA (ONLINE) L5"
                    │
  [1] "BVP   JUAN GARCÍA (ONLINE) L5"     ← guiones → espacios
  [2] "BVP   JUAN GARCÍA  L5"             ← "ONLINE" eliminado (irrelevante)
  [3] "BVP   JUAN GARCIA  L5"             ← NFD + diacríticos eliminados
  [4] "bvp   juan garcia  l5"             ← minúsculas
  [5] "bvp juan garcia l5"                ← normalización final
```

### canonical()

```typescript
canonical(s) = normalizeString(s).replace(/\W+/g, "")
// "bvp juan garcia l5" → "bvpjuangarcial5"
```

### Palabras irrelevantes

Se toman de `matching.config.json` → sección `irrelevantWords`. Contiene **10 categorías**:

| Categoría | Ejemplos |
|-----------|----------|
| `modalities` | online, presencial, virtual, hibrido, remoto, f2f, zoom |
| `languages` | english, ingles, espanol, aleman, coreano, chino, ruso, japones, frances, italiano, mandarin, eng |
| `levels` | beginner, intermediate, advanced, upper, basic, master, nivelacion, crash, complete, revision, repaso, true |
| `cefrLevels` | a1, a2, b1, b2, c1, c2 |
| `programTags` | pia, mod, esp, otg, kids, see, impact, time, zone, travel, summer, premium, business, social, gerencia, beca, camacho, keynotes |
| `locations` | per, ven, arg, uru |
| `connectors` | de, del, la, las, los, y, and |
| `genericWords` | grupo, group, level, nivel, clase, manual, class |
| `techTerms` | java, python, javascript, react, node, qa, automation |
| `patterns` (regex) | `electiv[oa]s?`, `leccion[es]?`, `repit[eo]?`, `evaluacion[es]?`, `looks?`, `keynotes?`, `tz\d+` |

> Adicionalmente, `penalties.ts` agrega `group` y `grupo` al set `IRRELEVANT_TOKENS` en runtime (para evitar que cuenten como tokens significativos).

---

## 5. Búsqueda de Candidatos (3 niveles)

El sistema intenta tres estrategias en orden de precisión:

### Nivel 1: Exact Match (Diccionario)

```
normalizeString(topic) → buscar en meetingsDict[key]
```

Si existe una entrada exacta en el diccionario, retorna los meetings inmediatamente. El diccionario maneja colisiones (múltiples meetings con el mismo topic normalizado).

### Nivel 2: Fuse.js (Búsqueda Fuzzy)

Se activa solo si el exact match falla.

| Parámetro | Valor |
|-----------|-------|
| `threshold` | `THRESHOLDS.FUSE_MAX_SCORE` = **0.3** |
| `keys` | `['normalized_topic']` |
| `includeScore` | `true` |
| `ignoreLocation` | `true` |

Filtra resultados con `score ≤ 0.3` (Fuse.js usa 0 = perfecto, 1 = sin match).

### Nivel 3: Token Set Match (Fallback)

Se activa solo si Fuse.js no encuentra candidatos adecuados.

1. Tokeniza el query en un Set de palabras
2. Para cada meeting, calcula la intersección de tokens
3. Filtros de calidad:
   - Al menos un token significativo en la intersección (no numérico, longitud > 2)
   - `intersection.size ≥ MIN_MATCHING_TOKENS` (**2**)
   - `overlapRatio ≥ TOKEN_OVERLAP_MIN` (**0.5**)

---

## 6. Scoring y Penalizaciones

### ScoringEngine

Cada candidato inicia con **100 puntos** (`BASE_SCORE`). Las 10 funciones de penalización se aplican en orden. El score se fija en `Math.max(0, score)`. Si llega a 0 → `isDisqualified = true`.

### Tabla completa de penalizaciones

| # | Nombre | Puntos | Condición de activación |
|---|--------|--------|------------------------|
| 1 | `CRITICAL_TOKEN_MISMATCH` | **-100** | Query y topic tienen tipos de programa mutuamente excluyentes (CH vs TRIO vs DUO vs PRIVADO vs BVS) |
| 2 | `LEVEL_CONFLICT` | **-100** | Ambos tienen niveles explícitos (L/N/Level/Nivel + número) sin intersección |
| 2b | `LEVEL_MISMATCH_IGNORED` | **-10** | Mismo que ↑ pero con `options.ignoreLevelMismatch = true` |
| 3 | `COMPANY_CONFLICT` | **-100** | El primer token significativo del query ≠ tokens de empresa del topic (entre paréntesis). Distancia Levenshtein > 2. Excepción: se omite si el token del query es parte del nombre de persona en el topic |
| 4 | `PROGRAM_VS_PERSON` | **-80** | Query tiene token de tipo programa Y topic tiene formato de persona. Excepciones: (a) topic también tiene tokens programa/estructurales, (b) query tiene prefijo BVP/BVD/BVS |
| 5 | `STRUCTURAL_TOKEN_MISSING` | **-50** | Query tiene token de un grupo de sinónimos pero topic no tiene ningún token de ese grupo. Se omite con `ignoreLevelMismatch` |
| 6 | `WEAK_MATCH` | **-80** | Cobertura < umbral mínimo (0.66 normal, 0.40 relajado) O cero tokens distintivos coinciden |
| 6b | `PARTIAL_MATCH_MISSING_TOKENS` | **variable** | Cobertura adecuada pero faltan tokens. Puntos según contexto (ver detalle abajo) |
| 7 | `GROUP_NUMBER_CONFLICT` | **-80** | Ambos tienen números no-nivel sin intersección. Se omite con `ignoreLevelMismatch` |
| 8 | `NUMERIC_CONFLICT` | **-30** | Todos los números (incluyendo niveles) están en conflicto. Se omite con `ignoreLevelMismatch` |
| 9 | `ORPHAN_NUMBER_WITH_SIBLINGS` | **-60** | Topic tiene número no presente en query Y existen candidatos hermanos (mismo patrón base, diferentes números) |
| 10 | `ORPHAN_LEVEL_WITH_SIBLINGS` | **-60** | Query no tiene nivel, topic sí tiene nivel, Y existen candidatos hermanos con diferentes niveles |

### Detalle: PARTIAL_MATCH_MISSING_TOKENS

Esta penalización es emitida por la función `weakMatch` cuando la cobertura es suficiente pero faltan tokens. Los puntos varían:

**Modo allowExtraInfo** (topic completamente cubierto, específico, sin título de persona):
- Normal: cada token faltante → **-10** (`MISSING_TOKEN_EXTRA_INFO`)
- Relajado: tokens ruido → **-2**, tokens importantes → **-15**

**Modo estándar:**
- Tokens numéricos faltantes → **-20** cada uno (`MISSING_NUMERIC_TOKEN`)
- Tokens no-numéricos faltantes → **-70** cada uno (`MISSING_TOKEN`)
- Si faltan todos los tokens → **-80** (`WEAK_MATCH`)

### Orden de evaluación

Las penalizaciones se aplican en este orden:

```
1. criticalTokenMismatch    → ¿Tipos de programa en conflicto?
2. levelConflict             → ¿Niveles en conflicto directo?
3. companyConflict           → ¿Empresa diferente?
4. programVsPerson           → ¿Query es programa, topic es persona?
5. structuralTokenMissing    → ¿Falta token estructural (DUO/TRIO/CH)?
6. weakMatch                 → ¿Cobertura insuficiente o tokens faltantes?
7. groupNumberConflict       → ¿Números de grupo en conflicto?
8. numericConflict           → ¿Todos los números en conflicto?
9. orphanNumberWithSiblings  → ¿Topic tiene número no solicitado con hermanos?
10. orphanLevelWithSiblings  → ¿Topic tiene nivel no solicitado con hermanos?
```

---

## 7. Decisión Final

`evaluateMatch()` evalúa todos los candidatos y decide:

### Flujo de decisión

```
¿Hay candidatos?
│
├── NO → not_found
│
▼ SÍ → Scorer evalúa cada uno, ordena desc por score
│
├── Filtrar válidos: !isDisqualified AND score ≥ 30 (MINIMUM)
│
├── ¿Ningún válido?
│   ├── ¿El mejor rechazado tiene COMPANY_CONFLICT, CRITICAL_TOKEN_MISMATCH,
│   │    o WEAK_MATCH con cobertura = 0?
│   │   └── SÍ → not_found (hard reject)
│   └── NO → ambiguous (confidence: low, muestra el mejor rechazado)
│
├── ¿Best.score - Second.score < 15? (AMBIGUITY_DIFF)
│   └── SÍ → ambiguous (candidatos demasiado cercanos)
│
├── ¿Best tiene ORPHAN penalties AND score < 70?
│   └── SÍ → ambiguous (sospecha de número/nivel incorrecto)
│
└── Asignar confianza:
    ├── score ≥ 70 → confidence: high → assigned
    ├── score ≥ 50 → confidence: medium → assigned (con nota)
    └── score < 50 → confidence: low → ambiguous
```

### Tabla de decisiones

| Score | Confianza | Decisión | Notas |
|-------|-----------|----------|-------|
| ≥ 70 | `high` | `assigned` | Match confiable |
| 50–69 | `medium` | `assigned` | Match aceptable, revisar |
| 30–49 | `low` | `ambiguous` | Score insuficiente para asignar |
| < 30 o descalificado | `none` | `not_found` | Sin match confiable |

> **Estado `to_update`:** Cuando se encuentra un match pero el `host_id` del meeting ≠ `instructor.id`, el resultado se marca como `to_update` en lugar de `assigned`. Esto indica que la reunión existe pero necesita actualización del host.

> **Estado `manual`:** Se asigna cuando el usuario resuelve un conflicto manualmente via la UI (`resolveConflict()`).

---

## 8. Heurísticas Especiales

### Heurística de Personas

Cuando query y topic tienen formato de persona, los tokens extra (segundos nombres, apellidos adicionales) penalizan con **-10** en lugar de **-70**:

```
Sin heurística: "david" faltante → MISSING_TOKEN (-70) → Score 30 → AMBIGUOUS
Con heurística: "david" faltante → MISSING_TOKEN_EXTRA_INFO (-10) → Score 90 → ASSIGNED
```

**Patrones de detección de persona** (4 regex en `matching.config.json`):
| # | Formato | Ejemplo |
|---|---------|---------|
| 1 | `Apellido (Empresa), Nombre` | `Garcia Lopez (ACME), Juan Carlos` |
| 2 | `NOMBRE SEGUNDO APELLIDO -` | `JUAN CARLOS GARCIA LOPEZ -` |
| 3 | `BVP - NOMBRE APELLIDO` | `BVP - MARIA FERNANDEZ` |
| 4 | `NOMBRE SEGUNDO APELLIDO EXTRA(` | `JUAN CARLOS GARCIA LOPEZ (ONLINE)` |

**Indicadores de título:** `dr`, `mr`, `mrs`, `ms`, `prof` — se excluyen del conteo de tokens.

### Detección de Conflictos Estructurales

Tipos de programa mutuamente excluyentes (definidos en `programTypeGroups`):

| Grupo | Tokens |
|-------|--------|
| CH | `ch` |
| TRIO | `trio` |
| DUO | `duo`, `bvd` |
| PRIVADO | `privado`, `bvp` |
| BVS | `bvs` |

Si el query pertenece al grupo TRIO pero el topic al grupo DUO → `CRITICAL_TOKEN_MISMATCH` (-100) → descalificado.

### Grupos de Sinónimos

Tokens que se consideran equivalentes: `[duo, bvd]`, `[privado, bvp]`, `[trio]`, `[ch]`

Si el query tiene `bvd` y el topic tiene `duo`, no se aplica `STRUCTURAL_TOKEN_MISSING` porque pertenecen al mismo grupo.

### Modo Relajado (ignoreLevelMismatch)

Cuando `options.ignoreLevelMismatch = true`:
- `LEVEL_CONFLICT` se reduce de -100 a -10 (`LEVEL_MISMATCH_IGNORED`)
- `STRUCTURAL_TOKEN_MISSING`, `GROUP_NUMBER_CONFLICT`, `NUMERIC_CONFLICT` se omiten
- El umbral de cobertura baja de 0.66 a 0.40 (si hay >1 token distintivo coincidiendo)

### Hard Reject

Ciertas penalizaciones marcan al candidato como "rechazo duro" — el evaluador lo envía a `not_found` en lugar de `ambiguous`:
- `COMPANY_CONFLICT`
- `CRITICAL_TOKEN_MISMATCH`
- `WEAK_MATCH` con metadata `coverage === 0`

---

## 9. Configuración

### Fuente de verdad: matching.config.json

Toda la configuración reside en un solo archivo JSON con schema de validación.

### Penalizaciones

| Penalización | Valor |
|-------------|-------|
| `CRITICAL_TOKEN_MISMATCH` | -100 |
| `LEVEL_CONFLICT` | -100 |
| `COMPANY_CONFLICT` | -100 |
| `PROGRAM_VS_PERSON` | -80 |
| `WEAK_MATCH` | -80 |
| `GROUP_NUMBER_CONFLICT` | -80 |
| `MISSING_TOKEN` | -70 |
| `ORPHAN_NUMBER_WITH_SIBLINGS` | -60 |
| `ORPHAN_LEVEL_WITH_SIBLINGS` | -60 |
| `STRUCTURAL_TOKEN_MISSING` | -50 |
| `NUMERIC_CONFLICT` | -30 |
| `MISSING_NUMERIC_TOKEN` | -20 |
| `MISSING_TOKEN_EXTRA_INFO` | -10 |
| `LEVEL_MISMATCH_IGNORED` | -10 |

### Umbrales

| Umbral | Valor | Uso |
|--------|-------|-----|
| `HIGH_CONFIDENCE` | 70 | Score mínimo para confianza "alta" |
| `MEDIUM_CONFIDENCE` | 50 | Score mínimo para confianza "media" |
| `MINIMUM` | 30 | Score mínimo para considerarse válido |
| `AMBIGUITY_DIFF` | 15 | Diferencia mínima entre 1° y 2° candidato |
| `FUSE_MAX_SCORE` | 0.3 | Umbral de Fuse.js (0=perfecto) |
| `TOKEN_OVERLAP_MIN` | 0.5 | Ratio mínimo de overlap en token set match |
| `MIN_MATCHING_TOKENS` | 2 | Tokens mínimos coincidentes en token set |

### Tokens estructurales

`duo`, `trio`, `ch`, `bvd`, `bvp`, `bvs`, `privado`

### Configuración Fuzzy (Levenshtein)

| Parámetro JSON | Valor | Estado en código |
|----------------|-------|-----------------|
| `maxCacheSize` | 5000 | ✅ Usado |
| `shortTokenThreshold` | 5 | ❌ Ignorado — code usa distancia 1 siempre |
| `allowedDistanceShort` | 1 | ✅ Usado (hardcoded) |
| `allowedDistanceLong` | 2 | ❌ Ignorado — distancia 2 causaba falsos positivos (MARIA↔MAYRA) |

---

## 10. Web Worker e Integración

### match.worker.ts

| Mensaje entrante | Acción | Respuesta |
|-----------------|--------|-----------|
| `{ type: 'INIT', meetings, users }` | Crea `MatchingService(meetings, users)` | `{ type: 'READY' }` |
| `{ type: 'MATCH', schedules }` | Llama `matcher.matchAll(schedules)` | `{ type: 'MATCH_RESULT', results }` |
| (error) | try/catch | `{ type: 'ERROR', error: string }` |

### useZoomStore (Zustand)

Gestiona el ciclo de vida completo:

| Acción | Descripción |
|--------|-------------|
| `fetchZoomData(opts?)` | Obtiene meetings + users de Supabase (paginado, 1000/página), inicializa Worker |
| `triggerSync()` | Invoca Edge Function `zoom-sync`, luego `fetchZoomData()` |
| `runMatching(schedules)` | Envía `MATCH` al Worker, resuelve con resultados |
| `resolveConflict(schedule, meeting)` | Actualiza resultado individual a `assigned` / `manual` |
| `createMeetings(items, opts?)` | Crea reuniones por lotes via `zoom-api` (tipo 2: diaria, tipo 8: recurrente L-J) |
| `executeAssignments(schedules?)` | Asigna host/topic por lotes: chunks de 30, 3.5s entre chunks |

---

## 11. Tipos TypeScript

### Interfaces principales

```typescript
interface ScoringContext {
    rawProgram: string;
    rawTopic: string;
    normalizedProgram: string;
    normalizedTopic: string;
    candidate: ZoomMeetingCandidate;
    allCandidates: ZoomMeetingCandidate[];
    options?: MatchOptions;
}

interface MatchOptions {
    ignoreLevelMismatch?: boolean;
}

interface AppliedPenalty {
    name: string;
    points: number;
    reason?: string;
    metadata?: Record<string, any>;
}

interface ScoringResult {
    candidate: ZoomMeetingCandidate;
    baseScore: number;          // 100
    finalScore: number;         // 0–100
    penalties: AppliedPenalty[];
    isDisqualified: boolean;    // score <= 0
}

interface MatchResult {
    schedule: Schedule;
    status: 'assigned' | 'to_update' | 'not_found' | 'ambiguous' | 'manual';
    reason: string;
    detailedReason?: string;
    meeting_id?: string;
    found_instructor?: { id: string; email: string; display_name: string };
    bestMatch?: ZoomMeetingCandidate;
    candidates: ZoomMeetingCandidate[];
    ambiguousCandidates?: ZoomMeetingCandidate[];
    score?: number;
    manualMode?: boolean;
    originalState?: Omit<MatchResult, 'originalState'>;
}
```

---

## 12. Ejemplos Prácticos

### Ejemplo 1: Match Exitoso (persona)

```
Query:   "Garcia Lopez (ACME)(ONLINE), Juan Carlos"
Topic:   "JUAN GARCIA LOPEZ - L5 (ONLINE)"

Normalización:
  Query → "garcia lopez juan carlos"     (ACME, ONLINE eliminados)
  Topic → "juan garcia lopez l5"         (ONLINE eliminado)

Detección: Ambos tienen formato de persona → heurística activa

Tokens distintivos:
  Query: [garcia, lopez, juan, carlos]
  Topic: [juan, garcia, lopez, l5]

Cobertura de topic: 3/3 tokens (l5 es nivel, no cuenta) ✅
Missing: [carlos] → MISSING_TOKEN_EXTRA_INFO (-10) (persona, topic cubierto)
Score: 100 - 10 = 90 → ASSIGNED (confianza alta)
```

### Ejemplo 2: Conflicto Crítico (programa)

```
Query:   "TRIO AGROVISION L4"
Topic:   "DUO AGROVISION L4 (ONLINE)"

Detección: TRIO (grupo TRIO) vs DUO (grupo DUO) → mutuamente excluyentes
Resultado: CRITICAL_TOKEN_MISMATCH (-100)
Score: 100 - 100 = 0 → descalificado → NOT_FOUND
```

### Ejemplo 3: Conflicto de Empresa

```
Query:   "ACME (ONLINE)"
Topic:   "GLOBEX CORP L3 (ONLINE)"

Detección: Token ACME del query ≠ token GLOBEX del topic
Distancia Levenshtein: > 2
Resultado: COMPANY_CONFLICT (-100)
Score: 0 → NOT_FOUND (hard reject)
```

### Ejemplo 4: Ambigüedad por números

```
Query:   "CH AMCOR (ONLINE)"

Topics en DB:
  - "CH 1 AMCOR L2 (ONLINE)"  → Score: 100 - 60 = 40 (ORPHAN_NUMBER)
  - "CH 2 AMCOR L5 (ONLINE)"  → Score: 100 - 60 = 40 (ORPHAN_NUMBER)
  - "CH 3 AMCOR L3 (ONLINE)"  → Score: 100 - 60 = 40 (ORPHAN_NUMBER)

Diferencia entre 1° y 2°: 0 < 15 (AMBIGUITY_DIFF)
Decisión: AMBIGUOUS (no especificó número de grupo)
```

### Ejemplo 5: Estado to_update

```
Query:   "Garcia Lopez (ACME), Juan"
Match:   Meeting con topic "JUAN GARCIA LOPEZ - L5"
         host_id = "user_abc"

Instructor encontrado: id = "user_xyz"

host_id ≠ instructor.id → to_update
Motivo: "Match encontrado pero el instructor no es el host actual"
```

---

## 13. Debugging

El logger (`src/lib/logger.ts`) muestra información detallada en desarrollo:

```
🔍 Match: Garcia Lopez (ACME)(ONLINE), Juan
  Raw: { program: '...', instructor: '...' }
  Normalized: { program: 'garcia lopez juan', instructor: '...' }
  📍 1 candidato(s) por Exact Match
  📊 Score: 90/100
     Candidato: JUAN GARCIA LOPEZ - L5 (ONLINE)
     - PARTIAL_MATCH_MISSING_TOKENS: -10 (Faltan tokens: carlos)
  🏁 Resultado: ASSIGNED (confianza: alta)
```

En producción, solo se muestran warnings y errores. El caché de Levenshtein (max 5000 entradas) se limpia al inicio de cada `matchAll()`.
