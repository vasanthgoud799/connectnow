import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_OVERSCAN = 6;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const useVirtualizedList = ({
  items = [],
  estimateSize,
  containerRef,
  overscan = DEFAULT_OVERSCAN,
}) => {
  const sizeMapRef = useRef(new Map());
  const [scrollState, setScrollState] = useState({
    scrollTop: 0,
    viewportHeight: 0,
  });

  useEffect(() => {
    const element = containerRef?.current;
    if (!element) return undefined;

    const update = () => {
      setScrollState({
        scrollTop: element.scrollTop,
        viewportHeight: element.clientHeight,
      });
    };

    update();
    element.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [containerRef]);

  const measurements = useMemo(() => {
    const nextMeasurements = [];
    let offset = 0;

    items.forEach((item, index) => {
      const measuredSize = sizeMapRef.current.get(index);
      const size = measuredSize || estimateSize(item, index);
      nextMeasurements.push({ index, start: offset, size, end: offset + size });
      offset += size;
    });

    return {
      totalSize: offset,
      items: nextMeasurements,
    };
  }, [estimateSize, items]);

  const { totalSize, items: measurementItems } = measurements;

  const { startIndex, endIndex } = useMemo(() => {
    if (!measurementItems.length) {
      return { startIndex: 0, endIndex: 0 };
    }

    const rangeStart = Math.max(0, scrollState.scrollTop);
    const rangeEnd = rangeStart + scrollState.viewportHeight;

    let nextStart = 0;
    while (
      nextStart < measurementItems.length &&
      measurementItems[nextStart].end < rangeStart
    ) {
      nextStart += 1;
    }

    let nextEnd = nextStart;
    while (
      nextEnd < measurementItems.length &&
      measurementItems[nextEnd].start <= rangeEnd
    ) {
      nextEnd += 1;
    }

    return {
      startIndex: clamp(nextStart - overscan, 0, Math.max(measurementItems.length - 1, 0)),
      endIndex: clamp(nextEnd + overscan, 0, measurementItems.length),
    };
  }, [measurementItems, overscan, scrollState.scrollTop, scrollState.viewportHeight]);

  const virtualItems = useMemo(
    () =>
      measurementItems.slice(startIndex, endIndex).map((measurement) => ({
        ...measurement,
        item: items[measurement.index],
      })),
    [endIndex, items, measurementItems, startIndex]
  );

  const measureElement = useCallback((index, element) => {
    if (!element) return;
    const nextHeight = element.getBoundingClientRect().height;
    const currentHeight = sizeMapRef.current.get(index);

    if (!nextHeight || nextHeight === currentHeight) {
      return;
    }

    sizeMapRef.current.set(index, nextHeight);
    setScrollState((currentState) => ({ ...currentState }));
  }, []);

  const scrollToIndex = useCallback(
    (index, { align = "start" } = {}) => {
      const element = containerRef?.current;
      const measurement = measurementItems[index];
      if (!element || !measurement) return;

      let nextTop = measurement.start;
      if (align === "center") {
        nextTop = measurement.start - element.clientHeight / 2 + measurement.size / 2;
      } else if (align === "end") {
        nextTop = measurement.end - element.clientHeight;
      }

      element.scrollTo({
        top: Math.max(0, nextTop),
        behavior: "smooth",
      });
    },
    [containerRef, measurementItems]
  );

  return {
    measureElement,
    scrollToIndex,
    totalSize,
    virtualItems,
  };
};
