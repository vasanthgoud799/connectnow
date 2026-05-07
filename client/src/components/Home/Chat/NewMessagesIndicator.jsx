function NewMessagesIndicator({ isAtBottom, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="jump-to-latest-button rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_18px_40px_rgba(34,211,238,0.24)]"
    >
      {isAtBottom ? "New messages" : "Jump to latest"}
    </button>
  );
}

export default NewMessagesIndicator;
