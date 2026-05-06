import { useEffect } from "react";

const setViewportVars = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const visualViewport = window.visualViewport;
  const viewportHeight = Math.max(
    320,
    Math.round(visualViewport?.height || window.innerHeight || 0)
  );
  const layoutHeight = Math.max(320, Math.round(window.innerHeight || viewportHeight));
  const viewportOffsetTop = Math.max(0, Math.round(visualViewport?.offsetTop || 0));
  const keyboardOffset = Math.max(
    0,
    layoutHeight - viewportHeight - viewportOffsetTop
  );

  document.documentElement.style.setProperty(
    "--app-viewport-height",
    `${viewportHeight}px`
  );
  document.documentElement.style.setProperty(
    "--app-layout-height",
    `${layoutHeight}px`
  );
  document.documentElement.style.setProperty(
    "--app-keyboard-offset",
    `${keyboardOffset}px`
  );
};

export function useVisualViewportHeight() {
  useEffect(() => {
    setViewportVars();

    const visualViewport = window.visualViewport;
    const update = () => window.requestAnimationFrame(setViewportVars);

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
    };
  }, []);
}

