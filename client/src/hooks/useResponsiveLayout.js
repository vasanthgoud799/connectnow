import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

export const useResponsiveLayout = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT : false
  );

  useEffect(() => {
    const updateLayout = () => {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  return {
    isMobile,
  };
};
