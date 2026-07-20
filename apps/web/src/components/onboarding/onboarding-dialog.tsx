import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  CheckListIcon,
  FileUploadIcon,
  LibraryIcon,
  Loading03Icon,
  PackageIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperTrigger,
} from "@/components/reui/stepper";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CurrencySelect } from "@/components/currency-select";
import { useOnboarding } from "@/hooks/use-onboarding";
import { authClient } from "@/lib/auth-client";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { cn } from "@/lib/utils";
import { SyncActionSheet } from "@/components/sync/sync-launcher";
import type { LaunchableSyncType } from "@/components/sync/sync-launcher-options";
import { CURRENCIES, DATE_FORMATS } from "@myakiba/contracts/shared/constants";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { getRouteApi, useRouter } from "@tanstack/react-router";

type StepId = "welcome" | "preferences" | "sync";

type StepMeta = {
  readonly id: StepId;
  readonly step: number;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
};

const STEPS: readonly StepMeta[] = [
  {
    id: "welcome",
    step: 1,
    eyebrow: "Onboarding",
    title: "Welcome to myakiba.",
    description:
      "A quick first setup. myakiba is in early access so expect rough edges and limited features - but we're working hard to make it better. thanks :D",
  },
  {
    id: "preferences",
    step: 2,
    eyebrow: "Preferences",
    title: "Set your username, currency, and date format.",
    description: "Click continue to save your preferences.",
  },
  {
    id: "sync",
    step: 3,
    eyebrow: "Sync",
    title: "Bring in your items.",
    description: "You can always add more later through the + button in the sidebar.",
  },
];

const FIRST_STEP = 1;
const LAST_STEP = STEPS.length;
const FIRST_OPEN_DELAY_MS = 400;
const MIN_USERNAME = 3;
const MAX_USERNAME = 30;
const PANEL_MIN_HEIGHT = "min-h-[440px]";
const EASE_OUT = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const ENTER_TRANSITION = `transition-[opacity,transform,filter] duration-200 ${EASE_OUT} starting:opacity-0 starting:translate-y-1 starting:blur-[2px]`;

const appRouteApi = getRouteApi("/(app)");

function OnboardingDialog() {
  const {
    step: savedStep,
    hasSeen,
    isCompleted,
    setStep,
    complete,
    dismiss,
  } = useOnboarding({ totalSteps: STEPS.length });
  const [open, setOpen] = useState(false);
  const [syncSheetType, setSyncSheetType] = useState<LaunchableSyncType | null>(null);
  const resumeStep = isCompleted
    ? FIRST_STEP
    : Math.min(Math.max(savedStep + 1, FIRST_STEP), LAST_STEP);
  const [currentStep, setCurrentStep] = useState(resumeStep);

  const router = useRouter();
  const { session } = appRouteApi.useRouteContext();
  const sessionUsername = session.user.username ?? "";
  const sessionCurrency = session.user.currency as Currency;
  const sessionDateFormat = session.user.dateFormat as DateFormat;

  const currentMeta = STEPS.find((meta) => meta.step === currentStep) ?? STEPS[0];
  const isFirst = currentStep === FIRST_STEP;
  const isLast = currentStep === LAST_STEP;

  const goToStep = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, FIRST_STEP), LAST_STEP);
      const animationStep = clamped - 1;
      setCurrentStep(clamped);
      setStep(animationStep);
    },
    [setStep],
  );

  const advance = useCallback(() => {
    goToStep(currentStep + 1);
  }, [currentStep, goToStep]);

  const form = useForm({
    defaultValues: {
      username: sessionUsername,
      currency: sessionCurrency,
      dateFormat: sessionDateFormat,
    },
    onSubmit: async ({ value }) => {
      const trimmedUsername = value.username.trim();
      const hasChanges =
        trimmedUsername !== sessionUsername ||
        value.currency !== sessionCurrency ||
        value.dateFormat !== sessionDateFormat;

      if (!hasChanges) {
        advance();
        return;
      }

      const { error } = await authClient.updateUser({
        username: trimmedUsername,
        currency: value.currency,
        dateFormat: value.dateFormat,
      });
      if (error) {
        toast.error(error.message ?? "Couldn't save preferences.");
        return;
      }
      await router.invalidate();
      advance();
    },
    validators: {
      onSubmit: z.object({
        username: z
          .string()
          .min(MIN_USERNAME, `Username must be at least ${MIN_USERNAME} characters`)
          .max(MAX_USERNAME, `Username must be less than ${MAX_USERNAME} characters`),
        currency: z.enum(CURRENCIES),
        dateFormat: z.enum(DATE_FORMATS),
      }),
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      username: sessionUsername,
      currency: sessionCurrency,
      dateFormat: sessionDateFormat,
    });
  }, [open, sessionUsername, sessionCurrency, sessionDateFormat, form]);

  useEffect(() => {
    if (hasSeen) return;
    const timeoutId = window.setTimeout(() => {
      setOpen(true);
      // Persist that the user has seen the dialog at first auto-open, so a
      // tab close or refresh before any interaction doesn't re-trigger it.
      dismiss();
    }, FIRST_OPEN_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [hasSeen, dismiss]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        dismiss();
        setCurrentStep(FIRST_STEP);
      }
    },
    [dismiss],
  );

  const handleBack = useCallback(() => {
    if (isFirst) return;
    goToStep(currentStep - 1);
  }, [isFirst, currentStep, goToStep]);

  const handleContinue = useCallback(async () => {
    if (currentMeta.id === "preferences") {
      await form.handleSubmit();
      return;
    }
    if (!isLast) {
      advance();
      return;
    }
    complete();
    setOpen(false);
    setCurrentStep(FIRST_STEP);
  }, [currentMeta.id, isLast, form, advance, complete]);

  const handleSkip = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handleSelectSync = useCallback(
    (type: LaunchableSyncType) => {
      complete();
      setOpen(false);
      setCurrentStep(FIRST_STEP);
      setSyncSheetType(type);
    },
    [complete],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            <Button variant="ghost" size="sm">
              <HugeiconsIcon icon={CheckListIcon} strokeWidth={2} />
              <span className="hidden sm:inline">Getting started</span>
            </Button>
          }
        />

        <DialogContent
          className="sm:max-w-xl gap-0 overflow-hidden p-0 bg-background/80 backdrop-blur-sm"
          showCloseButton={false}
        >
          <Stepper value={currentStep} onValueChange={setCurrentStep}>
            <StepperNav className="flex gap-1.5 px-6 pt-5">
              {STEPS.map((meta) => (
                <StepperItem key={meta.id} step={meta.step} className="flex-1 overflow-hidden">
                  <StepperTrigger className="w-full" asChild>
                    <StepperIndicator
                      className={cn(
                        "h-1 w-full rounded-full! bg-muted",
                        `transition-colors duration-400 ${EASE_OUT}`,
                        "data-[state=active]:bg-foreground data-[state=completed]:bg-foreground",
                      )}
                    >
                      <span className="sr-only">{meta.eyebrow}</span>
                    </StepperIndicator>
                  </StepperTrigger>
                </StepperItem>
              ))}
            </StepperNav>

            <StepperPanel className={cn("px-6 pt-5 pb-5", PANEL_MIN_HEIGHT)}>
              {STEPS.map((meta) => (
                <StepperContent
                  key={meta.id}
                  value={meta.step}
                  className={cn("flex flex-col gap-5", ENTER_TRANSITION)}
                >
                  <StepHeader meta={meta} />
                  {meta.id === "preferences" ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void form.handleSubmit();
                      }}
                      className="flex flex-col gap-4"
                    >
                      <form.Field
                        name="username"
                        asyncDebounceMs={1000}
                        validators={{
                          onChangeAsync: async ({ value }) => {
                            if (value.length < MIN_USERNAME || value.length > MAX_USERNAME) return;
                            if (value === sessionUsername) return;
                            const { data, error } = await authClient.isUsernameAvailable({
                              username: value,
                            });
                            if (data?.available === false) return "Username is already taken";
                            if (error) return error.message;
                          },
                          onBlur: z
                            .string()
                            .min(
                              MIN_USERNAME,
                              `Username must be at least ${MIN_USERNAME} characters`,
                            )
                            .max(
                              MAX_USERNAME,
                              `Username must be less than ${MAX_USERNAME} characters`,
                            ),
                        }}
                      >
                        {(field) => (
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor={field.name}>Username</Label>
                            <Input
                              id={field.name}
                              name={field.name}
                              type="text"
                              autoComplete="username"
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                              placeholder="Enter your username"
                              maxLength={MAX_USERNAME}
                            />
                            <FieldErrors errors={field.state.meta.errors} />
                          </div>
                        )}
                      </form.Field>

                      <form.Field name="currency">
                        {(field) => (
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={field.name}>Currency</Label>
                            <CurrencySelect
                              id={field.name}
                              value={field.state.value}
                              onValueChange={field.handleChange}
                              onBlur={field.handleBlur}
                              invalid={!field.state.meta.isValid}
                            />
                            <FieldErrors errors={field.state.meta.errors} />
                          </div>
                        )}
                      </form.Field>

                      <form.Field name="dateFormat">
                        {(field) => (
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-col gap-1">
                              <Label htmlFor={field.name}>Date format</Label>
                              <span className="text-xs text-muted-foreground">
                                e.g. {formatDateOnlyForDisplay(new Date(), field.state.value)}
                              </span>
                            </div>
                            <ToggleGroup
                              id={field.name}
                              variant="outline"
                              spacing={1}
                              value={[field.state.value]}
                              onValueChange={(next) => {
                                const [value] = next;
                                if (value) field.handleChange(value as DateFormat);
                              }}
                              className="flex-wrap"
                            >
                              {DATE_FORMATS.map((option) => (
                                <ToggleGroupItem key={option} value={option}>
                                  {option}
                                </ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                            <FieldErrors errors={field.state.meta.errors} />
                          </div>
                        )}
                      </form.Field>
                    </form>
                  ) : null}
                  {meta.id === "sync" ? <SyncFields onSelect={handleSelectSync} /> : null}
                </StepperContent>
              ))}
            </StepperPanel>

            <form.Subscribe
              selector={(state) => ({
                isSubmitting: state.isSubmitting,
                canSubmit: state.canSubmit,
              })}
            >
              {({ isSubmitting, canSubmit }) => (
                <StepFooter
                  isFirst={isFirst}
                  isLast={isLast}
                  isSaving={isSubmitting}
                  canContinue={currentMeta.id !== "preferences" || canSubmit}
                  onBack={handleBack}
                  onContinue={handleContinue}
                  onSkip={handleSkip}
                />
              )}
            </form.Subscribe>
          </Stepper>
        </DialogContent>
      </Dialog>
      <SyncActionSheet syncType={syncSheetType} onSyncTypeChange={setSyncSheetType} />
    </>
  );
}

type FieldError =
  | string
  | {
      readonly message?: string;
    }
  | null
  | undefined;

type FieldErrorsProps = {
  readonly errors: readonly FieldError[];
};

function FieldErrors({ errors }: FieldErrorsProps) {
  if (errors.length === 0) return null;
  return (
    <>
      {errors.map((error) => {
        const message = typeof error === "string" ? error : error?.message;
        if (!message) return null;
        return (
          <p key={message} className="text-xs text-destructive">
            {message}
          </p>
        );
      })}
    </>
  );
}

type StepHeaderProps = {
  readonly meta: StepMeta;
};

function StepHeader({ meta }: StepHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-xs font-medium text-muted-foreground font-orbitron lowercase">
        {meta.eyebrow}
      </div>
      <DialogTitle className="tracking-tight text-xl leading-tight font-medium">
        {meta.title}
      </DialogTitle>
      <DialogDescription>{meta.description}</DialogDescription>
    </div>
  );
}

type SyncFieldsProps = {
  readonly onSelect: (type: LaunchableSyncType) => void;
};

type SyncOption = {
  readonly id: LaunchableSyncType;
  readonly icon: typeof LibraryIcon;
  readonly title: string;
  readonly description: string;
};

const SYNC_OPTIONS: readonly SyncOption[] = [
  {
    id: "collection",
    icon: LibraryIcon,
    title: "Sync collection",
    description: "Add to your collection using MyFigureCollection Item IDs/links.",
  },
  {
    id: "order",
    icon: PackageIcon,
    title: "Sync order",
    description: "Create an order using MyFigureCollection Item IDs/links.",
  },
  {
    id: "csv",
    icon: FileUploadIcon,
    title: "Sync CSV",
    description: "Use your MyFigureCollection CSV export to import your items.",
  },
];

const CARD_STAGGER_MS = 50;

function SyncFields({ onSelect }: SyncFieldsProps) {
  return (
    <div className="flex flex-col gap-2">
      {SYNC_OPTIONS.map((option, index) => (
        <SyncOptionCard
          key={option.id}
          option={option}
          delayMs={index * CARD_STAGGER_MS}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

type SyncOptionCardProps = {
  readonly option: SyncOption;
  readonly delayMs: number;
  readonly onSelect: (type: LaunchableSyncType) => void;
};

function SyncOptionCard({ option, delayMs, onSelect }: SyncOptionCardProps) {
  return (
    <Button
      variant="outline"
      onClick={() => onSelect(option.id)}
      style={{ "--data-in-delay": `${delayMs}ms` } as CSSProperties}
      className={cn(
        "group relative h-auto justify-start gap-3.5 whitespace-normal px-4 py-3 text-left",
        "transition-[transform] duration-100",
        EASE_OUT,
        "active:scale-[0.98]",
        "animate-data-in",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center text-foreground">
        <HugeiconsIcon icon={option.icon} strokeWidth={2} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-none">{option.title}</span>
        <span className="text-xs text-muted-foreground">{option.description}</span>
      </span>
      <HugeiconsIcon
        icon={ArrowRight02Icon}
        strokeWidth={2}
        className={cn(
          "size-4 shrink-0 text-muted-foreground",
          "transition-[transform,color] duration-200",
          EASE_OUT,
          "group-hover:translate-x-0.5 group-hover:text-foreground",
        )}
      />
    </Button>
  );
}

type StepFooterProps = {
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly isSaving: boolean;
  readonly canContinue: boolean;
  readonly onBack: () => void;
  readonly onContinue: () => void;
  readonly onSkip: () => void;
};

function StepFooter({
  isFirst,
  isLast,
  isSaving,
  canContinue,
  onBack,
  onContinue,
  onSkip,
}: StepFooterProps) {
  const getContinueIcon = () => {
    if (isSaving) return Loading03Icon;
    if (isLast) return Tick02Icon;
    return ArrowRight01Icon;
  };
  const continueIcon = getContinueIcon();
  const skipLabel = "Close";

  return (
    <div className="flex items-center justify-between gap-2 border-t bg-background px-4 py-3">
      <Button variant="ghost" size="sm" onClick={onSkip} disabled={isSaving}>
        {skipLabel}
      </Button>
      <div className="flex items-center gap-2">
        {!isFirst && (
          <Button variant="outline" size="sm" onClick={onBack} disabled={isSaving}>
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            Back
          </Button>
        )}
        <Button size="sm" onClick={onContinue} disabled={isSaving || !canContinue}>
          {isLast ? "Get started" : "Continue"}
          <HugeiconsIcon
            icon={continueIcon}
            strokeWidth={2}
            className={cn(isSaving && "animate-spin")}
          />
        </Button>
      </div>
    </div>
  );
}

export { OnboardingDialog };
