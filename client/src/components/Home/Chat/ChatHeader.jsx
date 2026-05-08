import { ArrowLeft } from "lucide-react";

function ChatHeader({
  isMobile = false,
  onBack,
  avatarSrc,
  title,
  status,
  onOpenDetail,
  onPreviewAvatar,
  birthdayChip,
  desktopActions,
  mobileActions,
  warningBanner,
  decryptingBanner,
  disappearingLabel,
}) {
  return (
    <>
      <div
        className={`mobile-safe-header relative ${
          isMobile ? "" : "h-[88px]"
        }`}
      >
        <div
          className={`mobile-safe-header-inner justify-between ${
            isMobile ? "min-h-[56px] gap-3" : "h-full"
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            {isMobile && (
              <button
                type="button"
                onClick={onBack}
                className="themed-panel-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onOpenDetail}
              className="shrink-0"
              title="Open contact info"
            >
              <img
                src={avatarSrc}
                alt="Profile"
                className={`${isMobile ? "h-11 w-11" : "h-12 w-12"} themed-glow-avatar rounded-full object-cover`}
                onClick={(event) => {
                  event.stopPropagation();
                  onPreviewAvatar?.();
                }}
              />
            </button>
            <div
              role="button"
              tabIndex={0}
              onClick={onOpenDetail}
              className="min-w-0 flex-1 text-left"
              title="Open contact info"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenDetail?.();
                }
              }}
            >
              <p
                className={`truncate font-['Space_Grotesk'] font-semibold tracking-[-0.02em] ${
                  isMobile ? "text-[1.05rem] leading-5" : "text-[1.35rem]"
                }`}
              >
                {title}
              </p>
              <p
                className={`truncate ${
                  isMobile ? "pt-0.5 text-xs leading-4" : "text-sm"
                } ${status?.className || "text-slate-500"}`}
              >
                {status?.label || ""}
              </p>
              {disappearingLabel ? (
                <p className="truncate pt-0.5 text-[11px] font-medium text-cyan-200">
                  {disappearingLabel}
                </p>
              ) : null}
              {!isMobile && birthdayChip ? <div className="mt-2">{birthdayChip}</div> : null}
            </div>
          </div>

          <div
            className={`flex shrink-0 items-center text-slate-400 ${
              isMobile ? "gap-2" : "gap-3"
            }`}
          >
            {isMobile ? mobileActions : desktopActions}
          </div>
        </div>
      </div>
      {warningBanner}
      {decryptingBanner}
    </>
  );
}

export default ChatHeader;
