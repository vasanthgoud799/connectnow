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

  document.documentElement.style.setProperty(
    "--app-viewport-height",
    `${viewportHeight}px`
  );
  document.documentElement.style.setProperty(
    "--app-layout-height",
    `${layoutHeight}px`
  );
  document.documentElement.style.setProperty("--app-keyboard-offset", "0px");
};

export function useVisualViewportHeight() {
  useEffect(() => {
    let frameId = 0;
    const update = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        setViewportVars();
      });
    };

    const visualViewport = window.visualViewport;
    update();

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
    };
  }, []);
}
