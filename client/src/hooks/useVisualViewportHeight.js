import { useEffect } from "react";

const isEditableElement = (element) =>
  element instanceof HTMLElement &&
  ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);

const setViewportVars = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const visualViewport = window.visualViewport;
  const activeElement = document.activeElement;
  const measuredVisualHeight = Math.round(
    visualViewport?.height || window.innerHeight || 0
  );
  const measuredVisualWidth = Math.round(
    visualViewport?.width || window.innerWidth || 0
  );
  const layoutHeight = Math.max(
    240,
    Math.round(window.innerHeight || measuredVisualHeight)
  );
  const layoutWidth = Math.max(
    240,
    Math.round(window.innerWidth || measuredVisualWidth)
  );
  const isKeyboardLikelyOpen =
    isEditableElement(activeElement) && visualViewport
      ? measuredVisualHeight < layoutHeight - 80
      : false;
  const viewportOffsetTop = Math.max(
    0,
    Math.round(isKeyboardLikelyOpen ? visualViewport?.offsetTop || 0 : 0)
  );
  const viewportOffsetLeft = Math.max(
    0,
    Math.round(isKeyboardLikelyOpen ? visualViewport?.offsetLeft || 0 : 0)
  );
  const visibleBottom = Math.max(
    240,
    Math.min(layoutHeight, measuredVisualHeight + viewportOffsetTop)
  );
  const rawViewportHeight = Math.max(
    240,
    isKeyboardLikelyOpen ? visibleBottom : layoutHeight
  );
  const rawViewportWidth = Math.max(
    240,
    isKeyboardLikelyOpen ? measuredVisualWidth : layoutWidth
  );
  const keyboardOffset = isKeyboardLikelyOpen
    ? Math.max(0, layoutHeight - visibleBottom)
    : 0;

  document.documentElement.style.setProperty(
    "--app-viewport-height",
    `${rawViewportHeight}px`
  );
  document.documentElement.style.setProperty(
    "--app-layout-height",
    `${layoutHeight}px`
  );
  document.documentElement.style.setProperty(
    "--app-viewport-width",
    `${rawViewportWidth}px`
  );
  document.documentElement.style.setProperty(
    "--app-viewport-offset-top",
    `${viewportOffsetTop}px`
  );
  document.documentElement.style.setProperty(
    "--app-viewport-offset-left",
    `${viewportOffsetLeft}px`
  );
  document.documentElement.style.setProperty(
    "--app-keyboard-offset",
    `${keyboardOffset}px`
  );
};

export function useVisualViewportHeight() {
  useEffect(() => {
    let frameId = 0;
    const timeoutIds = new Set();
    const update = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        setViewportVars();
      });
    };
    const updateDuringViewportAnimation = () => {
      update();
      [150, 350, 700, 1000].forEach((delay) => {
        const timeoutId = window.setTimeout(() => {
          timeoutIds.delete(timeoutId);
          update();
        }, delay);
        timeoutIds.add(timeoutId);
      });
    };

    const visualViewport = window.visualViewport;
    update();

    window.addEventListener("resize", updateDuringViewportAnimation);
    window.addEventListener("orientationchange", updateDuringViewportAnimation);
    window.addEventListener("focusin", updateDuringViewportAnimation);
    window.addEventListener("focusout", updateDuringViewportAnimation);
    window.addEventListener("blur", updateDuringViewportAnimation);
    window.addEventListener("pageshow", updateDuringViewportAnimation);
    visualViewport?.addEventListener("resize", updateDuringViewportAnimation);
    visualViewport?.addEventListener("scroll", updateDuringViewportAnimation);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIds.clear();

      window.removeEventListener("resize", updateDuringViewportAnimation);
      window.removeEventListener("orientationchange", updateDuringViewportAnimation);
      window.removeEventListener("focusin", updateDuringViewportAnimation);
      window.removeEventListener("focusout", updateDuringViewportAnimation);
      window.removeEventListener("blur", updateDuringViewportAnimation);
      window.removeEventListener("pageshow", updateDuringViewportAnimation);
      visualViewport?.removeEventListener("resize", updateDuringViewportAnimation);
      visualViewport?.removeEventListener("scroll", updateDuringViewportAnimation);
    };
  }, []);
}
