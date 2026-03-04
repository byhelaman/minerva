import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, X } from "lucide-react";

interface InstructorMultiSelectProps {
    value: string[];
    onChange: (next: string[]) => void;
    options: string[];
    placeholder: string;
    searchPlaceholder: string;
    emptyText: string;
    className?: string;
}

export function InstructorMultiSelect({
    value,
    onChange,
    options,
    placeholder,
    searchPlaceholder,
    emptyText,
    className,
}: InstructorMultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (value.length <= 5) {
            setExpanded(false);
        }
    }, [value.length]);

    const mergedOptions = useMemo(() => {
        const map = new Map<string, string>();
        [...options, ...value].forEach((name) => {
            const trimmed = name.trim();
            if (!trimmed) return;
            const key = trimmed.toLowerCase();
            if (!map.has(key)) {
                map.set(key, trimmed);
            }
        });
        return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
    }, [options, value]);

    const hasExactMatch = mergedOptions.some(
        (name) => name.toLowerCase() === search.trim().toLowerCase()
    );
    const canAddCustom = search.trim().length > 0 && !hasExactMatch;

    const toggleValue = (name: string) => {
        const key = name.toLowerCase();
        const exists = value.some((selected) => selected.toLowerCase() === key);
        if (exists) {
            onChange(value.filter((selected) => selected.toLowerCase() !== key));
            return;
        }
        onChange([...value, name]);
    };

    const removeValue = (name: string) => {
        const key = name.toLowerCase();
        onChange(value.filter((selected) => selected.toLowerCase() !== key));
    };

    const visibleValues = expanded ? value : value.slice(0, 5);
    const hiddenCount = value.length - visibleValues.length;

    return (
        <div className={`space-y-2 ${className ?? ""}`}>
            <Popover open={open} onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (!nextOpen) {
                    setSearch("");
                }
            }} modal={true}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full h-auto justify-between font-normal px-3 py-2 hover:bg-transparent data-[state=open]:bg-transparent"
                    >
                        <div className="flex flex-wrap items-center gap-1.5 min-h-5">
                            {value.length === 0 ? (
                                <span className="text-muted-foreground truncate">{placeholder}</span>
                            ) : (
                                <>
                                    {visibleValues.map((name) => (
                                        <Badge key={name} variant="secondary" className="gap-1 pr-1">
                                            <span className="max-w-40 truncate">{name}</span>
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                className="rounded-sm opacity-70 hover:opacity-100"
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    removeValue(name);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        removeValue(name);
                                                    }
                                                }}
                                                aria-label={`Remove ${name}`}
                                            >
                                                <X />
                                            </span>
                                        </Badge>
                                    ))}
                                    {hiddenCount > 0 && (
                                        <Badge
                                            variant="outline"
                                            role="button"
                                            tabIndex={0}
                                            className="cursor-pointer select-none hover:bg-accent"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setExpanded(true);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    setExpanded(true);
                                                }
                                            }}
                                        >
                                            +{hiddenCount} more
                                        </Badge>
                                    )}
                                    {expanded && value.length > 5 && (
                                        <Badge
                                            variant="outline"
                                            role="button"
                                            tabIndex={0}
                                            className="cursor-pointer select-none hover:bg-accent"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setExpanded(false);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    setExpanded(false);
                                                }
                                            }}
                                        >
                                            show less
                                        </Badge>
                                    )}
                                </>
                            )}
                        </div>
                        <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                        <CommandInput
                            placeholder={searchPlaceholder}
                            value={search}
                            onValueChange={setSearch}
                        />
                        <CommandList className="max-h-70">
                            <CommandEmpty>{emptyText}</CommandEmpty>

                            {canAddCustom && (
                                <CommandGroup heading="Custom">
                                    <CommandItem
                                        value={`__custom__${search}`}
                                        onSelect={() => {
                                            toggleValue(search.trim());
                                            setSearch("");
                                        }}
                                    >
                                        <Check className="opacity-0" />
                                        <span>Use “{search.trim()}”</span>
                                    </CommandItem>
                                </CommandGroup>
                            )}

                            <CommandGroup>
                                {mergedOptions.map((name) => {
                                    const isSelected = value.some((selected) => selected.toLowerCase() === name.toLowerCase());

                                    return (
                                        <CommandItem
                                            key={name}
                                            value={name}
                                            onSelect={() => toggleValue(name)}
                                        >
                                            <Check className={isSelected ? "opacity-100" : "opacity-0"} />
                                            <span className="truncate">{name}</span>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}