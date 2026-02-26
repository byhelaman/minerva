import { Loader2 } from "lucide-react";

interface LoadingStateProps {
    title?: string;
    description?: string;
}

/**
 * Reusable loading spinner with optional title and description.
 * Replaces repeated inline loading UI across modals and pages.
 */
export function LoadingState({ title = "Loading...", description }: LoadingStateProps) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 h-full border border-dashed rounded-lg bg-muted/10 p-8 min-h-100">
            <Loader2 className="h-6 w-6 animate-spin" />
            <div className="text-center space-y-2">
                <p className="text-sm font-medium">{title}</p>
                {description && (
                    <p className="text-xs text-muted-foreground">{description}</p>
                )}
            </div>
        </div>
    );
}
