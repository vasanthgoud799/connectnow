import { useEffect, useMemo, useState } from "react";

const formatDuration = (elapsedSeconds) => {
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  }

  return [minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

export const useCallTimer = (isRunning) => {
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setStartedAt(null);
      setElapsedSeconds(0);
      return;
    }

    const baseTime = Date.now();
    setStartedAt(baseTime);
    setElapsedSeconds(0);

    const intervalId = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - baseTime) / 1000)));
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isRunning]);

  return useMemo(
    () => ({
      elapsedSeconds,
      formattedDuration: formatDuration(elapsedSeconds),
      startedAt,
    }),
    [elapsedSeconds, startedAt]
  );
};

export default useCallTimer;
