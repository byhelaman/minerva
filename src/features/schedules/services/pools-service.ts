import { supabase } from "@/lib/supabase";
import type { PoolRule, PoolRuleInput } from "../types";

export const poolsService = {
    async listMyRules(): Promise<PoolRule[]> {
        const { data, error } = await supabase.rpc("get_my_pool_rules");
        if (error) throw error;
        return (data ?? []) as PoolRule[];
    },

    async createRule(input: PoolRuleInput): Promise<string> {
        const { data, error } = await supabase.rpc("create_pool_rule", {
            p_branch: input.branch,
            p_program_query: input.program_query,
            p_allowed_instructors_by_day: input.allowed_instructors_by_day ?? {},
            p_allowed_instructors: input.allowed_instructors,
            p_blocked_instructors: input.blocked_instructors,
            p_hard_lock: input.hard_lock,
            p_is_active: input.is_active,
            p_comments: input.comments ?? null,
        });

        if (error) throw error;

        const id = (data as { id?: string } | null)?.id;
        if (!id) throw new Error("Pool rule created but id not returned");
        return id;
    },

    async updateRule(id: string, input: PoolRuleInput): Promise<void> {
        const { error } = await supabase.rpc("update_my_pool_rule", {
            p_id: id,
            p_branch: input.branch,
            p_program_query: input.program_query,
            p_allowed_instructors_by_day: input.allowed_instructors_by_day ?? {},
            p_allowed_instructors: input.allowed_instructors,
            p_blocked_instructors: input.blocked_instructors,
            p_hard_lock: input.hard_lock,
            p_is_active: input.is_active,
            p_comments: input.comments ?? null,
        });

        if (error) throw error;
    },

    async deleteRule(id: string): Promise<void> {
        const { error } = await supabase.rpc("delete_my_pool_rule", { p_id: id });
        if (error) throw error;
    },
};
