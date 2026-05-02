import React, { useMemo, useState } from "react";
import { Plus, SendHorizonal, Smile, X } from "lucide-react";

const emptyOptions = () => [
  { id: crypto.randomUUID(), text: "" },
  { id: crypto.randomUUID(), text: "" },
];

function CreatePollModal({ isOpen, onClose, onSubmit }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(emptyOptions);
  const [allowMultipleAnswers, setAllowMultipleAnswers] = useState(true);

  const filledOptions = useMemo(
    () => options.map((option) => ({ ...option, text: option.text.trim() })).filter((option) => option.text),
    [options]
  );

  if (!isOpen) return null;

  const updateOption = (id, value) => {
    setOptions((currentOptions) =>
      currentOptions.map((option) =>
        option.id === id ? { ...option, text: value } : option
      )
    );
  };

  const addOption = () => {
    setOptions((currentOptions) => [
      ...currentOptions,
      { id: crypto.randomUUID(), text: "" },
    ]);
  };

  const handleClose = () => {
    setQuestion("");
    setOptions(emptyOptions());
    setAllowMultipleAnswers(true);
    onClose?.();
  };

  const handleSubmit = () => {
    onSubmit?.({
      question: question.trim(),
      options: filledOptions,
      allowMultipleAnswers,
    });
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="themed-page-card w-full max-w-2xl rounded-[32px] p-6 shadow-[0_30px_100px_rgba(15,23,42,0.3)]">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleClose}
              className="themed-panel-soft rounded-full p-3 transition hover:scale-[1.02]"
            >
              <X className="themed-title h-5 w-5" />
            </button>
            <div>
              <h2 className="themed-title text-2xl font-semibold">Create poll</h2>
              <p className="themed-subtitle text-sm">Ask your chat a question and collect votes live.</p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <label className="themed-title mb-3 block text-lg font-semibold">Question</label>
            <div className="relative">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask question"
                className="themed-input h-14 w-full rounded-2xl px-5 pr-14 text-base"
              />
              <Smile className="themed-subtitle pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="themed-title mb-3 block text-lg font-semibold">Options</label>
            <div className="space-y-4">
              {options.map((option, index) => (
                <div key={option.id} className="relative">
                  <input
                    value={option.text}
                    onChange={(event) => updateOption(option.id, event.target.value)}
                    placeholder={`Add option ${index + 1}`}
                    className="themed-input h-14 w-full rounded-2xl px-5 pr-20 text-base"
                  />
                  <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-3">
                    <Smile className="themed-subtitle h-5 w-5" />
                    <div className="themed-subtitle h-5 w-5 text-center text-lg leading-5">≡</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addOption}
              className="themed-action-neutral mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Add option
            </button>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-4">
            <div>
              <p className="themed-title text-lg font-semibold">Allow multiple answers</p>
              <p className="themed-subtitle text-sm">Let people vote for more than one option.</p>
            </div>
            <button
              type="button"
              onClick={() => setAllowMultipleAnswers((current) => !current)}
              className={`relative h-8 w-14 rounded-full transition ${
                allowMultipleAnswers ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                  allowMultipleAnswers ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!question.trim() || filledOptions.length < 2}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_20px_50px_rgba(34,197,94,0.35)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SendHorizonal className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreatePollModal;
