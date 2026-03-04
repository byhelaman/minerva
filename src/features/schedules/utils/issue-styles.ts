import type { IssueCategory } from "../components/table/IssueFilter";

// ─── Shared issue-category activeClassName constants ───────────────────────
// Prevents massive CSS string duplication across modals (Finding #4).

export const ISSUE_STYLE_GREEN =
    "border-green-500/50 bg-green-500/10 text-green-600 hover:bg-green-500/20 hover:text-green-700 dark:border-green-500/50 dark:bg-green-500/10 dark:text-green-500 dark:hover:bg-green-500/20 dark:hover:text-green-400";

export const ISSUE_STYLE_AMBER =
    "border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 hover:text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-500 dark:hover:bg-amber-500/20 dark:hover:text-amber-400";

export const ISSUE_STYLE_BLUE =
    "border-blue-500/50 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 hover:text-blue-700 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-500 dark:hover:bg-blue-500/20 dark:hover:text-blue-400";

// ─── Row highlight className constants ─────────────────────────────────────

export const ROW_STYLE_NEW = "bg-green-50 dark:bg-green-950/20 border-l-2 border-l-green-500";
export const ROW_STYLE_MODIFIED = "bg-amber-50 dark:bg-amber-950/20 border-l-2 border-l-amber-500";
export const ROW_STYLE_INCIDENCE = "bg-amber-50/50 dark:bg-amber-950/10 border-l-2 border-l-amber-500";
export const ROW_STYLE_DUPLICATE = "bg-red-50 dark:bg-red-950/20 border-l-2 border-l-red-500";
export const ROW_STYLE_POOL = "bg-red-50/50 dark:bg-red-950/10 border-l-2 border-l-red-500";

/**
 * Minimal type for issue category construction — compatible with IssueCategory.
 */
export type IssueCategoryConfig = IssueCategory;
