import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
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
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
    isLockedOut,
    recordFailedAttempt,
    resetAttempts,
    getRemainingAttempts,
} from "@/lib/rate-limiter";
import { ForgotPasswordDialog } from "./ForgotPasswordDialog";
import { SignupDialog } from "./SignupDialog";

// Esquema de validación para login
const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

function LoginForm({
    className,
    ...props
}: React.ComponentProps<"div">) {
    const { signIn, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Estado para rate limiting
    const [lockoutSeconds, setLockoutSeconds] = useState(0);
    const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
    const [isSignupOpen, setIsSignupOpen] = useState(false);

    // Estado para verificación de email (abre SignupDialog en modo OTP)
    const [pendingEmailForOtp, setPendingEmailForOtp] = useState<string | null>(null);

    const from = (location.state as { from?: Location })?.from?.pathname || "/";

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: localStorage.getItem("minerva_last_email") || "",
        },
    });

    // Verificar lockout al montar y actualizar countdown
    useEffect(() => {
        const checkLockout = () => {
            const { remainingSeconds } = isLockedOut();
            setLockoutSeconds(remainingSeconds);
        };

        checkLockout();
        const interval = setInterval(checkLockout, 1000);
        return () => clearInterval(interval);
    }, []);

    const onSubmit = async (data: LoginFormData) => {
        // Verificar si está bloqueado
        const { locked, remainingSeconds } = isLockedOut();
        if (locked) {
            toast.error(`Too many attempts. Try again in ${remainingSeconds}s`);
            return;
        }

        const { error } = await signIn(data.email, data.password);
        if (error) {
            // Detectar si el error es por email no confirmado
            if (error.message.toLowerCase().includes('email not confirmed')) {
                setPendingEmailForOtp(data.email);
                toast.info('Please verify your email to continue');
                return;
            }

            // Registrar intento fallido
            const nowLocked = recordFailedAttempt();

            if (nowLocked) {
                const { remainingSeconds } = isLockedOut();
                setLockoutSeconds(remainingSeconds);
                toast.error(`Too many attempts. Locked for ${remainingSeconds}s`);
            } else {
                const attempts = getRemainingAttempts();
                toast.error(error.message);
                if (attempts < 5) {
                    toast.warning(`${attempts} attempts remaining`);
                }
            }
        } else {
            // Login exitoso - guardar email y resetear rate limiter
            localStorage.setItem("minerva_last_email", data.email);
            resetAttempts();
            toast.success("Welcome to Minerva");
            navigate(from, { replace: true });
        }
    };

    const isLocked = lockoutSeconds > 0;

    // Redirigir si ya hay un usuario y NO estamos en recovery
    useEffect(() => {
        if (user && !isForgotPasswordOpen && !pendingEmailForOtp) {
            navigate(from, { replace: true });
        }
    }, [user, isForgotPasswordOpen, pendingEmailForOtp, navigate, from]);


    return (
        <div className={cn("flex flex-col gap-6", className)} {...props}>
            <Card>
                <CardHeader>
                    <CardTitle>Login to your account</CardTitle>
                    <CardDescription>
                        Enter your email below to login to your account
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} noValidate>
                        <FieldGroup>
                            <Field data-invalid={!!errors.email}>
                                <FieldLabel htmlFor="email">Email</FieldLabel>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="m@example.com"
                                    disabled={isSubmitting || isLocked}
                                    aria-invalid={!!errors.email}
                                    {...register("email")}
                                />
                                <FieldError errors={[errors.email]} />
                            </Field>
                            <Field data-invalid={!!errors.password}>
                                <div className="flex items-center">
                                    <FieldLabel htmlFor="password">Password</FieldLabel>
                                    <a
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setIsForgotPasswordOpen(true);
                                        }}
                                        className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                                    >
                                        Forgot your password?
                                    </a>
                                </div>
                                <Input
                                    id="password"
                                    type="password"
                                    disabled={isSubmitting || isLocked}
                                    aria-invalid={!!errors.password}
                                    {...register("password")}
                                />
                                <FieldError errors={[errors.password]} />
                            </Field>
                            <Field>
                                <Button type="submit" disabled={isSubmitting || isLocked}>
                                    {isSubmitting && (
                                        <Loader2 className="animate-spin" />
                                    )}
                                    {isLocked ? `Locked (${lockoutSeconds}s)` : "Login"}
                                </Button>
                                <Button variant="outline" type="button" disabled title="Coming soon">
                                    Login with Google (Coming soon)
                                </Button>
                                <FieldDescription className="text-center">
                                    Don&apos;t have an account?{" "}
                                    <button
                                        type="button"
                                        onClick={() => setIsSignupOpen(true)}
                                        className="underline underline-offset-4 hover:text-primary"
                                    >
                                        Sign up
                                    </button>
                                </FieldDescription>
                            </Field>
                        </FieldGroup>
                    </form>
                </CardContent>
            </Card>
            <ForgotPasswordDialog
                open={isForgotPasswordOpen}
                onOpenChange={setIsForgotPasswordOpen}
                defaultEmail={watch("email")}
            />
            <SignupDialog
                open={isSignupOpen || !!pendingEmailForOtp}
                onOpenChange={(open) => {
                    setIsSignupOpen(open);
                    if (!open) setPendingEmailForOtp(null);
                }}
                initialEmail={pendingEmailForOtp || undefined}
                initialStep={pendingEmailForOtp ? "otp" : "form"}
            />
        </div >
    );
}

export function LoginPage() {
    return (
        <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
            <div className="w-full max-w-sm">
                <LoginForm />
            </div>
        </div>
    );
}
