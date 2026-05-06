import { useMemo } from "react";

const QUALITY_MAP = {
  excellent: {
    label: "Excellent",
    textClassName: "text-emerald-200",
    dotClassName: "bg-emerald-400",
    ringClassName: "ring-emerald-400/30 bg-emerald-400/10",
  },
  good: {
    label: "Good",
    textClassName: "text-cyan-200",
    dotClassName: "bg-cyan-300",
    ringClassName: "ring-cyan-300/30 bg-cyan-400/10",
  },
  fair: {
    label: "Fair",
    textClassName: "text-amber-200",
    dotClassName: "bg-amber-300",
    ringClassName: "ring-amber-400/30 bg-amber-400/10",
  },
  poor: {
    label: "Poor",
    textClassName: "text-rose-200",
    dotClassName: "bg-rose-300",
    ringClassName: "ring-rose-400/30 bg-rose-400/10",
  },
  unknown: {
    label: "Checking",
    textClassName: "text-slate-200",
    dotClassName: "bg-slate-400",
    ringClassName: "ring-white/15 bg-white/5",
  },
};

export const useConnectionQuality = (diagnostics) =>
  useMemo(() => {
    const qualityKey =
      diagnostics?.connectionState === "connected" &&
      diagnostics?.currentRoundTripTimeMs != null &&
      diagnostics?.currentRoundTripTimeMs < 120 &&
      diagnostics?.packetsLostRatio != null &&
      diagnostics?.packetsLostRatio < 0.01
        ? "excellent"
        : diagnostics?.connectionQuality || "unknown";

    return {
      key: qualityKey,
      ...(QUALITY_MAP[qualityKey] || QUALITY_MAP.unknown),
      roundTripTimeMs: diagnostics?.currentRoundTripTimeMs,
    };
  }, [diagnostics]);

export default useConnectionQuality;
