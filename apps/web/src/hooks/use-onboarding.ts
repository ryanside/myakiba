import { useCallback } from "react";
import * as z from "zod";
import { useLocalStorage } from "@/hooks/use-local-storage";

const STORAGE_KEY = "myakiba:onboarding-v2";

// Earlier versions also kept the step and completion here. The account stores whether the user
// has seen onboarding now, so only the extension step's flag is read.
const storedOnboardingStateSchema = z.object({
  extensionStepOpen: z.boolean().optional(),
});

type StoredOnboardingState = z.infer<typeof storedOnboardingStateSchema>;

const INITIAL_STATE: StoredOnboardingState = {};

type UseOnboardingReturn = {
  /** Onboarding showed the extension step when the page went away, so it reopens there. */
  readonly reopenAtExtensionStep: boolean;
  readonly setExtensionStepOpen: (open: boolean) => void;
};

function useOnboarding(): UseOnboardingReturn {
  const [state, setState] = useLocalStorage(
    STORAGE_KEY,
    INITIAL_STATE,
    storedOnboardingStateSchema,
  );

  const setExtensionStepOpen = useCallback(
    (extensionStepOpen: boolean) => {
      setState((previous) =>
        (previous.extensionStepOpen ?? false) === extensionStepOpen
          ? previous
          : { ...previous, extensionStepOpen },
      );
    },
    [setState],
  );

  return {
    reopenAtExtensionStep: state.extensionStepOpen ?? false,
    setExtensionStepOpen,
  } as const;
}

export { useOnboarding };
