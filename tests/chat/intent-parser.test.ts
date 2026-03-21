/**
 * Test de integración para el parser de intents.
 *
 * Modelo:  gemini-3.1-flash-lite-preview
 * Límites: 15 RPM · 250K TPM · 500 RPD
 *
 * ⚠ 100 tests = 20% de la cuota diaria (500 RPD).
 *   El test corre secuencial con 4.5s entre calls para no superar 15 RPM.
 *   Duración estimada: ~8 minutos.
 *
 * Configuración (.env):
 *   GEMINI_API_KEY=tu_api_key
 *
 * Ejecutar todos:
 *   pnpm vitest run tests/chat/intent-parser.test.ts
 *
 * Ejecutar solo un grupo de intents:
 *   pnpm vitest run tests/chat/intent-parser.test.ts -t "classes_at_time"
 *
 * Ejecutar rango por ID (ej: solo primeros 20):
 *   INTENT_MAX_ID=20 pnpm vitest run tests/chat/intent-parser.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { INTENT_CASES } from "./intent-cases";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL  = "https://generativelanguage.googleapis.com/v1beta/openai";
const MODEL     = "gemini-3.1-flash-lite-preview";
const API_KEY   = (import.meta as unknown as { env: Record<string, string> }).env["GEMINI_API_KEY"] ?? "";
const DELAY_MS  = 4500; // 4.5s → ~13 RPM (bajo los 15 RPM del free tier)
const MAX_ID    = parseInt((import.meta as unknown as { env: Record<string, string> }).env["INTENT_MAX_ID"] ?? "9999");
const ACTIVE_DATE = "2026-03-20";

// ---------------------------------------------------------------------------
// Prompt (igual que en el servicio)
// ---------------------------------------------------------------------------
const INTENT_PROMPT = `Eres un parser de intents para un sistema de horarios educativos.
El horario cargado es del día ${ACTIVE_DATE}. Nunca preguntes por la fecha — ya la sabes.

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto adicional).

Intents disponibles:
{"type":"instructor_schedule","instructor":"<nombre parcial>"}
{"type":"instructor_free_slots","instructor":"<nombre parcial>"}
{"type":"classes_at_time","time":"HH:MM"}
{"type":"classes_in_range","start":"HH:MM","end":"HH:MM"}
{"type":"count","branch":"<sede opcional>","program":"<prog opcional>"}
{"type":"available_instructors","start":"HH:MM","end":"HH:MM","instructor_list":["<nombre>"] opcional}
{"type":"instructor_availability","instructor":"<nombre>","start":"HH:MM","end":"HH:MM"}
{"type":"who_has_class","query":"<nombre de alumno o código de grupo>"}
{"type":"filtered_schedules","branch":"<sede?>","program":"<programa?>","shift":"<turno?>"}
{"type":"all_instructors"}
{"type":"extreme_instructors","mode":"min" o "max"}
{"type":"unknown"}

Reglas:
- "clases a las 16", "clases de las 16" → classes_at_time (inicio exacto)
- "clases entre 15 y 16", "de 15 a 16" → classes_in_range
- Horas con duración: "19:00 (20min)" → start:"19:00", end:"19:20"
- Tiempos en 12h: "2pm"→"14:00", "9am"→"09:00"
- "clases de X", "horario de X", "X tiene clases?" donde X es el propio instructor → instructor_schedule
- "quién tiene la clase de X", "quién atiende a X", "de quién es la clase de X" donde X es un alumno → who_has_class
- "evaluaciones", "sesiones" son sinónimos de "clases" para fines de búsqueda
- "cuántas clases/sesiones..." → count (incluye filtros de sede/programa si los menciona)
- "clases del programa X", "sesiones en SEDE", "turno mañana/tarde" sin preguntar cuántas → filtered_schedules
- Si no hay match claro → {"type":"unknown"}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractJSON(text: string): Record<string, unknown> | null {
  const attempts: Array<() => unknown> = [
    () => JSON.parse(text.trim()),
    () => { const m = text.match(/```(?:json)?\s*([\s\S]*?)```/); return m ? JSON.parse(m[1].trim()) : null; },
    () => { const m = text.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; },
  ];
  for (const fn of attempts) {
    try { const r = fn(); if (r && typeof r === "object" && "type" in (r as object)) return r as Record<string, unknown>; } catch { /* next */ }
  }
  return null;
}

async function callIntent(question: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: INTENT_PROMPT },
        { role: "user",   content: question },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return extractJSON(data.choices[0]?.message?.content ?? "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Stats globales
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
let skipped = 0;

// ---------------------------------------------------------------------------
// Tests — secuenciales para respetar 15 RPM
// ---------------------------------------------------------------------------
const filteredCases = INTENT_CASES.filter((c) => c.id <= MAX_ID);
const byIntent = filteredCases.reduce<Record<string, typeof INTENT_CASES>>((acc, c) => {
  (acc[c.expectedIntent] ??= []).push(c);
  return acc;
}, {});

for (const [intentType, cases] of Object.entries(byIntent)) {
  describe(intentType, () => {
    beforeEach(async () => {
      await sleep(DELAY_MS); // respetar 15 RPM
    });

    for (const tc of cases) {
      it(`#${tc.id}: "${tc.question}"${tc.notes ? ` [${tc.notes}]` : ""}`, async () => {
        if (!API_KEY) {
          skipped++;
          console.warn("⚠ Sin API key — configura GEMINI_API_KEY en .env");
          return;
        }

        let result: Record<string, unknown> | null = null;
        try {
          result = await callIntent(tc.question);
        } catch (e) {
          failed++;
          throw e;
        }

        expect(result, "LLM no retornó JSON válido").not.toBeNull();
        expect(result!.type, `Intent incorrecto (recibido: ${result!.type})`).toBe(tc.expectedIntent);

        if (tc.expectedParams) {
          for (const [key, expected] of Object.entries(tc.expectedParams)) {
            const actual = result![key];
            if (typeof expected === "string") {
              expect(
                String(actual ?? "").toLowerCase(),
                `Param "${key}": esperado "${expected}", recibido "${String(actual)}"`
              ).toContain(expected.toLowerCase());
            } else {
              expect(actual, `Param "${key}"`).toEqual(expected);
            }
          }
        }

        passed++;
      }, 30_000); // 30s timeout por call (incluye delay)
    }
  });
}
