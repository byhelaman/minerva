import React, { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface InstructorMultiSelectProps {
    value: string[];
    onChange: (next: string[]) => void;
    options: string[];
    placeholder: string;
    searchPlaceholder: string;
    emptyText: string;
    className?: string;
}

const MAX_VISIBLE_SUGGESTIONS = 5;

export function InstructorMultiSelect({
    value,
    onChange,
    options,
    placeholder,
    searchPlaceholder,
    emptyText,
    className,
}: InstructorMultiSelectProps) {
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [focused, setFocused] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [cursorIndex, setCursorIndex] = useState(value.length);
    const [allSelected, setAllSelected] = useState(false);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!focused && value.length <= 5) {
            setExpanded(false);
        }
    }, [value.length, focused]);

    useEffect(() => {
        setCursorIndex((prev) => Math.min(prev, value.length));
    }, [value.length]);

    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!open && highlightedIndex !== -1) {
            setHighlightedIndex(-1);
        }
    }, [open, highlightedIndex]);

    const optionsLookup = useMemo(() => {
        const map = new Map<string, string>();
        for (const name of options) {
            const trimmed = name.trim();
            if (trimmed) {
                map.set(trimmed.toLowerCase(), trimmed);
            }
        }
        return map;
    }, [options]);

    const selectedSet = useMemo(() => new Set(value.map((item) => item.toLowerCase())), [value]);

    const filteredOptions = useMemo(() => {
        const query = search.trim().toLowerCase();
        return options
            .filter((name) => {
                const key = name.trim().toLowerCase();
                if (!key) return false;
                if (selectedSet.has(key)) return false;
                if (!query) return true;
                return key.includes(query);
            })
            .sort((a, b) => a.localeCompare(b));
    }, [options, search, selectedSet]);

    const visibleSuggestions = filteredOptions.slice(0, MAX_VISIBLE_SUGGESTIONS);

    const resolveToken = (raw: string): string | null => {
        const trimmed = raw.trim();
        if (!trimmed) return null;

        const key = trimmed.toLowerCase();
        const exists = value.some((selected) => selected.toLowerCase() === key);
        if (exists) return null;

        return optionsLookup.get(key) ?? trimmed;
    };

    const isKnownOption = (name: string): boolean => {
        return optionsLookup.has(name.trim().toLowerCase());
    };

    const commitToken = (rawValue: string) => {
        const resolved = resolveToken(rawValue);
        if (!resolved) return;

        const next = [...value];
        next.splice(cursorIndex, 0, resolved);
        onChange(next);
        setCursorIndex((prev) => prev + 1);
    };

    const removeValueAt = (indexToRemove: number) => {
        if (indexToRemove < 0 || indexToRemove >= value.length) return;
        const next = value.filter((_, index) => index !== indexToRemove);
        onChange(next);
        if (indexToRemove < cursorIndex) {
            setCursorIndex((prev) => prev - 1);
        }
    };

    const showAll = expanded || focused;
    const visibleValues = showAll ? value : value.slice(0, 5);
    const hiddenCount = value.length - visibleValues.length;

    const closePopover = () => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
        }
        closeTimeoutRef.current = setTimeout(() => setOpen(false), 100);
    };

    const openPopover = () => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
        }
        setOpen(true);
    };

    const commitFromDropdown = () => {
        if (visibleSuggestions.length > 0 && highlightedIndex >= 0 && highlightedIndex < visibleSuggestions.length) {
            commitToken(visibleSuggestions[highlightedIndex]);
            setSearch("");
            setHighlightedIndex(-1);
            setOpen(false);
            return;
        }

        const current = search.trim();
        if (current.length > 0) {
            commitToken(current);
            setSearch("");
            setHighlightedIndex(-1);
            setOpen(false);
        }
    };

    const commitLiteral = () => {
        const current = search.trim();
        if (current.length > 0) {
            commitToken(current);
            setSearch("");
            setHighlightedIndex(-1);
            setOpen(false);
        }
    };

    const parseAndCommit = (raw: string): string => {
        if (!raw) return "";

        const parts = raw.split(/[\n,;]+/);
        const hasDelimiterAtEnd = /[\n,;]\s*$/.test(raw);
        const draft = hasDelimiterAtEnd ? "" : (parts.pop() ?? "");

        for (const token of parts) {
            commitToken(token);
        }

        return draft;
    };

    const inputPlaceholder = value.length === 0 ? placeholder : "";

    const isInputEmpty = () => search.length === 0;

    const isCaretAtStart = () => {
        const el = inputRef.current;
        if (!el) return isInputEmpty();
        return el.selectionStart === 0 && el.selectionEnd === 0;
    };

    const isCaretAtEnd = () => {
        const el = inputRef.current;
        if (!el) return isInputEmpty();
        return el.selectionStart === search.length && el.selectionEnd === search.length;
    };

    const findPillIndexAboveOrBelow = (direction: "up" | "down"): number | null => {
        const root = containerRef.current;
        if (!root) return null;

        const inputEl = inputRef.current;
        if (!inputEl) return null;

        const inputRect = inputEl.getBoundingClientRect();
        const inputCenterX = inputRect.left + inputRect.width / 2;
        const inputCenterY = inputRect.top + inputRect.height / 2;

        const pillElements = Array.from(root.querySelectorAll("[data-pill-index]")) as HTMLElement[];
        if (pillElements.length === 0) return null;

        const ROW_THRESHOLD = 8;

        const rows = new Map<number, { centerY: number; pills: { index: number; centerX: number }[] }>();
        for (const pill of pillElements) {
            const rect = pill.getBoundingClientRect();
            const cy = rect.top + rect.height / 2;
            const cx = rect.left + rect.width / 2;
            const idx = Number(pill.dataset.pillIndex);

            let matched = false;
            for (const [_rowKey, row] of rows) {
                if (Math.abs(cy - row.centerY) < ROW_THRESHOLD) {
                    row.pills.push({ index: idx, centerX: cx });
                    row.centerY = (row.centerY * (row.pills.length - 1) + cy) / row.pills.length;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                rows.set(rows.size, { centerY: cy, pills: [{ index: idx, centerX: cx }] });
            }
        }

        const sortedRows = Array.from(rows.values()).sort((a, b) => a.centerY - b.centerY);

        let currentRowIdx = -1;
        let minYDist = Infinity;
        for (let i = 0; i < sortedRows.length; i++) {
            const dist = Math.abs(sortedRows[i].centerY - inputCenterY);
            if (dist < minYDist) {
                minYDist = dist;
                currentRowIdx = i;
            }
        }

        const targetRowIdx = direction === "up" ? currentRowIdx - 1 : currentRowIdx + 1;
        if (targetRowIdx < 0 || targetRowIdx >= sortedRows.length) return null;

        const targetRow = sortedRows[targetRowIdx];
        let bestIndex: number | null = null;
        let bestXDist = Infinity;

        for (const pill of targetRow.pills) {
            const dist = Math.abs(pill.centerX - inputCenterX);
            if (dist < bestXDist) {
                bestXDist = dist;
                bestIndex = pill.index;
            }
        }

        return bestIndex;
    };

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextRaw = event.target.value;
        const nextDraft = parseAndCommit(nextRaw);
        setSearch(nextDraft);
        setHighlightedIndex(nextDraft.trim().length > 0 ? 0 : -1);
        setOpen(true);
    };

    const handleInputPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
        const pasted = event.clipboardData.getData("text");
        if (!pasted.includes(",") && !pasted.includes(";") && !pasted.includes("\n")) {
            return;
        }
        event.preventDefault();
        parseAndCommit(`${search}${pasted}`);
        setSearch("");
        setHighlightedIndex(-1);
        setOpen(true);
    };

    const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const suggestionCount = visibleSuggestions.length;

        if (allSelected) {
            if (event.key === "Backspace" || event.key === "Delete") {
                event.preventDefault();
                onChange([]);
                setCursorIndex(0);
                setAllSelected(false);
                setOpen(false);
                return;
            }

            if (event.key === "Escape") {
                event.preventDefault();
                setAllSelected(false);
                return;
            }

            if (!event.ctrlKey && !event.metaKey && event.key.length === 1) {
                setAllSelected(false);
            }
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
            if (value.length > 0) {
                event.preventDefault();
                setSearch("");
                setAllSelected(true);
                setOpen(false);
            }
            return;
        }

        if (event.key === "ArrowDown") {
            if (open && suggestionCount > 0) {
                event.preventDefault();
                setHighlightedIndex((prev) => (prev + 1) % suggestionCount);
                return;
            }

            if (isInputEmpty()) {
                event.preventDefault();
                const target = findPillIndexAboveOrBelow("down");
                if (target !== null) {
                    setCursorIndex(target);
                    setOpen(false);
                }
            }
            return;
        }

        if (event.key === "ArrowUp") {
            if (open && suggestionCount > 0) {
                event.preventDefault();
                setHighlightedIndex((prev) => (prev - 1 + suggestionCount) % suggestionCount);
                return;
            }

            if (isInputEmpty()) {
                event.preventDefault();
                const target = findPillIndexAboveOrBelow("up");
                if (target !== null) {
                    setCursorIndex(target);
                    setOpen(false);
                }
            }
            return;
        }

        if (event.key === "ArrowLeft") {
            if (isCaretAtStart() && cursorIndex > 0) {
                event.preventDefault();
                setCursorIndex((prev) => prev - 1);
                setOpen(false);
            }
            return;
        }

        if (event.key === "ArrowRight") {
            if (isCaretAtEnd() && cursorIndex < value.length) {
                event.preventDefault();
                setCursorIndex((prev) => prev + 1);
                setOpen(false);
            }
            return;
        }

        if (event.key === "," || event.key === ";") {
            event.preventDefault();
            commitLiteral();
            return;
        }

        if (event.key === "Tab") {
            if (open && highlightedIndex >= 0 && suggestionCount > 0) {
                event.preventDefault();
                commitFromDropdown();
                return;
            }

            if (open) {
                event.preventDefault();
                return;
            }

            return;
        }

        if (event.key === "Enter") {
            if (open && highlightedIndex >= 0 && suggestionCount > 0) {
                event.preventDefault();
                commitFromDropdown();
                return;
            }

            if (search.trim().length > 0) {
                event.preventDefault();
                commitLiteral();
            }
            return;
        }

        if (event.key === "Backspace" && isInputEmpty() && cursorIndex > 0) {
            event.preventDefault();
            removeValueAt(cursorIndex - 1);
            return;
        }

        if (event.key === "Delete" && isInputEmpty() && cursorIndex < value.length) {
            event.preventDefault();
            removeValueAt(cursorIndex);
            return;
        }
    };

    const handleContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
        setAllSelected(false);
        const target = event.target as HTMLElement;
        if (target.closest("[data-token-text='true']") || target.closest("button")) {
            return;
        }

        const root = containerRef.current;
        if (!root) {
            openPopover();
            inputRef.current?.focus();
            return;
        }

        const clickX = event.clientX;
        const clickY = event.clientY;
        const pillElements = Array.from(root.querySelectorAll("[data-pill-index]")) as HTMLElement[];

        if (pillElements.length === 0) {
            setCursorIndex(0);
            openPopover();
            inputRef.current?.focus();
            return;
        }

        const clickRow = pillElements.filter((pill) => {
            const rect = pill.getBoundingClientRect();
            return clickY >= rect.top - 4 && clickY <= rect.bottom + 4;
        });

        if (clickRow.length > 0) {
            let bestIndex = value.length;

            for (const pill of clickRow) {
                const rect = pill.getBoundingClientRect();
                const midX = rect.left + rect.width / 2;
                const idx = Number(pill.dataset.pillIndex);

                if (clickX < midX) {
                    bestIndex = idx;
                    break;
                }
            }

            setCursorIndex(Math.min(bestIndex, value.length));
        }

        openPopover();
        inputRef.current?.focus();
    };

    const handlePillRemoveMouseDown = (event: React.MouseEvent, index: number) => {
        event.preventDefault();
        event.stopPropagation();
        removeValueAt(index);
        inputRef.current?.focus();
    };

    const renderPill = (name: string, index: number) => {
        const known = isKnownOption(name);
        return (
            <Badge
                key={`${name}-${index}`}
                variant={known ? "secondary" : "outline"}
                className={cn(
                    "gap-1 pr-1 cursor-default",
                    !known && "border-dashed",
                    allSelected && "ring-2 ring-ring"
                )}
                data-pill-index={index}
            >
                <span data-token-text="true" className="max-w-60 whitespace-nowrap overflow-hidden text-ellipsis select-none">{name}</span>
                <button
                    type="button"
                    tabIndex={-1}
                    className="rounded-sm opacity-70 hover:opacity-100 select-none"
                    onMouseDown={(event) => handlePillRemoveMouseDown(event, index)}
                    aria-label={`Remove ${name}`}
                >
                    <X className="size-3.5" />
                </button>
            </Badge>
        );
    };

    const inputWidth = search.length > 0
        ? `${Math.max(2, search.length + 1)}ch`
        : value.length === 0
            ? "100%"
            : "1px";

    const handleFocus = () => {
        setFocused(true);
        setExpanded(true);
        openPopover();
    };

    const handleBlur = () => {
        if (search.trim().length > 0) {
            commitToken(search.trim());
            setSearch("");
        }
        setFocused(false);
        setExpanded(false);
        setAllSelected(false);
        closePopover();
    };

    const renderInput = () => (
        <Input
            ref={inputRef}
            value={search}
            placeholder={inputPlaceholder}
            aria-label={searchPlaceholder}
            className="h-6 shrink-0 grow-0 border-0 bg-transparent dark:bg-transparent px-0 py-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 rounded-none cursor-text"
            style={{ width: inputWidth }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleInputChange}
            onPaste={handleInputPaste}
            onKeyDown={handleInputKeyDown}
        />
    );

    const renderPillsWithCursor = () => {
        const items: React.ReactNode[] = [];
        const displayValues = expanded ? value : value.slice(0, 5);
        const clampedCursor = Math.min(cursorIndex, displayValues.length);

        for (let i = 0; i < displayValues.length; i++) {
            if (i === clampedCursor) {
                items.push(<React.Fragment key="__input__">{renderInput()}</React.Fragment>);
            }
            items.push(renderPill(displayValues[i], i));
        }

        if (clampedCursor >= displayValues.length) {
            items.push(<React.Fragment key="__input__">{renderInput()}</React.Fragment>);
        }

        return items;
    };

    return (
        <div className={cn("relative w-full", className)}>
            <div
                ref={containerRef}
                className={cn(
                    "border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex min-h-9 max-h-40 w-full flex-wrap content-start items-center gap-1.5 overflow-y-auto rounded-md border bg-transparent text-sm shadow-xs transition-[color,box-shadow] focus-within:ring-[3px] cursor-text",
                    value.length > 0 ? "p-2" : "px-3 py-1"
                )}
                onMouseDown={(event) => {
                    if (event.target !== inputRef.current) {
                        event.preventDefault();
                    }
                }}
                onClick={handleContainerClick}
            >
                {renderPillsWithCursor()}

                {hiddenCount > 0 && (
                    <span
                        className="font-medium text-xs select-none cursor-default px-1 my-auto"
                    >
                        and {hiddenCount} more
                    </span>
                )}
            </div>

            {open && (
                <div className="bg-popover text-popover-foreground absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border p-1 shadow-md">
                    <div className="text-muted-foreground px-2 py-1 text-xs font-medium select-none">Suggestions</div>
                    {visibleSuggestions.length > 0 ? (
                        visibleSuggestions.map((name, index) => (
                            <button
                                key={name}
                                type="button"
                                className={cn(
                                    "hover:bg-accent hover:text-accent-foreground flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm",
                                    highlightedIndex === index && highlightedIndex >= 0 && "bg-accent text-accent-foreground"
                                )}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    commitToken(name);
                                    setSearch("");
                                    setHighlightedIndex(-1);
                                    setOpen(false);
                                }}
                            >
                                <span className="truncate">{name}</span>
                            </button>
                        ))
                    ) : (
                        <div className="text-muted-foreground px-2 py-2 text-sm">{emptyText}</div>
                    )}
                </div>
            )}
        </div>
    );
}