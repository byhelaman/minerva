/**
 * Casos de prueba para el parser de intents del chat.
 * Cubre todas las intenciones posibles en un día de trabajo.
 *
 * Uso:
 *   pnpm vitest run tests/chat/intent-parser.test.ts
 *
 * El test llama al LLM con cada pregunta y verifica que el intent
 * extraído coincida con el esperado.
 */

export interface IntentCase {
  id: number;
  question: string;
  expectedIntent: string;
  expectedParams?: Record<string, unknown>;
  notes?: string;
}

export const INTENT_CASES: IntentCase[] = [

  // ─── instructor_schedule (20) ──────────────────────────────────────────────
  { id: 1,  question: "qué clases tiene María García hoy?",               expectedIntent: "instructor_schedule", expectedParams: { instructor: "María García" } },
  { id: 2,  question: "cuáles son las clases de Juan Pérez?",             expectedIntent: "instructor_schedule", expectedParams: { instructor: "Juan Pérez" } },
  { id: 3,  question: "horario de Pedro López",                           expectedIntent: "instructor_schedule", expectedParams: { instructor: "Pedro López" } },
  { id: 4,  question: "dime las clases de Ana Martínez",                  expectedIntent: "instructor_schedule", expectedParams: { instructor: "Ana Martínez" } },
  { id: 5,  question: "qué tiene Carlos Rodríguez hoy?",                  expectedIntent: "instructor_schedule", expectedParams: { instructor: "Carlos Rodríguez" } },
  { id: 6,  question: "clases de Laura Sánchez",                          expectedIntent: "instructor_schedule", expectedParams: { instructor: "Laura Sánchez" } },
  { id: 7,  question: "muéstrame el horario de Roberto Díaz",             expectedIntent: "instructor_schedule", expectedParams: { instructor: "Roberto Díaz" } },
  { id: 8,  question: "Juan tiene clases hoy?",                           expectedIntent: "instructor_schedule", expectedParams: { instructor: "Juan" } },
  { id: 9,  question: "qué clases le tocan a Sofía Torres?",              expectedIntent: "instructor_schedule", expectedParams: { instructor: "Sofía Torres" } },
  { id: 10, question: "clases de García",                                 expectedIntent: "instructor_schedule", expectedParams: { instructor: "García" } },
  { id: 11, question: "qué imparte López hoy?",                           expectedIntent: "instructor_schedule", expectedParams: { instructor: "López" } },
  { id: 12, question: "ver clases de Carmen Flores",                      expectedIntent: "instructor_schedule", expectedParams: { instructor: "Carmen Flores" } },
  { id: 13, question: "clases que tiene Miguel Ángel",                    expectedIntent: "instructor_schedule", expectedParams: { instructor: "Miguel Ángel" } },
  { id: 14, question: "qué sesiones tiene Rosa hoy?",                     expectedIntent: "instructor_schedule", expectedParams: { instructor: "Rosa" } },
  { id: 15, question: "dime el horario de Fernando",                      expectedIntent: "instructor_schedule", expectedParams: { instructor: "Fernando" } },
  { id: 16, question: "cuántas y cuáles son las clases de Patricia?",     expectedIntent: "instructor_schedule", expectedParams: { instructor: "Patricia" } },
  { id: 17, question: "qué clases tiene el instructor Ramírez?",          expectedIntent: "instructor_schedule", expectedParams: { instructor: "Ramírez" } },
  { id: 18, question: "Elena tiene clases programadas?",                  expectedIntent: "instructor_schedule", expectedParams: { instructor: "Elena" } },
  { id: 19, question: "Alvaro Castro qué tiene hoy?",                     expectedIntent: "instructor_schedule", expectedParams: { instructor: "Alvaro Castro" } },
  { id: 20, question: "clases de Liz Allyn",                              expectedIntent: "instructor_schedule", expectedParams: { instructor: "Liz Allyn" } },

  // ─── instructor_free_slots (10) ───────────────────────────────────────────
  { id: 21, question: "cuándo tiene libre María García?",                 expectedIntent: "instructor_free_slots", expectedParams: { instructor: "María García" } },
  { id: 22, question: "ventanas disponibles de Juan Pérez",               expectedIntent: "instructor_free_slots", expectedParams: { instructor: "Juan Pérez" } },
  { id: 23, question: "en qué horarios está disponible López?",           expectedIntent: "instructor_free_slots", expectedParams: { instructor: "López" } },
  { id: 24, question: "horarios libres de Ana",                           expectedIntent: "instructor_free_slots", expectedParams: { instructor: "Ana" } },
  { id: 25, question: "cuándo puede Pedro?",                              expectedIntent: "instructor_free_slots", expectedParams: { instructor: "Pedro" } },
  { id: 26, question: "dispo de Martínez",                                expectedIntent: "instructor_free_slots", expectedParams: { instructor: "Martínez" } },
  { id: 27, question: "qué horas libres tiene Carlos?",                   expectedIntent: "instructor_free_slots", expectedParams: { instructor: "Carlos" } },
  { id: 28, question: "disponibilidad de Sofía Torres",                   expectedIntent: "instructor_free_slots", expectedParams: { instructor: "Sofía Torres" } },
  { id: 29, question: "en qué momento está libre Roberto?",               expectedIntent: "instructor_free_slots", expectedParams: { instructor: "Roberto" } },
  { id: 30, question: "horario libre de García hoy",                      expectedIntent: "instructor_free_slots", expectedParams: { instructor: "García" } },

  // ─── classes_at_time (10) ─────────────────────────────────────────────────
  { id: 31, question: "cuántas clases hay a las 9?",                      expectedIntent: "classes_at_time", expectedParams: { time: "09:00" } },
  { id: 32, question: "qué clases inician a las 15:00?",                  expectedIntent: "classes_at_time", expectedParams: { time: "15:00" } },
  { id: 33, question: "clases de las 17:30",                              expectedIntent: "classes_at_time", expectedParams: { time: "17:30" } },
  { id: 34, question: "quiénes inician a las 8?",                         expectedIntent: "classes_at_time", expectedParams: { time: "08:00" } },
  { id: 35, question: "clases a las 2pm",                                 expectedIntent: "classes_at_time", expectedParams: { time: "14:00" } },
  { id: 36, question: "qué clases hay a las 19:00?",                      expectedIntent: "classes_at_time", expectedParams: { time: "19:00" } },
  { id: 37, question: "clases de las 7",                                  expectedIntent: "classes_at_time", expectedParams: { time: "07:00" } },
  { id: 38, question: "cuántas clases arrancan a las 16:30?",             expectedIntent: "classes_at_time", expectedParams: { time: "16:30" } },
  { id: 39, question: "a las 10 qué hay?",                                expectedIntent: "classes_at_time", expectedParams: { time: "10:00" } },
  { id: 40, question: "clases que empiezan a las 18:00",                  expectedIntent: "classes_at_time", expectedParams: { time: "18:00" } },

  // ─── classes_in_range (8) ─────────────────────────────────────────────────
  { id: 41, question: "cuántas clases hay entre las 15 y las 17?",        expectedIntent: "classes_in_range", expectedParams: { start: "15:00", end: "17:00" } },
  { id: 42, question: "clases de 9 a 11",                                 expectedIntent: "classes_in_range", expectedParams: { start: "09:00", end: "11:00" } },
  { id: 43, question: "qué clases hay entre las 8 y las 10?",             expectedIntent: "classes_in_range", expectedParams: { start: "08:00", end: "10:00" } },
  { id: 44, question: "entre las 14:00 y las 16:00 qué clases hay?",      expectedIntent: "classes_in_range", expectedParams: { start: "14:00", end: "16:00" } },
  { id: 45, question: "clases que inician de 7 a 9",                      expectedIntent: "classes_in_range", expectedParams: { start: "07:00", end: "09:00" } },
  { id: 46, question: "de 19 a 21 cuántas clases?",                       expectedIntent: "classes_in_range", expectedParams: { start: "19:00", end: "21:00" } },
  { id: 47, question: "clases entre 17:00 y 19:00",                       expectedIntent: "classes_in_range", expectedParams: { start: "17:00", end: "19:00" } },
  { id: 48, question: "qué hay de 8 a 12?",                               expectedIntent: "classes_in_range", expectedParams: { start: "08:00", end: "12:00" } },

  // ─── count (10) ───────────────────────────────────────────────────────────
  { id: 49, question: "cuántas clases hay en total?",                     expectedIntent: "count" },
  { id: 50, question: "cuántas clases hay en HUB?",                       expectedIntent: "count", expectedParams: { branch: "HUB" } },
  { id: 51, question: "total de clases del día",                          expectedIntent: "count" },
  { id: 52, question: "cuántas sesiones hay en LA MOLINA?",               expectedIntent: "count", expectedParams: { branch: "LA MOLINA" } },
  { id: 53, question: "número total de clases programadas",               expectedIntent: "count" },
  { id: 54, question: "cuántas clases hay en SAN ISIDRO?",                expectedIntent: "count", expectedParams: { branch: "SAN ISIDRO" } },
  { id: 55, question: "cuántas clases de KIDS hay?",                      expectedIntent: "count", expectedParams: { program: "KIDS" } },
  { id: 56, question: "total de clases de adultos",                       expectedIntent: "count", expectedParams: { program: "adultos" } },
  { id: 57, question: "cuántas evaluaciones hay hoy?",                    expectedIntent: "count", expectedParams: { program: "evaluacion" }, notes: "puede retornar filtered_schedules también" },
  { id: 58, question: "cuántas clases hay en MIRAFLORES?",                expectedIntent: "count", expectedParams: { branch: "MIRAFLORES" } },

  // ─── available_instructors (15) ───────────────────────────────────────────
  { id: 59, question: "quién puede tomar una evaluación de 9 a 10?",      expectedIntent: "available_instructors", expectedParams: { start: "09:00", end: "10:00" } },
  { id: 60, question: "quién está disponible de 16:00 a 17:00?",          expectedIntent: "available_instructors", expectedParams: { start: "16:00", end: "17:00" } },
  { id: 61, question: "instructores libres de 8 a 9?",                    expectedIntent: "available_instructors", expectedParams: { start: "08:00", end: "09:00" } },
  { id: 62, question: "quién puede cubrir de 19:00 a 20:00?",             expectedIntent: "available_instructors", expectedParams: { start: "19:00", end: "20:00" } },
  { id: 63, question: "disponibles para evaluación de 7:30 a 8:00",       expectedIntent: "available_instructors", expectedParams: { start: "07:30", end: "08:00" } },
  { id: 64, question: "quién puede hacer una evaluación de 15 a 16?",     expectedIntent: "available_instructors", expectedParams: { start: "15:00", end: "16:00" } },
  { id: 65, question: "quién está libre de 20:00 a 21:00?",               expectedIntent: "available_instructors", expectedParams: { start: "20:00", end: "21:00" } },
  { id: 66, question: "evaluación de 17:20 (20min) - quién puede?",       expectedIntent: "available_instructors", expectedParams: { start: "17:20", end: "17:40" } },
  { id: 67, question: "quién puede cubrir de 9:30 a 10:00?",              expectedIntent: "available_instructors", expectedParams: { start: "09:30", end: "10:00" } },
  { id: 68, question: "evaluación de 19:00 (30min) quién está libre?",    expectedIntent: "available_instructors", expectedParams: { start: "19:00", end: "19:30" } },
  { id: 69, question: "quién tiene hueco de 11 a 12?",                    expectedIntent: "available_instructors", expectedParams: { start: "11:00", end: "12:00" } },
  { id: 70, question: "instructores con disponibilidad de 13 a 14",       expectedIntent: "available_instructors", expectedParams: { start: "13:00", end: "14:00" } },
  { id: 71, question: "de los evaluadores García y López, quién puede de 16 a 17?", expectedIntent: "available_instructors", expectedParams: { start: "16:00", end: "17:00" }, notes: "debe incluir instructor_list" },
  { id: 72, question: "considerando solo a Juan y Ana como evaluadores, quién tiene dispo de 15 a 16?", expectedIntent: "available_instructors", expectedParams: { start: "15:00", end: "16:00" }, notes: "debe incluir instructor_list con Juan y Ana" },
  { id: 73, question: "quién puede cubrir la clase de las 10:00 a las 11:00?", expectedIntent: "available_instructors", expectedParams: { start: "10:00", end: "11:00" } },

  // ─── instructor_availability (10) ─────────────────────────────────────────
  { id: 74, question: "puede María García de 16 a 17?",                   expectedIntent: "instructor_availability", expectedParams: { instructor: "María García", start: "16:00", end: "17:00" } },
  { id: 75, question: "Juan Pérez está libre a las 9?",                   expectedIntent: "instructor_availability", expectedParams: { instructor: "Juan Pérez" } },
  { id: 76, question: "tiene disponibilidad López de 15:00 a 16:00?",     expectedIntent: "instructor_availability", expectedParams: { instructor: "López", start: "15:00", end: "16:00" } },
  { id: 77, question: "Martínez puede cubrir de 18 a 19?",                expectedIntent: "instructor_availability", expectedParams: { instructor: "Martínez", start: "18:00", end: "19:00" } },
  { id: 78, question: "Ana está disponible de 8 a 9?",                    expectedIntent: "instructor_availability", expectedParams: { instructor: "Ana", start: "08:00", end: "09:00" } },
  { id: 79, question: "puede Carlos a las 20:00?",                        expectedIntent: "instructor_availability", expectedParams: { instructor: "Carlos" } },
  { id: 80, question: "Sofía tiene hueco de 14 a 15?",                    expectedIntent: "instructor_availability", expectedParams: { instructor: "Sofía", start: "14:00", end: "15:00" } },
  { id: 81, question: "Roberto puede a las 7:30?",                        expectedIntent: "instructor_availability", expectedParams: { instructor: "Roberto" } },
  { id: 82, question: "García tiene conflicto de 16:30 a 17:00?",         expectedIntent: "instructor_availability", expectedParams: { instructor: "García", start: "16:30", end: "17:00" } },
  { id: 83, question: "Flores puede cubrir de 19 a 20?",                  expectedIntent: "instructor_availability", expectedParams: { instructor: "Flores", start: "19:00", end: "20:00" } },

  // ─── who_has_class (8) ────────────────────────────────────────────────────
  { id: 84, question: "quién tiene la clase de Sasha Massarelli?",        expectedIntent: "who_has_class", expectedParams: { query: "Sasha Massarelli" } },
  { id: 85, question: "quién atiende a Juan García?",                     expectedIntent: "who_has_class", expectedParams: { query: "Juan García" } },
  { id: 86, question: "a quién le toca la clase de Fernández?",           expectedIntent: "who_has_class", expectedParams: { query: "Fernández" } },
  { id: 87, question: "quién imparte la clase de Rosa Quispe?",           expectedIntent: "who_has_class", expectedParams: { query: "Rosa Quispe" } },
  { id: 88, question: "quién tiene el código OPE102940?",                 expectedIntent: "who_has_class", expectedParams: { query: "OPE102940" } },
  { id: 89, question: "de quién es la clase de Lara Montoya?",            expectedIntent: "who_has_class", expectedParams: { query: "Lara Montoya" } },
  { id: 90, question: "quién atiende a Candelaria Quiroga?",              expectedIntent: "who_has_class", expectedParams: { query: "Candelaria Quiroga" } },
  { id: 91, question: "quién tiene la evaluación de Eduardo Agostini?",   expectedIntent: "who_has_class", expectedParams: { query: "Eduardo Agostini" } },

  // ─── filtered_schedules (5) ───────────────────────────────────────────────
  { id: 92, question: "clases del turno mañana",                          expectedIntent: "filtered_schedules", expectedParams: { shift: "mañana" } },
  { id: 93, question: "qué hay en HUB hoy?",                              expectedIntent: "filtered_schedules", expectedParams: { branch: "HUB" } },
  { id: 94, question: "clases del programa KIDS",                         expectedIntent: "filtered_schedules", expectedParams: { program: "KIDS" } },
  { id: 95, question: "sesiones en LA MOLINA",                            expectedIntent: "filtered_schedules", expectedParams: { branch: "LA MOLINA" } },
  { id: 96, question: "clases del turno tarde",                           expectedIntent: "filtered_schedules", expectedParams: { shift: "tarde" } },

  // ─── all_instructors (2) ──────────────────────────────────────────────────
  { id: 97, question: "lista todos los instructores de hoy",              expectedIntent: "all_instructors" },
  { id: 98, question: "dame la lista completa de instructores",           expectedIntent: "all_instructors" },

  // ─── extreme_instructors (2) ──────────────────────────────────────────────
  { id: 99,  question: "quién tiene más clases hoy?",                     expectedIntent: "extreme_instructors", expectedParams: { mode: "max" } },
  { id: 100, question: "quién tiene menos clases?",                       expectedIntent: "extreme_instructors", expectedParams: { mode: "min" } },
];
