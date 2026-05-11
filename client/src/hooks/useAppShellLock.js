import { useEffect } from "react";

const findScrollableAncestor = (target, axis = "y") => {
  if (!(target instanceof Element)) return null;

  let node = target;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const canScroll =
      axis === "x"
        ? /(auto|scroll|overlay)/.test(style.overflowX) &&
          node.scrollWidth > node.clientWidth + 1
        : /(auto|scroll|overlay)/.test(style.overflowY) &&
          node.scrollHeight > node.clientHeight + 1;

    if (canScroll) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
};

export function useAppShellLock() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    let startX = 0;
    let startY = 0;

    html.classList.add("app-shell-html");
    body.classList.add("app-shell-body");

    const handleTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };

    const handleTouchMove = (event) => {
      if (event.touches.length !== 1) return;

      const deltaX = startX - event.touches[0].clientX;
      const deltaY = startY - event.touches[0].clientY;
      const axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      const scrollable = findScrollableAncestor(event.target, axis);
      if (!scrollable) {
        event.preventDefault();
        return;
      }

      if (axis === "x") {
        const atLeft = scrollable.scrollLeft <= 0;
        const atRight =
          Math.ceil(scrollable.scrollLeft + scrollable.clientWidth) >=
          scrollable.scrollWidth;

        if ((deltaX < 0 && atLeft) || (deltaX > 0 && atRight)) {
          event.preventDefault();
        }
        return;
      }

      const atTop = scrollable.scrollTop <= 0;
      const atBottom =
        Math.ceil(scrollable.scrollTop + scrollable.clientHeight) >=
        scrollable.scrollHeight;
      if ((deltaY < 0 && atTop) || (deltaY > 0 && atBottom)) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      body.classList.remove("app-shell-body");
      html.classList.remove("app-shell-html");
    };
  }, []);
}
