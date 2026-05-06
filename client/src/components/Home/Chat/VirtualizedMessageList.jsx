import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import moment from "moment";

import VirtualStack from "@/components/ui/VirtualStack";

const DATE_ROW_HEIGHT = 40;
const MESSAGE_ROW_HEIGHT_DESKTOP = 156;
const MESSAGE_ROW_HEIGHT_MOBILE = 176;

const VirtualizedMessageList = forwardRef(function VirtualizedMessageList(
  {
    isMobile = false,
    messages = [],
    renderMessageRow,
  },
  ref
) {
  const virtualRef = useRef(null);

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

  const messageIdToRowIndex = useMemo(() => {
    const nextMap = new Map();
    rows.forEach((row, index) => {
      if (row.type === "message") {
        nextMap.set(String(row.message._id || row.message.id), index);
      }
    });
    return nextMap;
  }, [rows]);

  useImperativeHandle(
    ref,
    () => ({
      container: virtualRef.current?.container || null,
      scrollToBottom: (behavior = "smooth") => {
        virtualRef.current?.scrollToBottom(behavior);
      },
      scrollToMessageId: (messageId) => {
        const rowIndex = messageIdToRowIndex.get(String(messageId));
        if (rowIndex === undefined) return;
        virtualRef.current?.scrollToIndex(rowIndex, { align: "center" });
      },
    }),
    [messageIdToRowIndex]
  );

  return (
    <VirtualStack
      ref={virtualRef}
      className={`scrollbar-hide flex-1 overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain touch-pan-y ${
        isMobile ? "px-3 py-4" : "px-7 py-8"
      }`}
      contentClassName={`w-full ${isMobile ? "max-w-full" : "mx-auto max-w-5xl"}`}
      estimateSize={(row) =>
        row.type === "date"
          ? DATE_ROW_HEIGHT
          : isMobile
            ? MESSAGE_ROW_HEIGHT_MOBILE
            : MESSAGE_ROW_HEIGHT_DESKTOP
      }
      getItemKey={(row) => row.id}
      items={rows}
      overscan={10}
      renderItem={(row) => {
        if (row.type === "date") {
          return (
            <div className="flex justify-center py-2">
              <div className="themed-date-pill rounded-full px-4 py-1.5 text-xs">
                {row.label}
              </div>
            </div>
          );
        }

        return renderMessageRow(row.message, row.index);
      }}
    />
  );
});

export default VirtualizedMessageList;
