import * as React from "react";
import { type Column } from "@tanstack/react-table";
import { Check, PlusCircle } from "lucide-react";

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

interface DataTableFacetedFilterProps<TData, TValue> {
    column?: Column<TData, TValue>;
    title?: string;
    options: {
        label: string;
        value: string;
        icon?: React.ComponentType<{ className?: string }>;
    }[];
    /** 
     * Strategy for counting matches:
     * - 'exact': Exact match (default)
     * - 'includes': Option value is included in the facet value
     * - 'startsWith': Facet value starts with option value
     */
    matchMode?: "exact" | "includes" | "startsWith";
    /** @deprecated use matchMode="includes" instead */
    usePartialMatch?: boolean;
    disabled?: boolean;
}

export function DataTableFacetedFilter<TData, TValue>({
    column,
    title,
    options,
    usePartialMatch = false,
    matchMode = usePartialMatch ? "includes" : "exact",
    disabled,
}: DataTableFacetedFilterProps<TData, TValue>) {
    const facets = column?.getFacetedUniqueValues();
    const selectedValues = new Set(column?.getFilterValue() as string[]);

    // Calcular conteos según el modo
    const getCount = React.useCallback((optionValue: string): number | undefined => {
        if (!facets) return undefined;

        if (matchMode === "exact") {
            return facets.get(optionValue);
        }

        let count = 0;
        facets.forEach((facetCount, facetValue) => {
            const valStr = String(facetValue);
            if (matchMode === "includes" && valStr.includes(optionValue)) {
                count += facetCount;
            } else if (matchMode === "startsWith" && valStr.startsWith(optionValue)) {
                count += facetCount;
            }
        });

        return count > 0 ? count : undefined;
    }, [facets, matchMode]);

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 border-dashed" disabled={disabled}>
                    <PlusCircle />
                    {title}
                    {(() => {
                        // Calcular badges visibles antes de renderizar
                        const visibleBadges = options.filter((option) => selectedValues.has(option.value));
                        const hasVisibleBadges = selectedValues?.size > 2 || visibleBadges.length > 0;

                        if (!selectedValues?.size || !hasVisibleBadges) return null;

                        return (
                            <>
                                <Separator orientation="vertical" className="mx-2 h-4" />
                                <Badge
                                    variant="secondary"
                                    className="rounded-sm px-1 font-normal lg:hidden"
                                >
                                    {selectedValues.size}
                                </Badge>
                                <div className="hidden gap-1 lg:flex">
                                    {selectedValues.size > 2 ? (
                                        <Badge
                                            variant="secondary"
                                            className="rounded-sm px-1 font-normal"
                                        >
                                            {selectedValues.size} selected
                                        </Badge>
                                    ) : (
                                        visibleBadges.map((option) => (
                                            <Badge
                                                variant="secondary"
                                                key={option.value}
                                                className="rounded-sm px-1 font-normal"
                                            >
                                                {option.label}
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
                    <CommandInput placeholder={title} />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => {
                                const isSelected = selectedValues.has(option.value);
                                const count = getCount(option.value);
                                return (
                                    <CommandItem
                                        key={option.value}
                                        onSelect={() => {
                                            if (isSelected) {
                                                selectedValues.delete(option.value);
                                            } else {
                                                selectedValues.add(option.value);
                                            }
                                            const filterValues = Array.from(selectedValues);
                                            column?.setFilterValue(
                                                filterValues.length ? filterValues : undefined
                                            );
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
                                        {option.icon && (
                                            <option.icon className="text-muted-foreground size-4" />
                                        )}
                                        <span>{option.label}</span>
                                        {count !== undefined && (
                                            <span className="text-muted-foreground ml-auto flex size-4 items-center justify-center font-mono text-xs">
                                                {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(count)}
                                            </span>
                                        )}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        {selectedValues.size > 0 && (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => column?.setFilterValue(undefined)}
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
