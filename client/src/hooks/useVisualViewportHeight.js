import { useEffect } from "react";

const setViewportVars = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const visualViewport = window.visualViewport;
  const rawViewportHeight = Math.max(
    240,
    Math.round(visualViewport?.height || window.innerHeight || 0)
  );
  const rawViewportWidth = Math.max(
    240,
    Math.round(visualViewport?.width || window.innerWidth || 0)
  );
  const viewportOffsetTop = Math.max(
    0,
    Math.round(visualViewport?.offsetTop || 0)
  );
  const viewportOffsetLeft = Math.max(
    0,
    Math.round(visualViewport?.offsetLeft || 0)
  );
  const layoutHeight = Math.max(
    240,
    Math.round(window.innerHeight || rawViewportHeight)
  );
  const visibleBottom = Math.max(
    240,
    Math.min(layoutHeight, rawViewportHeight + viewportOffsetTop)
  );
  const keyboardOffset = Math.max(0, layoutHeight - visibleBottom);

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
      [60, 160, 320, 520].forEach((delay) => {
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
      visualViewport?.removeEventListener("resize", updateDuringViewportAnimation);
      visualViewport?.removeEventListener("scroll", updateDuringViewportAnimation);
    };
  }, []);
}
