import { Wifi, WifiLow, WifiOff } from "lucide-react";

const iconMap = {
  excellent: Wifi,
  good: Wifi,
  fair: WifiLow,
  poor: WifiOff,
  unknown: WifiLow,
};

const ConnectionQualityIndicator = ({ quality }) => {
  const Icon = iconMap[quality?.key] || WifiLow;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium ring-1 ${quality?.ringClassName || "ring-white/10 bg-white/5"} ${quality?.textClassName || "text-slate-200"}`}
      title={
        quality?.roundTripTimeMs != null
          ? `Connection quality ${quality.label}. RTT ${quality.roundTripTimeMs} ms`
          : `Connection quality ${quality?.label || "Checking"}`
      }
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{quality?.label || "Checking"}</span>
    </div>
  );
};

export default ConnectionQualityIndicator;
