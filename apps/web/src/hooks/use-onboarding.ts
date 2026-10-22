import { useCallback, useMemo } from "react";
import * as z from "zod";
import { useLocalStorage } from "@/hooks/use-local-storage";

const STORAGE_KEY = "myakiba:onboarding-v2";

const storedOnboardingStateSchema = z.object({
  step: z.number().finite().optional(),
  completed: z.boolean().optional(),
});

type StoredOnboardingState = z.infer<typeof storedOnboardingStateSchema>;

type OnboardingState = {
  readonly step: number;
  readonly completed: boolean;
};

const INITIAL_STATE: StoredOnboardingState = {
  step: 0,
  completed: false,
};

function normalize(raw: StoredOnboardingState, totalSteps: number): OnboardingState {
  const lastStepIndex = Math.max(totalSteps - 1, 0);
  const rawStep = Math.trunc(raw.step ?? 0);
  const step = Math.min(Math.max(rawStep, 0), lastStepIndex);
  // Migration: earlier versions encoded completion as `step > lastStepIndex`
  // (past-the-end sentinel) without a dedicated flag.
  const completed = raw.completed ?? rawStep > lastStepIndex;
  return { step, completed };
}

type UseOnboardingOptions = {
  readonly totalSteps: number;
};

type UseOnboardingReturn = {
  readonly step: number;
  readonly isCompleted: boolean;
  readonly setStep: (step: number) => void;
  readonly complete: () => void;
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
      setState((previous) => ({ ...previous, step }));
    },
    [setState],
  );

  const complete = useCallback(() => {
    setState((previous) => ({ ...previous, completed: true }));
  }, [setState]);

  return {
    step: state.step,
    isCompleted: state.completed,
    setStep,
    complete,
  } as const;
}

export { useOnboarding };
