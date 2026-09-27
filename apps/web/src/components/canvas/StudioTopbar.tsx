import { useRouter } from 'next/navigation';
import { useArchitectureStore } from '../../store/architectureStore';

export interface StudioTopbarProps {
  isCodeOpen: boolean;
  onToggleCode: () => void;
  onToggleCopilot: () => void;
  onExportGitHub: () => void;
  isExporting: boolean;
}

export function StudioTopbar({
  isCodeOpen,
  onToggleCode,
  onToggleCopilot,
  onExportGitHub,
  isExporting,
}: StudioTopbarProps) {
  const router = useRouter();
  const {
    projectName,
    syncStatus,
    isCompiling,
    exportedRepoUrl,
    isCopilotOpen,
    isApiPlaygroundOpen,
    setIsApiPlaygroundOpen,
  } = useArchitectureStore();

  return (
    <header className="relative z-40 h-[52px] flex items-center px-3.5 gap-2.5 bg-[#14161d] border-b border-white/[0.09] shrink-0 select-none">
      <div
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-2 font-semibold text-[15px] tracking-[0.2px] cursor-pointer mr-1.5"
      >
        <span className="w-5 h-5 flex-none">
          <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
            <path d="M4 12 L12 4 L20 12 L12 20 Z" stroke="#e08a3c" strokeWidth="1.6" />
            <circle cx="12" cy="12" r="2.3" fill="#e08a3c" />
          </svg>
        </span>
        Nexus
      </div>

      {/* Breadcrumbs & Live Cloud Sync Indicator */}
      <div className="hidden sm:flex items-center gap-1.5 text-[12.5px] text-[#8a8b9a] font-mono">
        <span
          onClick={() => router.push('/dashboard')}
          className="hover:text-[#e8e8ee] cursor-pointer transition-colors"
        >
          Workspaces
        </span>
        <span className="text-[#565766]">/</span>
        <span className="text-[#e8e8ee]">{projectName}</span>
        <span className="text-[#565766]">/</span>
        <span>schema.graph</span>
        <span className="text-[#565766]">/</span>

        {syncStatus === 'synced' && (
          <span className="text-[#8fbf6b] flex items-center gap-[5px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8fbf6b] shadow-[0_0_0_3px_rgba(143,191,107,0.15)]" />
            synced
          </span>
        )}
        {syncStatus === 'syncing' && (
          <span className="text-[#e08a3c] flex items-center gap-[5px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e08a3c] animate-pulse" />
            saving…
          </span>
        )}
        {syncStatus === 'error' && (
          <span className="text-[#e0708f] flex items-center gap-[5px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e0708f]" />
            sync error
          </span>
        )}
      </div>

      <div className="flex-1" />

      {/* <> Code Overlay Toggle Button */}
      <button
        type="button"
        onClick={onToggleCode}
        className={`px-[13px] py-[7px] rounded-[7px] border text-[13px] flex items-center gap-[7px] transition-all cursor-pointer ${
          isCodeOpen
            ? 'border-white/[0.28] bg-white/[0.09] text-[#e8e8ee]'
            : 'border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] hover:border-white/[0.22]'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="w-3.5 h-3.5"
        >
          <path d="M8 9l-4 3 4 3M16 9l4 3-4 3" />
        </svg>
        Code
      </button>

      {/* ▷ API Playground Toggle Button */}
      <button
        type="button"
        onClick={() => setIsApiPlaygroundOpen(!isApiPlaygroundOpen)}
        className={`px-[13px] py-[7px] rounded-[7px] border text-[13px] flex items-center gap-[7px] transition-all cursor-pointer ${
          isApiPlaygroundOpen
            ? 'border-[#3fc6d8]/50 bg-[#3fc6d8]/14 text-[#e8e8ee]'
            : 'border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] hover:border-white/[0.22]'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="w-3.5 h-3.5"
        >
          <polygon points="6 4 20 12 6 20 6 4" />
        </svg>
        API
      </button>

      {/* Copilot Overlay Toggle Button */}
      <button
        type="button"
        onClick={onToggleCopilot}
        className={`px-[13px] py-[7px] rounded-[7px] border text-[13px] flex items-center gap-[7px] transition-all cursor-pointer ${
          isCopilotOpen
            ? 'border-[#8b7ff0]/50 bg-[#8b7ff0]/15 text-[#e8e8ee]'
            : 'border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] hover:border-white/[0.22]'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="w-3.5 h-3.5"
        >
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
        Copilot
      </button>

      {/* Export to GitHub Primary Button */}
      <button
        type="button"
        onClick={onExportGitHub}
        disabled={isExporting || isCompiling}
        className="px-[13px] py-[7px] rounded-[7px] text-[13px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] hover:brightness-110 disabled:opacity-50 flex items-center gap-[7px] transition-all cursor-pointer"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.35 4.68-4.58 4.93.36.31.68.92.68 1.85v2.74c0 .26.18.58.69.48A10 10 0 0 0 12 2Z" />
        </svg>
        {isExporting
          ? 'Pushing…'
          : exportedRepoUrl
          ? 'Commit to GitHub'
          : 'Export to GitHub'}
      </button>
    </header>
  );
}