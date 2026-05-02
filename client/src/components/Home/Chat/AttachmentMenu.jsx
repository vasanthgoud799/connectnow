import React from "react";
import { BarChart3, CalendarClock, FileText, ImageIcon, Mic, Video } from "lucide-react";

const menuItems = [
  {
    label: "Photos",
    icon: ImageIcon,
    type: "image",
  },
  {
    label: "Videos",
    icon: Video,
    type: "video",
  },
  {
    label: "Audio",
    icon: Mic,
    type: "audio",
  },
  {
    label: "Document",
    icon: FileText,
    type: "document",
  },
  {
    label: "Poll",
    icon: BarChart3,
    type: "poll",
  },
  {
    label: "Schedule",
    icon: CalendarClock,
    type: "schedule",
  },
];

function AttachmentMenu({ onAttach, onCreatePoll, onCreateSchedule }) {
  const handleFileInput = (type) => {
    if (type === "poll") {
      onCreatePoll?.();
      return;
    }

    if (type === "schedule") {
      onCreateSchedule?.();
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = type === "document" ? "*/*" : `${type}/*`;
    input.onchange = (event) => {
      const file = event.target.files?.[0];
      if (file) {
        onAttach(file, type);
      }
    };
    input.click();
  };

  return (
    <div className="themed-attachment-menu w-[184px] rounded-[22px] p-2 shadow-[0_22px_60px_rgba(2,8,23,0.24)]">
      <div className="flex flex-col gap-1">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.type}
              type="button"
              className="themed-attachment-item flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition"
              onClick={() => handleFileInput(item.type)}
            >
              <div className="themed-panel-soft flex h-10 w-10 items-center justify-center rounded-2xl">
                <Icon className="themed-attachment-icon h-5 w-5" />
              </div>
              <span className="text-sm font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default AttachmentMenu;
