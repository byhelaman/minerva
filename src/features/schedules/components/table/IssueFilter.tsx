import * as React from "react";
import { AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

export interface IssueCategory {
    /** Unique key for this category (e.g. 'overlaps', 'duplicates', 'modified') */
    key: string;
    /** Display label */
    label: string;
    /** Number of affected rows */
    count: number;
    /** Optional icon */
    icon?: React.ComponentType<{ className?: string }>;
    /** Optional explicit active color (e.g. text-amber-500 bg-amber-50 border-amber-500) */
    activeClassName?: string;
}

interface IssueFilterProps {
    /** Available issue categories (only those with count > 0 should be passed) */
    categories: IssueCategory[];
    /** Currently selected category keys */
    selectedKeys: Set<string>;
    /** Callback when selection changes */
    onSelectionChange: (keys: Set<string>) => void;
    /** Total issue count limit (deprecated - now computes dynamically) */
    totalCount?: number;
}

const activeClasses = "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive";

/**
 * Unified issue filter — consolidates overlaps, duplicates, modified, etc.
 * - 0 categories: renders nothing
 * - 1 category: simple toggle button
 * - 2+ categories: popover with checkboxes (faceted style)
 */
export function IssueFilter({ categories, selectedKeys, onSelectionChange }: IssueFilterProps) {
    if (categories.length === 0) return null;

    const hasActive = selectedKeys.size > 0;

    // Single category → simple toggle
    if (categories.length === 1) {
        const cat = categories[0];
        const isActive = selectedKeys.has(cat.key);
        const Icon = cat.icon || AlertTriangle;

        return (
            <Button
                variant="outline"
                size="sm"
                onClick={() => {
                    const next = new Set(selectedKeys);
                    if (isActive) next.delete(cat.key);
                    else next.add(cat.key);
                    onSelectionChange(next);
                }}
                className={cn("border-dashed", isActive && (cat.activeClassName || activeClasses))}
                title={cat.label}
            >
                <Icon/>
                {cat.label}
            </Button>
        );
    }

    // Multiple categories → popover
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-dashed"
                >
                    <AlertTriangle />
                    Issues
                    {(() => {
                        const visibleBadges = categories.filter((cat) => selectedKeys.has(cat.key));
                        const hasVisibleBadges = selectedKeys.size > 2 || visibleBadges.length > 0;

                        if (!selectedKeys.size || !hasVisibleBadges) return null;

                        return (
                            <>
                                <Separator orientation="vertical" className="mx-2 h-4" />
                                <Badge
                                    variant="secondary"
                                    className={cn(
                                        "rounded-sm px-1 font-normal lg:hidden",
                                        "bg-secondary text-secondary-foreground"
                                    )}
                                >
                                    {selectedKeys.size}
                                </Badge>
                                <div className="hidden gap-1 lg:flex">
                                    {selectedKeys.size > 2 ? (
                                        <Badge
                                            variant="secondary"
                                            className={cn(
                                                "rounded-sm px-1 font-normal",
                                                "bg-secondary text-secondary-foreground"
                                            )}
                                        >
                                            {selectedKeys.size} selected
                                        </Badge>
                                    ) : (
                                        visibleBadges.map((cat) => (
                                            <Badge
                                                variant="secondary"
                                                key={cat.key}
                                                className={cn(
                                                    "rounded-sm px-1 font-normal",
                                                    "bg-secondary text-secondary-foreground"
                                                )}
                                            >
                                                {cat.label}
                                            </Badge>
                                        ))
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Issues" />
                    <CommandList>
                        <CommandEmpty>No issues found.</CommandEmpty>
                        <CommandGroup>
                            {categories.map((cat) => {
                                const isSelected = selectedKeys.has(cat.key);
                                const Icon = cat.icon;
                                return (
                                    <CommandItem
                                        key={cat.key}
                                        value={cat.label}
                                        onSelect={() => {
                                            const next = new Set(selectedKeys);
                                            if (isSelected) next.delete(cat.key);
                                            else next.add(cat.key);
                                            onSelectionChange(next);
                                        }}
                                    >
                                        <div
                                            className={cn(
                                                "flex size-4 items-center justify-center rounded-[4px] border",
                                                isSelected
                                                    ? "bg-primary border-primary text-primary-foreground"
                                                    : "border-input [&_svg]:invisible"
                                            )}
                                        >
                                            <Check className="text-primary-foreground size-3.5" />
                                        </div>
                                        {Icon && (
                                            <Icon className="text-muted-foreground size-4" />
                                        )}
                                        <span>{cat.label}</span>
                                        <span className="text-muted-foreground ml-auto flex size-4 items-center justify-center font-mono text-xs">
                                            {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(cat.count)}
                                        </span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        {hasActive && (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => onSelectionChange(new Set())}
                                        className="justify-center text-center"
                                    >
                                        Clear filters
                                    </CommandItem>
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
