interface InlineAiPromptProps {
  showAIPrompt: boolean;
  aiPromptText: string;
  setAiPromptText: (text: string) => void;
  handleInlineGenerate: () => void;
  isGenerating: boolean;
  setShowAIPrompt: (show: boolean) => void;
}

export function InlineAiPrompt({
  showAIPrompt,
  aiPromptText,
  setAiPromptText,
  handleInlineGenerate,
  isGenerating,
  setShowAIPrompt,
}: InlineAiPromptProps) {
  if (!showAIPrompt) return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[88%] max-w-md bg-[#14161d] border border-[#8b7ff0]/50 rounded-xl p-3 shadow-2xl z-20 flex flex-col gap-2">
      <input
        autoFocus
        value={aiPromptText}
        onChange={(e) => setAiPromptText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleInlineGenerate();
          }
          if (e.key === 'Escape') setShowAIPrompt(false);
        }}
        placeholder="Ask AI to generate a function or query at cursor…"
        className="w-full bg-transparent text-[#e8e8ee] text-[12.5px] outline-none placeholder:text-[#565766]"
      />
      <div className="flex justify-between items-center pt-2 border-t border-white/[0.09]">
        <span className="text-[10px] font-mono text-[#565766]">Esc to close</span>
        <button
          type="button"
          onClick={handleInlineGenerate}
          disabled={isGenerating || !aiPromptText.trim()}
          className="px-3 py-1 rounded-[6px] bg-[#8b7ff0] text-[#0e0a1f] font-semibold text-[11.5px] disabled:opacity-50 cursor-pointer"
        >
          {isGenerating ? 'Generating…' : 'Insert ↵'}
        </button>
      </div>
    </div>
  );
}