import { MessageSquareText } from "lucide-react";
import StatePanel from "@/components/ui/StatePanel";

function EmptyChatState({ hasSelection = false }) {
  if (hasSelection) {
    return (
      <StatePanel
        icon={MessageSquareText}
        title="No messages yet"
        description="Send the first message to start this conversation."
        dashed
        className="mx-4 my-6 md:mx-7"
      />
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex h-[86px] items-center justify-between border-b border-white/8 px-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[#ef5da8] to-[#68d8ff]" />
          <div>
            <p className="font-['Space_Grotesk'] text-xl font-semibold">Messages</p>
            <p className="text-sm text-slate-400">
              Choose a conversation to start chatting
            </p>
          </div>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.03),_transparent_42%)]" />
        <StatePanel
          icon={MessageSquareText}
          title="Start a conversation"
          description="Pick a contact from the left and start messaging in a cleaner, more premium chat view."
          className="relative max-w-2xl rounded-[28px] px-10 py-10"
        />
      </div>
    </div>
  );
}

export default EmptyChatState;
