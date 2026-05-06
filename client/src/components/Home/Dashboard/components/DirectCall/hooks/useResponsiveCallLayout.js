import { useEffect, useMemo, useState } from "react";

const readViewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

export const useResponsiveCallLayout = () => {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    const handleResize = () => {
      setViewport(readViewport());
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  return useMemo(() => {
    const isMobile = viewport.width <= 768;
    const isTablet = viewport.width > 768 && viewport.width < 1200;
    const isLandscape = viewport.width > viewport.height;

    return {
      ...viewport,
      isMobile,
      isTablet,
      isLandscape,
      controlInsetClass: isMobile ? "pb-[calc(env(safe-area-inset-bottom,0px)+18px)]" : "pb-8",
    };
  }, [viewport]);
};

export default useResponsiveCallLayout;
