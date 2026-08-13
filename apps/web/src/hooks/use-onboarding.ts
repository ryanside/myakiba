import { useCallback, useMemo } from "react";
import * as z from "zod";
import { useLocalStorage } from "@/hooks/use-local-storage";

const STORAGE_KEY = "myakiba:onboarding-v2";

const storedOnboardingStateSchema = z.object({
  step: z.number().finite().optional(),
  hasSeen: z.boolean().optional(),
  completed: z.boolean().optional(),
});

type StoredOnboardingState = z.infer<typeof storedOnboardingStateSchema>;

type OnboardingState = {
  readonly step: number;
  readonly hasSeen: boolean;
  readonly completed: boolean;
};

const INITIAL_STATE: StoredOnboardingState = {
  step: 0,
  hasSeen: false,
  completed: false,
};

function normalize(raw: StoredOnboardingState, totalSteps: number): OnboardingState {
  const lastStepIndex = Math.max(totalSteps - 1, 0);
  const rawStep = Math.trunc(raw.step ?? 0);
  const step = Math.min(Math.max(rawStep, 0), lastStepIndex);
  // Migration: earlier versions encoded completion as `step > lastStepIndex`
  // (past-the-end sentinel) without a dedicated flag.
  const completed = raw.completed ?? rawStep > lastStepIndex;
  return { step, hasSeen: raw.hasSeen ?? false, completed };
}

type UseOnboardingOptions = {
  readonly totalSteps: number;
};

type UseOnboardingReturn = {
  readonly step: number;
  readonly hasSeen: boolean;
  readonly isCompleted: boolean;
  readonly setStep: (step: number) => void;
  readonly complete: () => void;
  readonly dismiss: () => void;
};

function useOnboarding({ totalSteps }: UseOnboardingOptions): UseOnboardingReturn {
  const [rawState, setState] = useLocalStorage(
    STORAGE_KEY,
    INITIAL_STATE,
    storedOnboardingStateSchema,
  );
  const state = useMemo(() => normalize(rawState, totalSteps), [rawState, totalSteps]);

  const setStep = useCallback(
    (step: number) => {
      setState((previous) => ({ ...previous, step, hasSeen: true }));
    },
    [setState],
  );

  const complete = useCallback(() => {
    setState((previous) => ({ ...previous, hasSeen: true, completed: true }));
  }, [setState]);

  const dismiss = useCallback(() => {
    setState((previous) => ({ ...previous, hasSeen: true }));
  }, [setState]);

  return {
    step: state.step,
    hasSeen: state.hasSeen,
    isCompleted: state.completed,
    setStep,
    complete,
    dismiss,
  } as const;
}

export { useOnboarding };
