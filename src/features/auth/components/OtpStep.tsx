import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2 } from "lucide-react";

const otpSchema = z.object({
    otp: z.string().min(6, "Code must be 6 digits"),
});

type OtpFormValues = z.infer<typeof otpSchema>;

interface OtpStepProps {
    email: string;
    title: string;
    description?: string;
    helperText?: string;
    submitLabel: string;
    isLoading: boolean;
    onSubmit: (otp: string) => Promise<void>;
    /** Should resolve to true if resend succeeded, false otherwise */
    onResend: () => Promise<boolean>;
}

export function OtpStep({
    email,
    title,
    description,
    helperText = "Enter the verification code from your email",
    submitLabel,
    isLoading,
    onSubmit,
    onResend,
}: OtpStepProps) {
    const [resendCountdown, setResendCountdown] = useState(30);

    const otpForm = useForm<OtpFormValues>({
        resolver: zodResolver(otpSchema),
        defaultValues: { otp: "" },
    });

    // Countdown timer
    useEffect(() => {
        if (resendCountdown > 0) {
            const timer = setInterval(() => {
                setResendCountdown((prev) => prev - 1);
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [resendCountdown]);

    const handleSubmit = async (data: OtpFormValues) => {
        await onSubmit(data.otp);
    };

    const handleResend = async () => {
        if (resendCountdown > 0) return;
        const success = await onResend();
        if (success) setResendCountdown(30);
    };

    /** Reset OTP form (call from parent via ref or on step change) */
    useEffect(() => {
        otpForm.reset();
    }, [email, otpForm]);

    return (
        <>
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>
                    {description ?? `We sent a 6-digit code to ${email}.`}
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={otpForm.handleSubmit(handleSubmit)} className="space-y-4">
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
                        {helperText}
                    </p>
                    <FieldError errors={[otpForm.formState.errors.otp]} className="text-center" />
                </div>
                <DialogFooter>
                    <Button type="submit" disabled={isLoading} className="w-full max-w-[320px] mx-auto">
                        {isLoading && <Loader2 className="animate-spin" />}
                        {submitLabel}
                    </Button>
                </DialogFooter>

                <div className="text-center text-sm text-muted-foreground">
                    Didn't receive the code?{" "}
                    {resendCountdown > 0 ? (
                        <span>Resend in {resendCountdown}s</span>
                    ) : (
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={isLoading}
                            className="underline underline-offset-4 hover:text-primary"
                        >
                            Resend
                        </button>
                    )}
                </div>
            </form>
        </>
    );
}
