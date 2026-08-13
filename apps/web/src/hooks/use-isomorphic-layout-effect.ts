import * as React from "react";

const useIsomorphicLayoutEffect =
  globalThis.window === undefined ? React.useEffect : React.useLayoutEffect;

export { useIsomorphicLayoutEffect };
