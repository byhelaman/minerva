import { useState, useRef } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

const step1Schema = z.object({
  email: z.string().email("Enter a valid email"),
  code: z.string().length(6, "Enter the 6-digit code"),
});

const step2Schema = z.object({
  password: z.string().min(8, "Must be at least 8 characters long"),
});

type Step1Form = z.infer<typeof step1Schema>;
type Step2Form = z.infer<typeof step2Schema>;

const COOLDOWN_SECONDS = 60;

export function RecoveryForm({
  onSignIn,
  ...props
}: React.ComponentProps<typeof Card> & { onSignIn?: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [cooldown, setCooldown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const step1 = useForm<Step1Form>({
    resolver: zodResolver(step1Schema),
    defaultValues: { email: "", code: "" },
  });

  const step2 = useForm<Step2Form>({
    resolver: zodResolver(step2Schema),
    defaultValues: { password: "" },
  });

  const emailValue = step1.watch("email");

  const startCooldown = () => {
    setCooldown(COOLDOWN_SECONDS);
    intervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(emailValue);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Code sent! Check your email.");
    startCooldown();
  };

  const onStep1Submit = async (data: Step1Form) => {
    const { error } = await supabase.auth.verifyOtp({
      email: data.email,
      token: data.code,
      type: "recovery",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setStep(2);
  };

  const onStep2Submit = async (data: Step2Form) => {
    const { error } = await supabase.auth.updateUser({ password: data.password });
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle className="font-semibold">Reset your password</CardTitle>
        <CardDescription>
          {step === 1
            ? "Enter your email and the code we'll send you."
            : "Choose a new password for your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 1 && (
          <form onSubmit={step1.handleSubmit(onStep1Submit)}>
            <FieldGroup>
              <Controller
                name="email"
                control={step1.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="recovery-email">Email</FieldLabel>
                    <Input
                      {...field}
                      id="recovery-email"
                      type="email"
                      placeholder="m@example.com"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                name="code"
                control={step1.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="recovery-code">Verification Code</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        {...field}
                        id="recovery-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit code"
                        aria-invalid={fieldState.invalid}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          variant="link"
                          onClick={handleSendCode}
                          disabled={cooldown > 0 || !emailValue}
                        >
                          {cooldown > 0 ? `Resend in ${cooldown}s` : "Send code"}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Field>
                <Button type="submit" disabled={step1.formState.isSubmitting}>
                  {step1.formState.isSubmitting ? "Verifying..." : "Continue"}
                </Button>
                <FieldDescription className="text-center">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="underline underline-offset-4 hover:text-primary"
                  >
                    Sign in
                  </button>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={step2.handleSubmit(onStep2Submit)}>
            <FieldGroup>
              <Controller
                name="password"
                control={step2.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="new-password">New Password</FieldLabel>
                    <Input
                      {...field}
                      id="new-password"
                      type="password"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>Must be at least 8 characters long.</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Field>
                <Button type="submit" disabled={step2.formState.isSubmitting}>
                  {step2.formState.isSubmitting ? "Resetting..." : "Reset password"}
                </Button>
                <FieldDescription className="text-center">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="underline underline-offset-4 hover:text-primary"
                  >
                    Back
                  </button>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
