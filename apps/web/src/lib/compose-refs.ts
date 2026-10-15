import * as React from "react";

type PossibleRef<T> = React.Ref<T> | undefined;

function setRef<T>(ref: PossibleRef<T>, value: T) {
  if (ref !== null && ref !== undefined && "current" in ref) {
    ref.current = value;
    return;
  }

  return ref?.(value);
}

/**
 * A utility to compose multiple refs together
 * Accepts callback refs and RefObject(s)
 */
function composeRefs<T>(...refs: PossibleRef<T>[]): React.RefCallback<T> {
  return (node) => {
    const cleanups = refs.map((ref) => setRef(ref, node));

    return () => {
      for (let i = 0; i < cleanups.length; i++) {
        const cleanup = cleanups[i];
        if (cleanup === undefined) {
          setRef(refs[i], null);
        } else {
          cleanup();
        }
      }
    };
  };
}

function useComposedRefs<T>(
  firstRef: PossibleRef<T>,
  secondRef: PossibleRef<T>,
): React.RefCallback<T> {
  return React.useCallback((node) => composeRefs(firstRef, secondRef)(node), [firstRef, secondRef]);
}

export { composeRefs, useComposedRefs };
