import React from "react";

function RouteLoader({ message = "Loading..." }) {
  return (
    <div className="flex h-full min-h-[240px] w-full items-center justify-center px-4 py-8">
      <div className="themed-page-card w-full max-w-lg rounded-[28px] px-6 py-6 text-center shadow-[0_24px_60px_rgba(2,8,23,0.16)]">
        <div className="mx-auto mb-4 h-12 w-12 animate-pulse rounded-2xl bg-gradient-to-br from-[#f97316] via-[#fb7185] to-[#38bdf8]" />
        <p className="themed-title font-['Space_Grotesk'] text-xl font-semibold">
          {message}
        </p>
        <p className="themed-subtitle mt-2 text-sm">
          Preparing this space so everything stays smooth and responsive.
        </p>
        <div className="mt-5 space-y-3">
          <div className="h-3 rounded-full bg-white/8" />
          <div className="mx-auto h-3 w-5/6 rounded-full bg-white/6" />
          <div className="mx-auto h-3 w-2/3 rounded-full bg-white/5" />
        </div>
      </div>
    </div>
  );
}

export default RouteLoader;
