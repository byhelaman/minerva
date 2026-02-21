import { z } from 'zod';
import { normalizeString } from '../utils/string-utils';

// Formato de fecha ISO: YYYY-MM-DD (valida correctitud semántica, ej: rechaza 2020-01-32)
const dateSchema = z.iso.date();

// Formato de hora ISO: HH:MM (precisión de minutos, sin segundos)
const timeSchema = z.iso.time({ precision: -1 });

export const ScheduleSchema = z.object({
    date: dateSchema,
    shift: z.string().default(''),        // Calculado después, vacío por defecto
    branch: z.string().trim().transform(val => val === '' ? 'none' : val),
    start_time: timeSchema,
    end_time: timeSchema,
    code: z.string().default(''),         // Puede estar vacío
    instructor: z.string().trim().transform(val => normalizeString(val)).transform(val => val === '' ? 'none' : val),
    program: z.string().min(1, "Program/Group is missing").trim().transform(val => normalizeString(val)),
    minutes: z.string().regex(/^\d+$/, "Minutes must be numeric").default('0'),
    units: z.string().regex(/^\d+$/, "Units must be numeric").default('0'),

    // Optional incidence fields
    status: z.string().optional(),
    substitute: z.string().optional(),
    type: z.string().optional(),
    subtype: z.string().optional(),
    description: z.string().optional(),
    department: z.string().optional(),
    feedback: z.string().optional(),
});

export type ValidatedSchedule = z.infer<typeof ScheduleSchema>;
