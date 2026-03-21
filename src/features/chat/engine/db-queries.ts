/**
 * DB query wrappers for the chat RAG system.
 * Each function calls a Supabase RPC and returns the result as-is.
 * On error, returns { error: string } so the LLM can report it clearly.
 */
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// chat_get_schedules
// ---------------------------------------------------------------------------
export async function dbGetSchedules(params: {
  date: string;
  program?: string;
  branch?: string;
  time?: string;
  countOnly?: boolean;
}): Promise<unknown> {
  const { data, error } = await supabase.rpc("chat_get_schedules", {
    p_date:       params.date,
    p_program:    params.program    ?? null,
    p_branch:     params.branch     ?? null,
    p_time:       params.time       ?? null,
    p_count_only: params.countOnly  ?? false,
  });
  if (error) return { error: error.message };
  return data;
}

// ---------------------------------------------------------------------------
// chat_find_instructor
// ---------------------------------------------------------------------------
export async function dbFindInstructor(
  name: string,
  startDate: string,
  endDate: string,
): Promise<unknown> {
  const { data, error } = await supabase.rpc("chat_find_instructor", {
    p_name:       name,
    p_start_date: startDate,
    p_end_date:   endDate,
  });
  if (error) return { error: error.message };
  return data;
}

// ---------------------------------------------------------------------------
// chat_get_schedules_range
// ---------------------------------------------------------------------------
export async function dbGetSchedulesRange(params: {
  startDate: string;
  endDate: string;
  program?: string;
  branch?: string;
  countOnly?: boolean;
  limit?: number;
}): Promise<unknown> {
  const { data, error } = await supabase.rpc("chat_get_schedules_range", {
    p_start_date: params.startDate,
    p_end_date:   params.endDate,
    p_program:    params.program   ?? null,
    p_branch:     params.branch    ?? null,
    p_count_only: params.countOnly ?? false,
    p_limit:      params.limit     ?? 100,
  });
  if (error) return { error: error.message };
  return data;
}

// ---------------------------------------------------------------------------
// chat_get_stats
// ---------------------------------------------------------------------------
export async function dbGetStats(params: {
  startDate: string;
  endDate: string;
  groupBy?: "instructor" | "date" | "branch";
  nameFilter?: string;
  threshold?: number;
}): Promise<unknown> {
  const { data, error } = await supabase.rpc("chat_get_stats", {
    p_start_date:  params.startDate,
    p_end_date:    params.endDate,
    p_group_by:    params.groupBy    ?? "instructor",
    p_name_filter: params.nameFilter ?? null,
    p_threshold:   params.threshold  ?? 0.15,
  });
  if (error) return { error: error.message };
  return data;
}

// ---------------------------------------------------------------------------
// chat_check_instructor_availability
// ---------------------------------------------------------------------------
export async function dbCheckInstructorAvailability(params: {
  name: string;
  date: string;
  startTime: string;
  endTime: string;
}): Promise<unknown> {
  const { data, error } = await supabase.rpc("chat_check_instructor_availability", {
    p_name:       params.name,
    p_date:       params.date,
    p_start_time: params.startTime,
    p_end_time:   params.endTime,
  });
  if (error) return { error: error.message };
  return data;
}

// ---------------------------------------------------------------------------
// chat_find_available_instructors
// ---------------------------------------------------------------------------
export async function dbFindAvailableInstructors(params: {
  date: string;
  startTime: string;
  endTime: string;
  instructorList?: string[];
}): Promise<unknown> {
  const { data, error } = await supabase.rpc("chat_find_available_instructors", {
    p_date:             params.date,
    p_start_time:       params.startTime,
    p_end_time:         params.endTime,
    p_instructor_list:  params.instructorList ?? null,
  });
  if (error) return { error: error.message };
  return data;
}

// ---------------------------------------------------------------------------
// chat_get_instructor_profile
// ---------------------------------------------------------------------------
export async function dbGetInstructorProfile(params: {
  name: string;
  threshold?: number;
}): Promise<unknown> {
  const { data, error } = await supabase.rpc("chat_get_instructor_profile", {
    p_name:      params.name,
    p_threshold: params.threshold ?? 0.15,
  });
  if (error) return { error: error.message };
  return data;
}

// ---------------------------------------------------------------------------
// chat_get_pool_rules
// ---------------------------------------------------------------------------
export async function dbGetPoolRules(params: {
  branch?: string;
  program?: string;
}): Promise<unknown> {
  const { data, error } = await supabase.rpc("chat_get_pool_rules", {
    p_branch:  params.branch  ?? null,
    p_program: params.program ?? null,
  });
  if (error) return { error: error.message };
  return data;
}

// ---------------------------------------------------------------------------
// chat_get_evaluators_list
// ---------------------------------------------------------------------------
export async function dbGetEvaluatorsList(params: {
  evalType?: string;
  language?: string;
}): Promise<unknown> {
  const { data, error } = await supabase.rpc("chat_get_evaluators_list", {
    p_eval_type: params.evalType ?? null,
    p_language:  params.language ?? null,
  });
  if (error) return { error: error.message };
  return data;
}

// ---------------------------------------------------------------------------
// chat_find_instructors
// ---------------------------------------------------------------------------
export async function dbFindInstructors(params: {
  language?: string;
  canEvaluate?: boolean;
  evalType?: string;
}): Promise<unknown> {
  const { data, error } = await supabase.rpc("chat_find_instructors", {
    p_language:     params.language     ?? null,
    p_can_evaluate: params.canEvaluate  ?? null,
    p_eval_type:    params.evalType     ?? null,
  });
  if (error) return { error: error.message };
  return data;
}

// ---------------------------------------------------------------------------
// chat_find_evaluators
// ---------------------------------------------------------------------------
export async function dbFindEvaluators(params: {
  date: string;
  startTime: string;
  endTime: string;
  evalType?: string;
  language?: string;
}): Promise<unknown> {
  const { data, error } = await supabase.rpc("chat_find_evaluators", {
    p_date:       params.date,
    p_start_time: params.startTime,
    p_end_time:   params.endTime,
    p_eval_type:  params.evalType  ?? null,
    p_language:   params.language  ?? null,
  });
  if (error) return { error: error.message };
  return data;
}
