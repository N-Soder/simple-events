import { useEffect, useState } from "react";

/**
 * Whether the primary input device is a finger rather than a mouse.
 *
 * Viewport width is a poor stand-in for this: a desktop browser in a narrow
 * window is still driven by a mouse and keyboard, while a tablet in landscape
 * is not. Controls that should defer to the platform (date and time inputs,
 * which open OS pickers on touch devices) need the pointer type, not the width.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(pointer: coarse)").matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(pointer: coarse)");
    const onChange = (e: MediaQueryListEvent) => setCoarse(e.matches);
    query.addEventListener("change", onChange);
    setCoarse(query.matches);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return coarse;
}
