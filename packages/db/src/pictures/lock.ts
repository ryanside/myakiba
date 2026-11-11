/**
 * The advisory lock a save and pictures:reconcile both take on one stored picture, by its key.
 * Reconcile deletes only while it holds it, and a save holds it from checking that the object is
 * there until its Item commits, so no Item ever commits showing a deleted object.
 */
export const pictureLock = (key: string): string => `picture:${key}`;
