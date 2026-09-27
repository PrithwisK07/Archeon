import { PlaygroundResponseState } from './playgroundTypes';

interface PlaygroundResponsePanelProps {
  responseState: PlaygroundResponseState | null;
  onCopyJson: () => void;
}

export function PlaygroundResponsePanel({
  responseState,
  onCopyJson,
}: PlaygroundResponsePanelProps) {
  if (!responseState) return null;

  const isSuccess = responseState.status >= 200 && responseState.status < 300;

  return (
    <div className="border border-white/[0.09] rounded-xl bg-[#101219] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.08] bg-[#14161d]/70 flex items-center gap-3 font-mono text-[11.5px]">
        <span className="text-[#8a8b9a] uppercase tracking-wider text-[10.5px]">
          Response
        </span>

        <span
          className={`px-2.5 py-0.5 rounded font-semibold ${
            isSuccess
              ? 'bg-[#8fbf6b]/15 text-[#8fbf6b] border border-[#8fbf6b]/30'
              : 'bg-[#e0708f]/15 text-[#e0708f] border border-[#e0708f]/30'
          }`}
        >
          {responseState.status} {responseState.statusText}
        </span>

        <span className="text-[#565766]">{responseState.sizeLabel}</span>

        <button
          type="button"
          onClick={onCopyJson}
          className="ml-auto px-2.5 py-1 rounded border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-[#8a8b9a] hover:text-[#e8e8ee] text-[11px] cursor-pointer"
        >
          Copy JSON
        </button>
      </div>

      {/* Explicit Status Summary Banner */}
      <div
        className={`px-4 py-2.5 border-b text-[12.5px] font-mono flex items-center gap-2 ${
          isSuccess
            ? 'bg-[#8fbf6b]/[0.07] border-[#8fbf6b]/20 text-[#8fbf6b]'
            : 'bg-[#e0708f]/[0.07] border-[#e0708f]/20 text-[#e0708f]'
        }`}
      >
        <span>{isSuccess ? '✓' : '✕'}</span>
        <span>{responseState.summaryMessage}</span>
      </div>

      <pre className="p-4 font-mono text-[12px] leading-[1.65] text-[#e8e8ee] max-h-[380px] overflow-auto select-text">
        {responseState.body}
      </pre>
    </div>
  );
}