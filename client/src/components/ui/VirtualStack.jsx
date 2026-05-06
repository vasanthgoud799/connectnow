import React, { forwardRef, useImperativeHandle, useRef } from "react";

import { useVirtualizedList } from "@/hooks/useVirtualizedList";

const VirtualStack = forwardRef(function VirtualStack(
  {
    className = "",
    contentClassName = "",
    estimateSize,
    getItemKey,
    items = [],
    overscan = 6,
    renderItem,
  },
  ref
) {
  const containerRef = useRef(null);
  const { measureElement, scrollToIndex, totalSize, virtualItems } = useVirtualizedList({
    items,
    estimateSize,
    containerRef,
    overscan,
  });

  useImperativeHandle(
    ref,
    () => ({
      container: containerRef.current,
      scrollToBottom: (behavior = "smooth") => {
        containerRef.current?.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior,
        });
      },
      scrollToIndex,
    }),
    [scrollToIndex]
  );

  return (
    <div ref={containerRef} className={className}>
      <div className={`relative w-full ${contentClassName}`} style={{ height: totalSize }}>
        {virtualItems.map((virtualItem) => (
          <div
            key={getItemKey(virtualItem.item, virtualItem.index)}
            ref={(element) => measureElement(virtualItem.index, element)}
            style={{
              left: 0,
              position: "absolute",
              right: 0,
              top: 0,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(virtualItem.item, virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
});

export default VirtualStack;
