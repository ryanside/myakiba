import { HugeiconsIcon } from "@hugeicons/react";
import { Mail01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { BackLink } from "@/components/ui/back-link";
import { MyAkibaLogo } from "@/components/myakiba-logo";

type VerifyEmailViewProps = {
  readonly email?: string;
};

export function VerifyEmailView({ email }: VerifyEmailViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center justify-center gap-2">
        <Link to="/">
          <MyAkibaLogo size="full" className="size-28" />
        </Link>
        <div className="text-center">
          <h1 className="text-2xl font-medium">Verify your email</h1>
        </div>
      </div>

      <div className="text-center space-y-4">
        <div className="mx-auto size-12 bg-primary/10 rounded-full flex items-center justify-center">
          <HugeiconsIcon icon={Mail01Icon} className="size-6 text-primary" />
        </div>
        {email ? (
          <p className="text-muted-foreground">
            We've sent a verification link to <br />
            <span className="font-medium text-foreground">{email}</span>
          </p>
        ) : (
          <p className="text-muted-foreground">We've sent a verification link to your email.</p>
        )}
        <p className="text-sm text-muted-foreground">
          Click the link in the email to verify your account and start using myakiba. If you don't
          see it, check your spam folder.
        </p>
        <p className="text-sm text-muted-foreground">
          Didn't receive it? Sign in again to send a new link.
        </p>
      </div>

      <div className="flex justify-center">
        <BackLink to="/login" text="Back to Login" font="sans" />
      </div>
    </div>
  );
}
