import React, { useMemo, useState } from "react";
import { Clock3, Crown, Lock, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";

function PremiumUpgradeModal({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false);

  const features = useMemo(
    () => [
      "Smart replies powered by AI",
      "Translate any message instantly",
      "Tone rewrite for formal or friendly replies",
      "Summaries for long conversations",
      "50 AI uses per day",
    ],
    []
  );

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    try {
      setLoading(true);
      toast.info("Premium is coming soon.");
    } catch (error) {
      console.error("Error starting premium checkout:", error);
      toast.error("Unable to open premium right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="themed-modal-surface w-full max-w-2xl rounded-[32px] p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500/20 to-cyan-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
              <Crown className="h-3.5 w-3.5" />
              Premium AI
            </div>
            <h2 className="themed-title text-3xl font-semibold">
              Unlock AI messaging
            </h2>
            <p className="themed-subtitle mt-2 max-w-xl text-sm">
              Upgrade to Premium to use smart replies, summaries, translation,
              and tone rewrite in your chats.
            </p>
          </div>
          <button
            type="button"
            className="themed-panel-soft rounded-full p-2"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.25fr,0.95fr]">
          <div className="themed-panel-soft rounded-[28px] p-5">
            <div className="grid gap-3">
              {features.map((feature) => (
                <div key={feature} className="flex items-start gap-3">
                  <div className="themed-icon-chip mt-0.5">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <p className="themed-title text-sm">{feature}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] bg-gradient-to-br from-violet-500/15 via-slate-900/80 to-cyan-400/10 p-[1px]">
            <div className="flex h-full flex-col rounded-[27px] bg-slate-950/90 p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 p-3 text-white">
                  <Wand2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">
                    Premium
                  </p>
                  <p className="text-3xl font-semibold text-white">Rs.299</p>
                </div>
              </div>

              <p className="mb-6 text-sm text-slate-300">
                30 days validity. Daily AI limit resets every midnight.
              </p>

              <div className="mb-5 rounded-2xl border border-cyan-300/15 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-100">
                <div className="flex items-center gap-2 font-medium">
                  <Clock3 className="h-4 w-4" />
                  Coming soon
                </div>
                <p className="mt-1 text-xs text-cyan-100/80">
                  Premium checkout will be enabled once Razorpay keys are configured.
                </p>
              </div>

              <button
                type="button"
                onClick={handleUpgrade}
                disabled={loading}
                className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 px-5 py-3 font-medium text-white shadow-[0_18px_40px_rgba(124,92,255,0.22)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  "Opening..."
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Upgrade to Premium
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PremiumUpgradeModal;

