import { useState } from "react";
import { type Row } from "@tanstack/react-table";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Controller } from "react-hook-form";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import type { Schedule } from "@schedules/types";
import { ScheduleDetailsModal } from "../modals/ScheduleDetailsModal";
import {
    ROW_MARKER_COLORS,
    getMarkerSwatchClass,
    getScheduleRowMarker,
    removeScheduleRowMarker,
    upsertScheduleRowMarker,
    type RowMarkerColor,
} from "@/features/schedules/utils/row-markers";

interface DataTableRowActionsProps {
    row: Row<Schedule>;
    onDelete?: (schedule: Schedule) => void;
}

interface MarkerFormValues {
    color: RowMarkerColor;
    comment: string;
}

export function DataTableRowActions({
    row,
    onDelete,
}: DataTableRowActionsProps) {
    const schedule = row.original;
    const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
    const [markerDialogOpen, setMarkerDialogOpen] = useState(false);
    const existingMarker = getScheduleRowMarker(schedule);

    const markerForm = useForm<MarkerFormValues>({
        defaultValues: {
            color: existingMarker?.color ?? "yellow",
            comment: existingMarker?.comment ?? "",
        },
    });

    const selectedColor = markerForm.watch("color");

    const openMarkerDialog = () => {
        const marker = getScheduleRowMarker(schedule);
        markerForm.reset({
            color: marker?.color ?? "yellow",
            comment: marker?.comment ?? "",
        });
        setMarkerDialogOpen(true);
    };

    const handleSaveMarker = markerForm.handleSubmit((values) => {
        const comment = values.comment.trim();

        upsertScheduleRowMarker(schedule, {
            color: values.color,
            comment,
        });

        toast.success(existingMarker ? "Marker updated" : "Marker added");
        setMarkerDialogOpen(false);
    });

    const handleRemoveMarker = () => {
        removeScheduleRowMarker(schedule);
        toast.success("Marker removed");
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="data-[state=open]:bg-muted size-8 text-foreground"
                    >
                        <MoreHorizontal />
                        <span className="sr-only">Open menu</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="w-30"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    <DropdownMenuItem onClick={() => setViewDetailsOpen(true)}>
                        View details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => {
                            const timeRange = `${schedule.start_time} - ${schedule.end_time}`;
                            navigator.clipboard.writeText(`${schedule.date}\n${schedule.program}\n${timeRange}`);
                            toast.success("Details copied", {
                                description: `${schedule.program}\n${timeRange}`,
                            });
                        }}
                    >
                        Copy details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={openMarkerDialog}>
                        {existingMarker ? "Edit note" : "Add note"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(schedule)}>
                        Delete
                        {/* <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut> */}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* View Details Modal (read-only) */}
            <ScheduleDetailsModal
                open={viewDetailsOpen}
                onOpenChange={setViewDetailsOpen}
                schedule={schedule}
            />

            <Dialog open={markerDialogOpen} onOpenChange={setMarkerDialogOpen}>
                <DialogContent className="sm:max-w-md gap-6">
                    <DialogHeader>
                        <DialogTitle>{existingMarker ? "Edit Note" : "Add Note"}</DialogTitle>
                        <DialogDescription>
                            Add sticky note for this schedule row.
                        </DialogDescription>
                    </DialogHeader>

                    <FieldGroup>
                        <Controller
                            control={markerForm.control}
                            name="color"
                            render={({ field }) => (
                                <Field>
                                    <FieldLabel htmlFor="marker-color">Color</FieldLabel>
                                    <div id="marker-color" className="flex items-center gap-2 flex-wrap">
                                        {ROW_MARKER_COLORS.map((option) => {
                                            const checked = selectedColor === option.value;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => field.onChange(option.value)}
                                                    aria-label={`Select ${option.label}`}
                                                    aria-pressed={checked}
                                                    title={option.label}
                                                    className={cn(
                                                        "size-6 rounded-full border shadow-sm transition",
                                                        getMarkerSwatchClass(option.value),
                                                        !checked && "opacity-90 hover:opacity-100",
                                                        checked && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                                                    )}
                                                />
                                            );
                                        })}
                                    </div>
                                </Field>
                            )}
                        />

                        <Controller
                            control={markerForm.control}
                            name="comment"
                            rules={{
                                required: "Comment is required",
                                validate: (value) => value.trim().length > 0 || "Comment is required",
                            }}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel htmlFor="marker-comment">Comment</FieldLabel>
                                    <Textarea
                                        id="marker-comment"
                                        {...field}
                                        placeholder="Add a comment..."
                                        className="h-28 min-h-28 resize-none"
                                    />
                                    <FieldError errors={[fieldState.error]} />
                                </Field>
                            )}
                        />
                    </FieldGroup>

                    <DialogFooter>
                        {existingMarker && (
                            <Button
                                variant="destructive-outline"
                                size="icon"
                                onClick={() => {
                                    handleRemoveMarker();
                                    setMarkerDialogOpen(false);
                                }}
                                type="button"
                                className="text-destructive mr-auto"
                            >
                                <Trash2 />
                            </Button>
                        )}
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setMarkerDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleSaveMarker}>Save</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
