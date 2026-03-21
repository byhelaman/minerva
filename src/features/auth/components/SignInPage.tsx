import { useState } from "react";
import { SignInForm } from "./SignInForm";
import { SignupForm } from "./SignupForm";
import { RecoveryForm } from "./RecoveryForm";

type View = "signin" | "signup" | "recovery";

export function SignInPage() {
  const [view, setView] = useState<View>("signin");

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {view === "signin" && (
          <SignInForm
            onSignUp={() => setView("signup")}
            onForgotPassword={() => setView("recovery")}
          />
        )}
        {view === "signup" && (
          <SignupForm onSignIn={() => setView("signin")} />
        )}
        {view === "recovery" && (
          <RecoveryForm onSignIn={() => setView("signin")} />
        )}
      </div>
    </div>
  );
}
