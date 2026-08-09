export type BringListMode = "signup" | "open";

/** Default guest-facing blurb for each kind of list. */
export const OPEN_LIST_MESSAGE = "Bringing something? Pick an item from the list or add what you're planning to bring, and feel free to leave a comment.";
export const FIXED_SLOT_MESSAGE = "Bringing something? Grab an item before it's gone from the selection, and feel free to leave a comment.";

/**
 * The blurb to show after a mode switch.
 *
 * A host who wrote their own message keeps it; one still on our wording gets the
 * wording for the mode they just picked.
 */
export function messageForMode(current: string, mode: BringListMode): string {
  if (current !== OPEN_LIST_MESSAGE && current !== FIXED_SLOT_MESSAGE) return current;
  return mode === "open" ? OPEN_LIST_MESSAGE : FIXED_SLOT_MESSAGE;
}
