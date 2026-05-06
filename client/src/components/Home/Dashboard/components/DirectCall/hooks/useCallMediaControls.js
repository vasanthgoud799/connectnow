import { useCallback, useEffect, useState } from "react";
import {
  getAvailableCameraCount,
  restartCurrentCallConnection,
  switchCameraFacingMode,
  toggleCameraTrack,
  toggleMicrophoneTrack,
} from "@/utils/webRTC/webRTCHandler";

const PREVIEW_POSITIONS = ["top-right", "top-left", "bottom-right", "bottom-left"];

export const useCallMediaControls = ({ containerRef, isVideoCall }) => {
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [isLocalPreviewVisible, setIsLocalPreviewVisible] = useState(true);
  const [previewPosition, setPreviewPosition] = useState("top-right");
  const [cameraCount, setCameraCount] = useState(0);
  const [busyControl, setBusyControl] = useState(null);

  useEffect(() => {
    let active = true;

    getAvailableCameraCount().then((count) => {
      if (active) {
        setCameraCount(count);
      }
    });

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      active = false;
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const withBusyState = useCallback(async (name, action) => {
    setBusyControl(name);
    try {
      return await action();
    } finally {
      setBusyControl((current) => (current === name ? null : current));
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef?.current) {
      return false;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return true;
    }

    if (containerRef.current.requestFullscreen) {
      await containerRef.current.requestFullscreen();
      return true;
    }

    return false;
  }, [containerRef]);

  const cyclePreviewPosition = useCallback(() => {
    setPreviewPosition((current) => {
      const currentIndex = PREVIEW_POSITIONS.indexOf(current);
      return PREVIEW_POSITIONS[(currentIndex + 1) % PREVIEW_POSITIONS.length];
    });
  }, []);

  return {
    isFullscreen,
    isLocalPreviewVisible,
    previewPosition,
    canSwitchCamera: isVideoCall && cameraCount > 1,
    busyControl,
    setIsLocalPreviewVisible,
    cyclePreviewPosition,
    handleToggleMicrophone: () =>
      withBusyState("microphone", () => toggleMicrophoneTrack()),
    handleToggleCamera: () =>
      withBusyState("camera", () => toggleCameraTrack()),
    handleSwitchCamera: () =>
      withBusyState("switch-camera", () => switchCameraFacingMode()),
    handleRestartConnection: () =>
      withBusyState("restart", () => restartCurrentCallConnection()),
    handleToggleFullscreen: () =>
      withBusyState("fullscreen", () => toggleFullscreen()),
  };
};

export default useCallMediaControls;
