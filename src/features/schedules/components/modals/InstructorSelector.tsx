import { useState, useRef, ComponentPropsWithoutRef } from "react";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Instructor } from "../../types";

interface InstructorSelectorProps extends Omit<ComponentPropsWithoutRef<typeof Button>, "onChange" | "value"> {
    value?: string;
    onChange: (value: string, email: string, id: string) => void;
    instructors: Instructor[];
    disabled?: boolean;
    className?: string;
    popoverClassName?: string;
    /** When true, allows typing a custom name that's not in the list. */
    allowFreeText?: boolean;
}

export function InstructorSelector({
    value,
    onChange,
    instructors,
    disabled,
    className,
    popoverClassName,
    allowFreeText = false,
    ...props
}: InstructorSelectorProps) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSelect = (displayName: string, email: string, id: string) => {
        onChange(displayName, email, id);
        setInputValue("");
        setOpen(false);
    };

    const handleUseFreeText = () => {
        const trimmed = inputValue.trim();
        if (trimmed) {
            onChange(trimmed, "", "");
            setInputValue("");
            setOpen(false);
        }
    };

    // Check if the typed text matches any instructor exactly (case-insensitive)
    const hasPerfectMatch = instructors.some(
        (i) => i.display_name.toLowerCase() === inputValue.trim().toLowerCase()
    );
    const showFreeTextOption = allowFreeText && inputValue.trim().length > 0 && !hasPerfectMatch;

    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setInputValue(""); }} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "w-full justify-between gap-2 px-3 rounded-lg",
                        className
                    )}
                    {...props}
                >
                    <span className={cn("truncate font-normal", !value && "text-muted-foreground")}>
                        {value || "Select instructor"}
                    </span>
                    <ChevronsUpDown className="w-4 h-4 text-muted-foreground opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className={cn("w-[--radix-popover-trigger-width] p-0 z-200 pointer-events-auto", popoverClassName)}
                align="start"
            >
                <Command>
                    <CommandInput
                        ref={inputRef}
                        placeholder="Search instructor..."
                        value={inputValue}
                        onValueChange={setInputValue}
                    />
                    <CommandList className="max-h-[300px] overflow-y-auto overflow-x-hidden">
                        {showFreeTextOption && (
                            <CommandGroup heading="Custom">
                                <CommandItem
                                    value={`__freetext__${inputValue}`}
                                    onSelect={handleUseFreeText}
                                    className="text-sm"
                                >
                                    <Check className="opacity-0" />
                                    <span className="truncate">Use &ldquo;{inputValue.trim()}&rdquo;</span>
                                </CommandItem>
                            </CommandGroup>
                        )}
                        <CommandEmpty>No instructor found.</CommandEmpty>
                        <CommandGroup>
                            {instructors.map((inst) => (
                                <CommandItem
                                    key={inst.email}
                                    value={inst.display_name}
                                    onSelect={() => handleSelect(inst.display_name, inst.email, inst.id)}
                                >
                                    <Check
                                        className={
                                            value === inst.display_name ? "opacity-100" : "opacity-0"
                                        }
                                    />
                                    <span className="truncate">{inst.display_name}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
