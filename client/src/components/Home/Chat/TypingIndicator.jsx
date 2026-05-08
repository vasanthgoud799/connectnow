function TypingIndicator({ label }) {
  if (!label) return null;

  return (
    <div className="pointer-events-none shrink-0 px-4 pb-3 pt-1 md:px-7">
      <div className="mx-auto max-w-5xl">
        <div className="inline-flex rounded-full border border-cyan-300/15 bg-cyan-400/8 px-3 py-1.5 text-xs font-medium text-cyan-100 shadow-[0_10px_30px_rgba(14,165,233,0.08)]">
          {label}
        </div>
      </div>
    </div>
  );
}

export default TypingIndicator;
