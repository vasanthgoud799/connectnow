function MessageComposer({ composerRef, isMobile = false, children }) {
  return (
    <div
      ref={composerRef}
      className={`chat-composer-shell ${
        isMobile ? "z-20 px-3 pt-3" : "px-7 py-5"
      }`}
    >
      <div
        className={`relative mx-auto flex w-full max-w-5xl items-center ${
          isMobile ? "min-h-[56px] gap-2" : "gap-3"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default MessageComposer;
