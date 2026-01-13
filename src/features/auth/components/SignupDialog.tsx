import { useState, useEffect } from "react";
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
}

export function SignupDialog({ open, onOpenChange }: SignupDialogProps) {
    const navigate = useNavigate();
    const { signUp, verifyOtp } = useAuth();
    const [step, setStep] = useState<Step>("form");
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [resendCountdown, setResendCountdown] = useState(0);

    // Countdown timer for resend
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

    // Cleanup on close
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setTimeout(() => {
                setStep("form");
                setEmail("");
                signupForm.reset();
                otpForm.reset();
            }, 300);
        }
        onOpenChange(newOpen);
    };

    // Resend OTP
    const handleResendCode = async () => {
        if (resendCountdown > 0) return;

        setIsLoading(true);
        try {
            // Re-signup triggers a new OTP email
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

    // Submit signup form
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

    // Submit OTP
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
            <DialogContent className="sm:max-w-md">
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
                                <Field data-invalid={!!signupForm.formState.errors.name}>
                                    <FieldLabel htmlFor="signup-name">Full Name</FieldLabel>
                                    <Input
                                        id="signup-name"
                                        type="text"
                                        placeholder="John Doe"
                                        {...signupForm.register("name")}
                                        aria-invalid={!!signupForm.formState.errors.name}
                                        disabled={isLoading}
                                    />
                                    <FieldError errors={[signupForm.formState.errors.name]} />
                                </Field>
                                <Field data-invalid={!!signupForm.formState.errors.email}>
                                    <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                                    <Input
                                        id="signup-email"
                                        type="email"
                                        placeholder="m@example.com"
                                        {...signupForm.register("email")}
                                        aria-invalid={!!signupForm.formState.errors.email}
                                        disabled={isLoading}
                                    />
                                    <FieldDescription>We will not share your email with anyone else.</FieldDescription>
                                    <FieldError errors={[signupForm.formState.errors.email]} />
                                </Field>
                                <Field data-invalid={!!signupForm.formState.errors.password}>
                                    <FieldLabel htmlFor="signup-password">Password</FieldLabel>
                                    <Input
                                        id="signup-password"
                                        type="password"
                                        {...signupForm.register("password")}
                                        aria-invalid={!!signupForm.formState.errors.password}
                                        disabled={isLoading}
                                    />
                                    <FieldDescription>Must be at least 8 characters long.</FieldDescription>
                                    <FieldError errors={[signupForm.formState.errors.password]} />
                                </Field>
                                <Field data-invalid={!!signupForm.formState.errors.confirmPassword}>
                                    <FieldLabel htmlFor="signup-confirm">Confirm Password</FieldLabel>
                                    <Input
                                        id="signup-confirm"
                                        type="password"
                                        {...signupForm.register("confirmPassword")}
                                        aria-invalid={!!signupForm.formState.errors.confirmPassword}
                                        disabled={isLoading}
                                    />
                                    <FieldDescription>Please confirm your password.</FieldDescription>
                                    <FieldError errors={[signupForm.formState.errors.confirmPassword]} />
                                </Field>
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
