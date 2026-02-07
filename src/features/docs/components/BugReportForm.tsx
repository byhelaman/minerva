import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"
import { Bug, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
    InputGroup,
    InputGroupAddon,
    InputGroupText,
    InputGroupTextarea,
} from "@/components/ui/input-group"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { STORAGE_KEYS } from "@/lib/constants"

// Función helper para contar palabras
const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
};

// Validador custom para límite de palabras
const maxWords = (max: number) => (val: string) => {
    return countWords(val) <= max;
};

const formSchema = z.object({
    title: z
        .string()
        .min(5, "Bug title must be at least 5 characters.")
        .max(50, "Bug title must be at most 50 characters."),
    description: z
        .string()
        .min(10, "Description must be at least 10 characters.")
        .refine(maxWords(200), "Description must be at most 200 words."),
})

const COOLDOWN_MS = 30000 // 30 segundos

export function BugReportButton() {
    const [open, setOpen] = React.useState(false)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const { user, profile } = useAuth()

    // Limpiar cooldown expirado de localStorage al montar
    React.useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.RATE_LIMIT)
        if (stored) {
            const expiry = parseInt(stored, 10)
            if (Date.now() >= expiry) {
                localStorage.removeItem(STORAGE_KEYS.RATE_LIMIT)
            }
        }
    }, [])

    // Verificar rate limit (calculado al momento de usar, no cada render)
    const checkRateLimit = (): { allowed: boolean; secondsRemaining: number } => {
        const stored = localStorage.getItem(STORAGE_KEYS.RATE_LIMIT)
        if (!stored) return { allowed: true, secondsRemaining: 0 }

        const expiry = parseInt(stored, 10)

        // Handle corrupted/invalid localStorage values
        if (isNaN(expiry)) {
            localStorage.removeItem(STORAGE_KEYS.RATE_LIMIT)
            return { allowed: true, secondsRemaining: 0 }
        }

        if (Date.now() >= expiry) {
            localStorage.removeItem(STORAGE_KEYS.RATE_LIMIT)
            return { allowed: true, secondsRemaining: 0 }
        }

        return { allowed: false, secondsRemaining: Math.ceil((expiry - Date.now()) / 1000) }
    }

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: "",
            description: "",
        },
    })

    async function onSubmit(data: z.infer<typeof formSchema>) {
        // Rate limit check
        const rateLimit = checkRateLimit()
        if (!rateLimit.allowed) {
            toast.error("Please wait", {
                description: `You can submit another report in ${rateLimit.secondsRemaining} seconds.`,
                position: "bottom-right",
            })
            return
        }

        setIsSubmitting(true)

        try {
            const { error } = await supabase.from('bug_reports').insert({
                title: data.title,
                description: data.description,
                user_id: user?.id || null,
                user_email: user?.email || profile?.email || 'anonymous',
            })

            if (error) throw error

            toast.success("Bug report submitted!", {
                description: "Thank you for helping us improve Minerva.",
                position: "bottom-right",
            })
            form.reset()
            setOpen(false)

            // Aplicar cooldown persistente en localStorage
            localStorage.setItem(STORAGE_KEYS.RATE_LIMIT, (Date.now() + COOLDOWN_MS).toString())
        } catch (error) {
            console.error("Error submitting bug report:", error)
            toast.error("Failed to submit bug report", {
                description: "Please try again later.",
                position: "bottom-right",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    size="icon"
                    className="fixed bottom-6 left-6 h-12 w-12 rounded-2xl z-50"
                    variant="outline"
                >
                    <Bug className="h-5 w-5" />
                    <span className="sr-only">Report a bug</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                align="start"
                className="w-[380px] p-0 rounded-xl"
                sideOffset={12}
            >
                <Card className="border-0 shadow-none">
                    <CardHeader>
                        <CardTitle className="text-base">Bug Report</CardTitle>
                        <CardDescription>
                            Help us improve by reporting bugs you encounter.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form id="bug-report-form" onSubmit={form.handleSubmit(onSubmit)}>
                            <FieldGroup>
                                <Controller
                                    name="title"
                                    control={form.control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor="bug-report-title">
                                                Bug Title
                                            </FieldLabel>
                                            <Input
                                                {...field}
                                                id="bug-report-title"
                                                aria-invalid={fieldState.invalid}
                                                placeholder="Login button not working"
                                                autoComplete="off"
                                            />
                                            {fieldState.invalid && (
                                                <FieldError errors={[fieldState.error]} />
                                            )}
                                        </Field>
                                    )}
                                />
                                <Controller
                                    name="description"
                                    control={form.control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor="bug-report-description">
                                                Description
                                            </FieldLabel>
                                            <InputGroup>
                                                <InputGroupTextarea
                                                    {...field}
                                                    id="bug-report-description"
                                                    placeholder="Describe what happened..."
                                                    rows={4}
                                                    className="min-h-20 resize-none max-h-[200px] no-scrollbar"
                                                    aria-invalid={fieldState.invalid}
                                                />
                                                <InputGroupAddon align="block-end">
                                                    <InputGroupText className="tabular-nums">
                                                        {countWords(field.value)}/200
                                                    </InputGroupText>
                                                </InputGroupAddon>
                                            </InputGroup>
                                            <FieldDescription>
                                                Steps to reproduce, expected vs actual behavior.
                                            </FieldDescription>
                                            {fieldState.invalid && (
                                                <FieldError errors={[fieldState.error]} />
                                            )}
                                        </Field>
                                    )}
                                />
                            </FieldGroup>
                        </form>
                    </CardContent>
                    <CardFooter className="pt-0 gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isSubmitting}
                            onClick={() => {
                                form.reset()
                                // setOpen(false)
                            }}
                        >
                            Reset
                        </Button>
                        <Button type="submit" form="bug-report-form" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="animate-spin" />}
                            {isSubmitting ? "Submitting..." : "Submit"}
                        </Button>
                    </CardFooter>
                </Card>
            </PopoverContent>
        </Popover>
    )
}
