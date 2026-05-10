import { useLayoutEffect } from "react";

export const isMobileViewport = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(max-width: 768px)")?.matches ||
    window.innerWidth <= 768
  );
};

const isTextInputElement = (element) =>
  element instanceof HTMLElement &&
  ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);

export const blurActiveTextInputOnMobile = () => {
  if (typeof document === "undefined" || !isMobileViewport()) return;

  const activeElement = document.activeElement;
  if (isTextInputElement(activeElement)) {
    activeElement.blur();
  }
};

export const useMobileFocusGuard = (enabled = true) => {
  useLayoutEffect(() => {
    if (!enabled || !isMobileViewport()) return undefined;

    blurActiveTextInputOnMobile();
    const frameId = window.requestAnimationFrame(blurActiveTextInputOnMobile);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [enabled]);
};

export default useMobileFocusGuard;
