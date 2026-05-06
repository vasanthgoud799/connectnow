import {
  Camera,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  RefreshCcw,
  RotateCcw,
  Rows4,
  Video,
  VideoOff,
} from "lucide-react";

const baseButtonClasses =
  "group relative flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white shadow-[0_18px_36px_rgba(2,8,23,0.32)] backdrop-blur-xl transition hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-55";

const iconButtonToneMap = {
  neutral: "hover:bg-white/14",
  active: "bg-cyan-400/16 text-cyan-100 hover:bg-cyan-400/24",
  muted: "bg-rose-400/16 text-rose-100 hover:bg-rose-400/24",
  danger: "border-rose-500/40 bg-rose-500 text-white hover:bg-rose-600",
};

const ControlButton = ({
  icon: Icon,
  label,
  title,
  tone = "neutral",
  onClick,
  disabled = false,
}) => (
  <button
    type="button"
    aria-label={label}
    title={title || label}
    disabled={disabled}
    onClick={onClick}
    className={`${baseButtonClasses} ${iconButtonToneMap[tone] || iconButtonToneMap.neutral}`}
  >
    <Icon className="h-5 w-5" />
  </button>
);

const CallControls = ({
  isVideoCall,
  localMicrophoneEnabled,
  localCameraEnabled,
  isLocalPreviewVisible,
  isFullscreen,
  canSwitchCamera,
  reconnecting,
  busyControl,
  showPreviewToggle = true,
  showFullscreenToggle = true,
  showRestartControl = true,
  onToggleMicrophone,
  onToggleCamera,
  onSwitchCamera,
  onToggleLocalPreview,
  onToggleFullscreen,
  onRestartConnection,
  onHangUp,
}) => {
  const controls = [
    {
      icon: localMicrophoneEnabled ? Mic : MicOff,
      label: localMicrophoneEnabled ? "Mute microphone" : "Unmute microphone",
      tone: localMicrophoneEnabled ? "active" : "muted",
      onClick: onToggleMicrophone,
      disabled: busyControl === "microphone",
    },
  ];

  if (isVideoCall) {
    controls.push(
      {
        icon: localCameraEnabled ? Video : VideoOff,
        label: localCameraEnabled ? "Turn camera off" : "Turn camera on",
        tone: localCameraEnabled ? "active" : "muted",
        onClick: onToggleCamera,
        disabled: busyControl === "camera",
      },
    );

    if (showPreviewToggle) {
      controls.push({
        icon: isLocalPreviewVisible ? Rows4 : Camera,
        label: isLocalPreviewVisible ? "Hide local preview" : "Show local preview",
        tone: "neutral",
        onClick: onToggleLocalPreview,
      });
    }

    if (canSwitchCamera) {
      controls.push({
        icon: RotateCcw,
        label: "Switch camera",
        tone: "neutral",
        onClick: onSwitchCamera,
        disabled: busyControl === "switch-camera",
      });
    }

    if (showFullscreenToggle) {
      controls.push({
        icon: isFullscreen ? Minimize2 : Maximize2,
        label: isFullscreen ? "Exit fullscreen" : "Enter fullscreen",
        tone: "neutral",
        onClick: onToggleFullscreen,
        disabled: busyControl === "fullscreen",
      });
    }
  }

  if (showRestartControl) {
    controls.push({
      icon: RefreshCcw,
      label: reconnecting ? "Reconnecting" : "Restart connection",
      tone: reconnecting ? "active" : "neutral",
      onClick: onRestartConnection,
      disabled: busyControl === "restart",
    });
  }

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-[28px] border border-white/10 bg-[#050a14]/78 px-4 py-3 shadow-[0_28px_70px_rgba(2,8,23,0.4)] backdrop-blur-2xl sm:px-5">
      {controls.map((control) => (
        <ControlButton key={control.label} {...control} />
      ))}
      <ControlButton
        icon={PhoneOff}
        label="End call"
        title="End call"
        tone="danger"
        onClick={onHangUp}
      />
    </div>
  );
};

export default CallControls;
