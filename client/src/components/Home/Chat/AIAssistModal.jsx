import React from "react";
import { Copy, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";

function AIAssistModal({
  isOpen,
  title,
  subtitle,
  loading = false,
  value = "",
  onClose,
  onUse,
}) {
  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value || "");
      toast.success("Copied to clipboard.");
    } catch (error) {
      console.error("Error copying AI result:", error);
      toast.error("Unable to copy right now.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="themed-modal-surface w-full max-w-2xl rounded-[30px] p-6 shadow-[0_30px_80px_rgba(2,8,23,0.25)]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="themed-panel-soft flex h-12 w-12 items-center justify-center rounded-2xl">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="themed-title text-xl font-semibold">{title}</p>
              <p className="themed-subtitle text-sm">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="themed-panel-soft rounded-full p-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="themed-page-card min-h-[240px] rounded-[24px] p-5">
          {loading ? (
            <div className="flex h-[200px] items-center justify-center">
              <div className="text-center">
                <Wand2 className="mx-auto h-8 w-8 animate-pulse" />
                <p className="themed-subtitle mt-3 text-sm">Thinking...</p>
              </div>
            </div>
          ) : (
            <p className="themed-title whitespace-pre-wrap text-[15px] leading-7">
              {value || "No result available yet."}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!value || loading}
            className="themed-action-neutral inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            Copy
          </button>
          <button
            type="button"
            onClick={onUse}
            disabled={!value || loading}
            className="themed-action-info rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            Use in composer
          </button>
        </div>
      </div>
    </div>
  );
}

export default AIAssistModal;
