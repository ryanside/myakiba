import { useMutation } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyEarlyAccess } from "@/queries/waitlist";
import { z } from "zod";

interface EarlyAccessModalProps {
  open: boolean;
  onAccessGranted: () => void;
}

export function EarlyAccessModal({ open, onAccessGranted }: EarlyAccessModalProps) {
  const mutation = useMutation({
    mutationFn: verifyEarlyAccess,
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Access granted! Welcome to myakiba.");
        onAccessGranted();
      }
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "Invalid password");
      form.reset();
    },
  });

  const form = useForm({
    defaultValues: {
      password: "",
    },
    onSubmit: async ({ value }) => {
      mutation.mutate(value.password);
    },
    validators: {
      onSubmit: z.object({
        password: z.string().min(1, "Password is required"),
      }),
    },
  });

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <DialogTitle className="font-medium">Early Access</DialogTitle>
          </div>
          <DialogDescription>
            myakiba is currently in early development. Enter the early access password to continue.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Password</Label>
                <Input
                  id={field.name}
                  type="password"
                  placeholder="Enter early access password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  disabled={mutation.isPending}
                  autoFocus
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-sm text-destructive">
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
                className="w-full"
                disabled={!state.canSubmit || state.isSubmitting || mutation.isPending}
              >
                {state.isSubmitting || mutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            )}
          </form.Subscribe>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Don't have access?{" "}
          <a href="/" className="text-primary hover:underline">
            Join the waitlist
          </a>{" "}
          to be notified when we launch.
        </p>
      </DialogContent>
    </Dialog>
  );
}
