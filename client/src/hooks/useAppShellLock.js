import { useEffect } from "react";

const findScrollableAncestor = (target) => {
  if (!(target instanceof Element)) return null;

  let node = target;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const canScrollY =
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 1;

    if (canScrollY) {
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
    let startY = 0;

    html.classList.add("app-shell-html");
    body.classList.add("app-shell-body");

    const handleTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
    };

    const handleTouchMove = (event) => {
      if (event.touches.length !== 1) return;

      const scrollable = findScrollableAncestor(event.target);
      if (!scrollable) {
        event.preventDefault();
        return;
      }

      const deltaY = startY - event.touches[0].clientY;
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
