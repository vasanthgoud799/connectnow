import { AlertTriangle } from "lucide-react";
import StatePanel from "@/components/ui/StatePanel";

function ChatErrorState({ message, onRetry }) {
  return (
    <StatePanel
      icon={AlertTriangle}
      title="Unable to load messages"
      description={message || "Try again in a moment."}
      className="mx-4 my-6 rounded-[24px] md:mx-7"
    >
      {onRetry ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="themed-action-info rounded-full px-4 py-2 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      ) : null}
    </StatePanel>
  );
}

export default ChatErrorState;
