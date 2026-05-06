import React from "react";

function RouteLoader({ message = "Loading..." }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center px-4 py-10">
      <div className="themed-page-card max-w-md rounded-[28px] px-6 py-6 text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-pulse rounded-2xl bg-gradient-to-br from-[#f97316] via-[#fb7185] to-[#38bdf8]" />
        <p className="themed-title font-['Space_Grotesk'] text-xl font-semibold">
          {message}
        </p>
      </div>
    </div>
  );
}

export default RouteLoader;
