import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import moment from "moment";

const VirtualizedMessageList = forwardRef(function VirtualizedMessageList(
  {
    isMobile = false,
    messages = [],
    renderMessageRow,
  },
  ref
) {
  const containerRef = useRef(null);

  const rows = useMemo(() => {
    const nextRows = [];

    messages.forEach((message, index) => {
      const currentDate = moment(message.timestamp).format("YYYY-MM-DD");
      const previousDate =
        index > 0 ? moment(messages[index - 1].timestamp).format("YYYY-MM-DD") : null;

      if (currentDate !== previousDate) {
        nextRows.push({
          id: `date:${currentDate}:${index}`,
          label: moment(message.timestamp).format("LL"),
          type: "date",
        });
      }

      nextRows.push({
        id: `message:${String(message._id || message.id || index)}`,
        index,
        message,
        type: "message",
      });
    });

    return nextRows;
  }, [messages]);

  useImperativeHandle(
    ref,
    () => ({
      container: containerRef.current,
      scrollToBottom: (behavior = "smooth") => {
        const container = containerRef.current;
        if (!container) return;
        container.scrollTo({
          top: container.scrollHeight,
          behavior,
        });
      },
      scrollToMessageId: (messageId) => {
        const container = containerRef.current;
        if (!container) return false;
        const escapedMessageId =
          typeof CSS !== "undefined" && typeof CSS.escape === "function"
            ? CSS.escape(String(messageId))
            : String(messageId).replace(/"/g, '\\"');
        const target = container.querySelector(`[data-message-id="${escapedMessageId}"]`);
        if (!target) return false;
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        return true;
      },
    }),
    []
  );

  return (
    <div
      ref={containerRef}
      className={`chat-message-scroll scrollbar-hide flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-none touch-pan-y ${
        isMobile ? "px-3 py-3 pb-5" : "px-7 py-8 pb-10"
      }`}
    >
      <div className={`w-full ${isMobile ? "max-w-full" : "mx-auto max-w-5xl"}`}>
        {rows.map((row) => {
          if (row.type === "date") {
            return (
              <div key={row.id} className="flex justify-center py-2">
                <div className="themed-date-pill rounded-full px-4 py-1.5 text-xs">
                  {row.label}
                </div>
              </div>
            );
          }

          return (
            <div key={row.id}>
              {renderMessageRow(row.message, row.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default VirtualizedMessageList;
