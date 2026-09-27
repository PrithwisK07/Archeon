import { useState, useEffect } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';
import { buildStudioFileMap } from '../../lib/studioFileBuilder';

interface GitHubExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  isExporting: boolean;
  setIsExporting: (val: boolean) => void;
}

export function GitHubExportModal({
  isOpen,
  onClose,
  isExporting,
  setIsExporting,
}: GitHubExportModalProps) {
  const {
    present: currentIR,
    compiledFiles,
    projectName,
    chatHistory,
    exportedRepoUrl,
    setExportedRepoUrl,
    showToast,
  } = useArchitectureStore();

  const [repoName, setRepoName] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [commitMessage, setCommitMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (exportedRepoUrl) {
      const urlParts = exportedRepoUrl.split('/');
      setRepoName(urlParts[urlParts.length - 1]);
      const recentPrompt = chatHistory.filter((m) => m.role === 'user').pop()?.content || '';
      if (recentPrompt) setCommitMessage(`feat: ${recentPrompt.slice(0, 50)}`);
    } else {
      const slugifiedName = (projectName || 'acme-commerce')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setRepoName(`${slugifiedName}-api`);
    }
  }, [isOpen, exportedRepoUrl, projectName, chatHistory]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!repoName || !githubToken) return;
    onClose();
    setIsExporting(true);

    try {
      const latestCompiled = useArchitectureStore.getState().compiledFiles;
      const filesToPush =
        latestCompiled && Object.keys(latestCompiled).length > 0
          ? latestCompiled
          : buildStudioFileMap(currentIR, latestCompiled);

      const response = await fetch('/api/v1/export/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName,
          files: filesToPush,
          token: githubToken,
          commitMessage:
            commitMessage ||
            (exportedRepoUrl
              ? 'feat: update architecture schema'
              : 'feat: initial architecture generation'),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Export failed');

      setExportedRepoUrl(data.url);
      showToast(
        `Exported ${currentIR.entities.length} tables to ${data.url.replace('https://', '')}`
      );
      window.open(data.url, '_blank');
    } catch (error: any) {
      showToast(`Export Error: ${error.message}`);
    } finally {
      setIsExporting(false);
      setGithubToken('');
      setCommitMessage('');
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-[#050508]/60 backdrop-blur-[3px] z-60 flex items-center justify-center select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[min(440px,92vw)] bg-[#14161d] border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-[18px] py-4 border-b border-white/[0.09] flex items-center">
          <b className="text-[14px]">
            {exportedRepoUrl ? 'Commit to GitHub' : 'Export to GitHub'}
          </b>
          <span className="text-[11.5px] text-[#565766] ml-2 font-mono">git tree push</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-[26px] h-[26px] rounded-full bg-white/[0.045] border border-white/[0.09] flex items-center justify-center text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-[18px] space-y-3.5">
          <div>
            <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Repository Name</label>
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              disabled={!!exportedRepoUrl}
              className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-3 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Commit Message</label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="feat: initial architecture generation"
              className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-3 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#8a8b9a] mb-1.5">
              GitHub Personal Access Token (repo scope)
            </label>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_••••••••••••••••••••"
              className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-3 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-[7px] border border-white/[0.09] bg-white/[0.045] text-[12.5px] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!repoName || !githubToken || isExporting}
              className="px-4 py-2 rounded-[7px] text-[12.5px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] disabled:opacity-50 cursor-pointer"
            >
              {exportedRepoUrl ? 'Confirm Commit' : 'Confirm Export'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}