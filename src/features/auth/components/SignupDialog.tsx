import { useState, useEffect } from "react";
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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// Schema para el formulario de registro
const signupFormSchema = z.object({
    name: z.string().min(1, "Full name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

const otpSchema = z.object({
    otp: z.string().min(6, "Code must be 6 digits"),
});

type Step = "form" | "otp";

interface SignupDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Si se proporciona, inicia directamente en el paso OTP con este email */
    initialEmail?: string;
    initialStep?: Step;
}

export function SignupDialog({
    open,
    onOpenChange,
    initialEmail,
    initialStep = "form"
}: SignupDialogProps) {
    const navigate = useNavigate();
    const { signUp, verifyOtp } = useAuth();
    const [step, setStep] = useState<Step>(initialStep);
    const [email, setEmail] = useState(initialEmail || "");
    const [isLoading, setIsLoading] = useState(false);
    const [resendCountdown, setResendCountdown] = useState(0);

    // Temporizador para reenvío
    useEffect(() => {
        if (resendCountdown > 0) {
            const timer = setInterval(() => {
                setResendCountdown((prev) => prev - 1);
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [resendCountdown]);

    // Formulario de registro
    const signupForm = useForm<z.infer<typeof signupFormSchema>>({
        resolver: zodResolver(signupFormSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
            confirmPassword: "",
        },
    });

    // Formulario de OTP
    const otpForm = useForm<z.infer<typeof otpSchema>>({
        resolver: zodResolver(otpSchema),
        defaultValues: { otp: "" },
    });

    // Sincronizar con props iniciales cuando cambian
    useEffect(() => {
        if (open && initialStep) {
            setStep(initialStep);
        }
        if (open && initialEmail) {
            setEmail(initialEmail);
        }
    }, [open, initialStep, initialEmail]);

    // Limpieza al cerrar
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setTimeout(() => {
                setStep(initialStep || "form");
                setEmail(initialEmail || "");
                signupForm.reset();
                otpForm.reset();
            }, 300);
        }
        onOpenChange(newOpen);
    };

    // Reenviar OTP
    const handleResendCode = async () => {
        if (resendCountdown > 0) return;

        setIsLoading(true);
        try {
            // Re-registro activa nuevo email OTP
            const formData = signupForm.getValues();
            const { error } = await signUp(formData.email, formData.password, formData.name);
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

    // Enviar formulario de registro
    const handleSignupSubmit = async (data: z.infer<typeof signupFormSchema>) => {
        setIsLoading(true);
        try {
            const { error } = await signUp(data.email, data.password, data.name);
            if (error) {
                toast.error(error.message);
            } else {
                setEmail(data.email);
                setStep("otp");
                setResendCountdown(30);
                toast.success("Verification code sent to your email");
            }
        } catch {
            toast.error("Failed to create account");
        } finally {
            setIsLoading(false);
        }
    };

    // Enviar OTP
    const handleOtpSubmit = async (data: z.infer<typeof otpSchema>) => {
        setIsLoading(true);
        try {
            const { error } = await verifyOtp(email, data.otp, "signup");
            if (error) {
                toast.error("Invalid verification code");
            } else {
                toast.success("Welcome to Minerva! 🎉");
                handleOpenChange(false);
                navigate("/");
            }
        } catch {
            toast.error("Failed to verify code");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md gap-6">
                {step === "form" && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Create an Account</DialogTitle>
                            <DialogDescription>
                                Enter your information to create your account.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={signupForm.handleSubmit(handleSignupSubmit)}>
                            <FieldGroup>
                                <Controller
                                    name="name"
                                    control={signupForm.control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor={field.name}>Full Name</FieldLabel>
                                            <Input
                                                {...field}
                                                id={field.name}
                                                type="text"
                                                placeholder="John Doe"
                                                aria-invalid={fieldState.invalid}
                                                disabled={isLoading}
                                            />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                                <Controller
                                    name="email"
                                    control={signupForm.control}
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
                                            <FieldDescription>We will not share your email with anyone else.</FieldDescription>
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                                <Controller
                                    name="password"
                                    control={signupForm.control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                                            <Input
                                                {...field}
                                                id={field.name}
                                                type="password"
                                                aria-invalid={fieldState.invalid}
                                                disabled={isLoading}
                                            />
                                            <FieldDescription>Must be at least 8 characters long.</FieldDescription>
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                                <Controller
                                    name="confirmPassword"
                                    control={signupForm.control}
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
                                            <FieldDescription>Please confirm your password.</FieldDescription>
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
                                    Create Account
                                </Button>
                            </DialogFooter>
                        </form>
                    </>
                )}

                {step === "otp" && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Verify Your Email</DialogTitle>
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
                                    Enter the verification code from your email
                                </p>
                                <FieldError errors={[otpForm.formState.errors.otp]} className="text-center" />
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={isLoading} className="w-full max-w-[320px] mx-auto">
                                    {isLoading && <Loader2 className="animate-spin" />}
                                    Verify Email
                                </Button>
                            </DialogFooter>

                            <div className="text-center text-sm text-muted-foreground">
                                Didn't receive the code?{" "}
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
            </DialogContent>
        </Dialog>
    );
}
