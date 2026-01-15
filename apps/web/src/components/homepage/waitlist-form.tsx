import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Turnstile } from "@marsidev/react-turnstile";
import { toast } from "sonner";
import { Loader2, CheckCircle, ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinWaitlist } from "@/queries/waitlist";
import { env } from "@myakiba/env/web";
import { z } from "zod";

export function WaitlistForm() {
  const [isSuccess, setIsSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: joinWaitlist,
    onSuccess: () => {
      setIsSuccess(true);
      toast.success("You're on the list! We'll notify you when we launch.");
      form.reset();
    },
    onError: (error: Error) => {
      toast.error(
        error.message || "Failed to join waitlist. Please try again."
      );
    },
  });

  const form = useForm({
    defaultValues: {
      email: "",
      turnstileToken: "",
    },
    onSubmit: async ({ value }) => {
      mutation.mutate({
        email: value.email.trim(),
        turnstileToken: value.turnstileToken,
      });
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Please enter a valid email address"),
        turnstileToken: z.string("Captcha is required"),
      }),
    },
  });

  if (isSuccess) {
    return (
      <div className="flex items-center gap-2 text-primary py-3 rounded-full">
        <CheckCircle className="size-5" />
        <span className="font-medium">You're on the waitlist!</span>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="flex flex-col sm:flex-row gap-2"
    >
      <form.Field name="email">
        {(field) => (
          <div className="flex flex-col">
            <Input
              id={field.name}
              type="email"
              placeholder="Enter your email"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              disabled={form.state.isSubmitting}
              aria-invalid={field.state.meta.errors.length > 0}
              className="h-12 px-5 rounded-full w-full sm:w-72 border-2 focus-visible:ring-offset-0"
            />
            {field.state.meta.errors.map((error) => (
              <p
                key={error?.message}
                className="text-sm text-destructive mt-1 ml-3"
              >
                {error?.message}
              </p>
            ))}
          </div>
        )}
      </form.Field>
      <form.Subscribe>
        {(state) => (
          <Button
            type="submit"
            variant="mono"
            disabled={
              !state.canSubmit || state.isSubmitting || mutation.isPending
            }
            className="h-12 px-6 rounded-full"
          >
            {state.isSubmitting || mutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                Join Waitlist
                <ArrowRightIcon className="w-4 h-4" />
              </>
            )}
          </Button>
        )}
      </form.Subscribe>
      <form.Field name="turnstileToken">
        {(field) => (
          <Turnstile
            siteKey={env.VITE_TURNSTILE_SITE_KEY}
            options={{
              appearance: "interaction-only",
            }}
            onSuccess={field.handleChange}
          />
        )}
      </form.Field>
    </form>
  );
}
