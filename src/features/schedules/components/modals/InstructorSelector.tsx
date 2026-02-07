import { useState, ComponentPropsWithoutRef } from "react";
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
}

export function InstructorSelector({
    value,
    onChange,
    instructors,
    disabled,
    className,
    popoverClassName,
    ...props
}: InstructorSelectorProps) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
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
                    <CommandInput placeholder="Search instructor..." />
                    <CommandList className="max-h-[300px] overflow-y-auto overflow-x-hidden">
                        <CommandEmpty>No instructor found.</CommandEmpty>
                        <CommandGroup>
                            {instructors.map((inst) => (
                                <CommandItem
                                    key={inst.email}
                                    value={inst.display_name}
                                    onSelect={() => {
                                        onChange(inst.display_name, inst.email, inst.id);
                                        setOpen(false);
                                    }}
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
