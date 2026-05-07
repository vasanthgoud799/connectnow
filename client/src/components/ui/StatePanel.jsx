function StatePanel({
  title,
  description,
  icon: Icon,
  className = "",
  dashed = false,
  center = true,
  children,
}) {
  return (
    <div
      className={`themed-page-card ${dashed ? "border-dashed" : ""} ${center ? "flex flex-col items-center justify-center text-center" : ""} rounded-[24px] px-5 py-6 ${className}`}
    >
      {Icon ? <Icon className="mb-3 h-9 w-9 text-slate-400" /> : null}
      {title ? <p className="themed-title text-base font-semibold">{title}</p> : null}
      {description ? <p className="themed-subtitle mt-2 text-sm leading-6">{description}</p> : null}
      {children ? <div className={title || description ? "mt-4 w-full" : "w-full"}>{children}</div> : null}
    </div>
  );
}

export default StatePanel;
