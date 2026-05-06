import React from "react";

function MobileSafeHeader({ children, className = "" }) {
  return (
    <div className={`mobile-safe-header ${className}`}>
      <div className="mobile-safe-header-inner">{children}</div>
    </div>
  );
}

export default MobileSafeHeader;

