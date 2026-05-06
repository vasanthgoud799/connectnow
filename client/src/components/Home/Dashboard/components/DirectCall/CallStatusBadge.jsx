const toneMap = {
  default: "border-white/10 bg-white/8 text-slate-200",
  success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  danger: "border-rose-400/20 bg-rose-400/10 text-rose-100",
  info: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
};

const CallStatusBadge = ({ label, tone = "default", className = "" }) => (
  <span
    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium tracking-[0.18em] uppercase ${toneMap[tone] || toneMap.default} ${className}`}
  >
    <span className="h-2 w-2 rounded-full bg-current opacity-80" />
    {label}
  </span>
);

export default CallStatusBadge;
