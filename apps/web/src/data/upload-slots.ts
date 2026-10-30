const MAX_UPLOADS_IN_FLIGHT = 2;

function uploadSlots(size: number) {
  let free = size;
  const waiting: (() => void)[] = [];
  return {
    take: async (): Promise<void> => {
      if (free > 0) {
        free -= 1;
        return;
      }
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    },
    give: (): void => {
      const wake = waiting.shift();
      if (wake === undefined) free += 1;
      else wake();
    },
  };
}

/** Every upload of an item page from this tab, from Item Refresh and pick saves alike. */
export const tabUploadSlots = uploadSlots(MAX_UPLOADS_IN_FLIGHT);

export async function inUploadSlot<Value>(upload: () => Promise<Value>): Promise<Value> {
  await tabUploadSlots.take();
  try {
    return await upload();
  } finally {
    tabUploadSlots.give();
  }
}
