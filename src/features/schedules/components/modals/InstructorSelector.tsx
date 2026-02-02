import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Instructor } from "../../hooks/useInstructors";

interface InstructorSelectorProps {
    value?: string;
    onChange: (value: string, email: string, id: string) => void;
    instructors: Instructor[];
    disabled?: boolean;
    className?: string;
}

export function InstructorSelector({ value, onChange, instructors, disabled, className }: InstructorSelectorProps) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className="w-full justify-between gap-2 px-3 rounded-lg"
                >
                    <span className="truncate font-normal">
                        {value || "Select instructor"}
                    </span>
                    <ChevronsUpDown className="w-4 h-4 text-muted-foreground opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className={cn("w-full p-0 z-200 pointer-events-auto", className)}
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
