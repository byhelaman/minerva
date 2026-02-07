import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
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
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const emailSchema = z.object({
    email: z.string().email("Invalid email address"),
});

const otpSchema = z.object({
    otp: z.string().min(6, "Code must be at least 6 characters"),
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
    const [resendCountdown, setResendCountdown] = useState(0);
    const isSuccess = useRef(false);


    // Temporizador para reenvío
    useEffect(() => {
        if (resendCountdown > 0) {
            const timer = setInterval(() => {
                setResendCountdown((prev) => prev - 1);
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [resendCountdown]);

    const handleResendCode = async () => {
        if (resendCountdown > 0) return;

        setIsLoading(true);
        try {
            const { error } = await sendResetPasswordEmail(email);
            if (error) {
                toast.error(error.message);
            } else {
                setResendCountdown(30);
                toast.success("Verification code resent");
            }
        } catch {
            toast.error("Failed to resend code");
        } finally {
            setIsLoading(false);
        }
    };

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
                otpForm.reset();
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
                setResendCountdown(30);
                toast.success("Verification code sent to your email");
            }
        } catch {
            toast.error("Failed to send code");
        } finally {
            setIsLoading(false);
        }
    };

    // Formulario de OTP
    const otpForm = useForm<z.infer<typeof otpSchema>>({
        resolver: zodResolver(otpSchema),
        defaultValues: { otp: "" },
    });

    const handleOtpSubmit = async (data: z.infer<typeof otpSchema>) => {
        setIsLoading(true);
        try {
            const { error } = await verifyOtp(email, data.otp, "recovery");
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

    // Formulario de Password
    const passwordForm = useForm<z.infer<typeof passwordSchema>>({
        resolver: zodResolver(passwordSchema),
    });

    const handlePasswordSubmit = async (data: z.infer<typeof passwordSchema>) => {
        setIsLoading(true);
        try {
            const { error } = await updatePassword(data.password);
            if (error) {
                toast.error("Failed to update password");
            } else {
                isSuccess.current = true;
                await refreshProfile(); // Asegurar que el perfil esté cargado
                toast.success("Password updated successfully! 🎉");
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
            <DialogContent className="sm:max-w-md">
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
                                <Field data-invalid={!!emailForm.formState.errors.email}>
                                    <FieldLabel htmlFor="reset-email">Email</FieldLabel>
                                    <Input
                                        id="reset-email"
                                        type="email"
                                        placeholder="m@example.com"
                                        {...emailForm.register("email")}
                                        disabled={isLoading}
                                        aria-invalid={!!emailForm.formState.errors.email}
                                    />
                                    <FieldError errors={[emailForm.formState.errors.email]} />
                                </Field>
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
                    <>
                        <DialogHeader>
                            <DialogTitle>Enter Verification Code</DialogTitle>
                            <DialogDescription>
                                We sent a 6-digit code to {email}.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={otpForm.handleSubmit(handleOtpSubmit)} className="space-y-4">
                            <div className="space-y-2 text-center py-3">
                                <div className="flex justify-center">
                                    <InputOTP
                                        maxLength={6}
                                        value={otpForm.watch("otp")}
                                        onChange={(value) => {
                                            otpForm.setValue("otp", value);
                                            if (value.length < 6) {
                                                otpForm.clearErrors("otp");
                                            }
                                        }}
                                        disabled={isLoading}
                                    >
                                        <InputOTPGroup className="gap-2 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border">
                                            <InputOTPSlot index={0} className="w-10 h-10" />
                                            <InputOTPSlot index={1} className="w-10 h-10" />
                                            <InputOTPSlot index={2} className="w-10 h-10" />
                                            <InputOTPSlot index={3} className="w-10 h-10" />
                                            <InputOTPSlot index={4} className="w-10 h-10" />
                                            <InputOTPSlot index={5} className="w-10 h-10" />
                                        </InputOTPGroup>
                                    </InputOTP>
                                </div>
                                <p className="text-center text-sm text-muted-foreground">
                                    Enter your one-time password
                                </p>
                                <FieldError errors={[otpForm.formState.errors.otp]} className="text-center" />
                            </div>
                            <DialogFooter>
                                {/* <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setStep("email")}
                                    disabled={isLoading}
                                >
                                    Back
                                </Button> */}
                                <Button type="submit" disabled={isLoading} className="w-full max-w-[320px] mx-auto">
                                    {isLoading && <Loader2 className="animate-spin" />}
                                    Verify Code
                                </Button>
                            </DialogFooter>

                            <div className="text-center text-sm text-muted-foreground">
                                Didn't receive the code? {" "}
                                {resendCountdown > 0 ? (
                                    <span>Resend in {resendCountdown}s</span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleResendCode}
                                        disabled={isLoading}
                                        className="underline underline-offset-4 hover:text-primary"
                                    >
                                        Resend
                                    </button>
                                )}
                            </div>
                        </form>
                    </>
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
                                <Field data-invalid={!!passwordForm.formState.errors.password}>
                                    <FieldLabel htmlFor="new-password">New Password</FieldLabel>
                                    <Input
                                        id="new-password"
                                        type="password"
                                        {...passwordForm.register("password")}
                                        disabled={isLoading}
                                        aria-invalid={!!passwordForm.formState.errors.password}
                                    />
                                    <FieldError errors={[passwordForm.formState.errors.password]} />
                                </Field>
                                <Field data-invalid={!!passwordForm.formState.errors.confirmPassword}>
                                    <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        {...passwordForm.register("confirmPassword")}
                                        disabled={isLoading}
                                        aria-invalid={!!passwordForm.formState.errors.confirmPassword}
                                    />
                                    <FieldError errors={[passwordForm.formState.errors.confirmPassword]} />
                                </Field>
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
