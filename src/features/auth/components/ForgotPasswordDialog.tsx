import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { OtpStep } from "./OtpStep";

const emailSchema = z.object({
    email: z.string().email("Invalid email address"),
});

const passwordSchema = z.object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

type Step = "email" | "otp" | "password";

interface ForgotPasswordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultEmail?: string;
}

export function ForgotPasswordDialog({
    open,
    onOpenChange,
    defaultEmail,
}: ForgotPasswordDialogProps) {
    const navigate = useNavigate();
    const { sendResetPasswordEmail, verifyOtp, updatePassword, refreshProfile } = useAuth();
    const [step, setStep] = useState<Step>("email");
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const isSuccess = useRef(false);

    // Formulario de Email
    const emailForm = useForm<z.infer<typeof emailSchema>>({
        resolver: zodResolver(emailSchema),
        defaultValues: { email: defaultEmail || "" },
    });

    // Resetear formulario de email cuando defaultEmail cambia
    useEffect(() => {
        if (defaultEmail) {
            emailForm.setValue("email", defaultEmail);
        }
    }, [defaultEmail, emailForm]);

    // Formulario de Password
    const passwordForm = useForm<z.infer<typeof passwordSchema>>({
        resolver: zodResolver(passwordSchema),
        defaultValues: { password: "", confirmPassword: "" },
    });

    // Limpieza al cerrar
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            // Advertir si está en el paso de password (ya verificó OTP pero no cambió contraseña)
            // Y SOLO si no fue un éxito
            if (step === "password" && !isSuccess.current) {
                toast.dismiss();
                toast.warning("Your password was not changed", {
                    description: "You can change it later in your Profile.",
                });
            }

            // Reset state after a small delay to allow animation to finish
            setTimeout(() => {
                setStep("email");
                setEmail("");
                emailForm.reset();
                passwordForm.reset();
                isSuccess.current = false;
            }, 300);
        }
        onOpenChange(newOpen);
    };

    const handleEmailSubmit = async (data: z.infer<typeof emailSchema>) => {
        setIsLoading(true);
        try {
            const { error } = await sendResetPasswordEmail(data.email);
            if (error) {
                toast.error(error.message);
            } else {
                setEmail(data.email);
                setStep("otp");
                toast.success("Verification code sent to your email");
            }
        } catch {
            toast.error("Failed to send code");
        } finally {
            setIsLoading(false);
        }
    };

    // Verificar OTP
    const handleOtpSubmit = async (otp: string) => {
        setIsLoading(true);
        try {
            const { error } = await verifyOtp(email, otp, "recovery");
            if (error) {
                toast.error("Invalid code");
            } else {
                setStep("password");
            }
        } catch {
            toast.error("Failed to verify code");
        } finally {
            setIsLoading(false);
        }
    };

    // Reenviar código — returns true on success for countdown reset
    const handleResend = async (): Promise<boolean> => {
        setIsLoading(true);
        try {
            const { error } = await sendResetPasswordEmail(email);
            if (error) {
                toast.error(error.message);
                return false;
            }
            toast.success("Verification code resent");
            return true;
        } catch {
            toast.error("Failed to resend code");
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const handlePasswordSubmit = async (data: z.infer<typeof passwordSchema>) => {
        setIsLoading(true);
        try {
            const { error } = await updatePassword(data.password);
            if (error) {
                toast.error("Failed to update password");
            } else {
                isSuccess.current = true;
                await refreshProfile(); // Asegurar que el perfil esté cargado
                toast.success("Password updated successfully!");
                handleOpenChange(false);
                navigate("/");
            }
        } catch {
            toast.error("Failed to update password");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-sm gap-6">
                {step === "email" && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Reset Password</DialogTitle>
                            <DialogDescription>
                                Enter your email and we'll send you a verification code.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)}>
                            <FieldGroup>
                                <Controller
                                    name="email"
                                    control={emailForm.control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                                            <Input
                                                {...field}
                                                id={field.name}
                                                type="email"
                                                placeholder="m@example.com"
                                                aria-invalid={fieldState.invalid}
                                                disabled={isLoading}
                                            />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                            </FieldGroup>
                            <DialogFooter className="mt-6">
                                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading && <Loader2 className="animate-spin" />}
                                    Send Code
                                </Button>
                            </DialogFooter>
                        </form>
                    </>
                )}

                {step === "otp" && (
                    <OtpStep
                        email={email}
                        title="Enter Verification Code"
                        helperText="Enter your one-time password"
                        submitLabel="Verify Code"
                        isLoading={isLoading}
                        onSubmit={handleOtpSubmit}
                        onResend={handleResend}
                    />
                )}

                {step === "password" && (
                    <>
                        <DialogHeader>
                            <DialogTitle>New Password</DialogTitle>
                            <DialogDescription>
                                Enter your new password below.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}>
                            <FieldGroup>
                                <Controller
                                    name="password"
                                    control={passwordForm.control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor={field.name}>New Password</FieldLabel>
                                            <Input
                                                {...field}
                                                id={field.name}
                                                type="password"
                                                aria-invalid={fieldState.invalid}
                                                disabled={isLoading}
                                            />
                                            <FieldDescription>
                                                Password must be at least 8 characters.
                                            </FieldDescription>
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                                <Controller
                                    name="confirmPassword"
                                    control={passwordForm.control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor={field.name}>Confirm Password</FieldLabel>
                                            <Input
                                                {...field}
                                                id={field.name}
                                                type="password"
                                                aria-invalid={fieldState.invalid}
                                                disabled={isLoading}
                                            />
                                            <FieldDescription>
                                                Please confirm your new password.
                                            </FieldDescription>
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                            </FieldGroup>
                            <DialogFooter className="mt-6">
                                <Button type="submit" disabled={isLoading} className="w-full">
                                    {isLoading && <Loader2 className="animate-spin" />}
                                    Reset Password
                                </Button>
                            </DialogFooter>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
