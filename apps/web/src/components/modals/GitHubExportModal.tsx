"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useArchitectureStore } from "../../store/architectureStore";
import { buildStudioFileMap } from "../../lib/studioFileBuilder";

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
    present,
    compiledFiles,
    chatHistory,
    projectName,
    exportedRepoUrl,
    setExportedRepoUrl,
    showToast,
  } = useArchitectureStore();

  const [repoName, setRepoName] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);

  const [oauthToken, setOauthToken] = useState<string | null>(null);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState("");
  const [useManualOverride, setUseManualOverride] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! 
  ), []);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);

    if (exportedRepoUrl) {
      const parts = exportedRepoUrl.replace(/\/+$/, "").split("/");
      const existingRepo = parts[parts.length - 1];
      if (existingRepo) setRepoName(existingRepo);
    } else if (projectName) {
      setRepoName(
        projectName
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") || "archeon-backend"
      );
    }

    const checkGitHubAuth = async () => {
      setCheckingAuth(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token =
        session?.provider_token ||
        session?.user?.user_metadata?.github_token ||
        null;

      const username =
        session?.user?.user_metadata?.github_username ||
        session?.user?.user_metadata?.user_name ||
        session?.user?.user_metadata?.preferred_username ||
        null;

      setOauthToken(token);
      setGithubUsername(username);
      setCheckingAuth(false);
    };

    checkGitHubAuth();
  }, [isOpen, exportedRepoUrl, projectName]);

  if (!isOpen) return null;

  const effectiveToken = useManualOverride
    ? manualToken.trim()
    : oauthToken || manualToken.trim();

  const handleConnectGitHub = async () => {
    const returnPath = window.location.pathname + window.location.search;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        scopes: "repo read:user user:email",
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          returnPath
        )}`,
      },
    });
    if (error) setErrorMsg(error.message);
  };

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanRepo = repoName.trim();
    if (!cleanRepo) {
      setErrorMsg("Please provide a repository name.");
      return;
    }
    if (!effectiveToken) {
      setErrorMsg("Please connect your GitHub account or enter a token.");
      return;
    }

    try {
      setIsExporting(true);

      // Build complete file map (including any in-memory code editor modifications)
      const filesPayload = buildStudioFileMap(present, compiledFiles);

      // Grab most recent user prompt for Groq AI commit message fallback
      const lastUserMsg = [...(chatHistory || [])]
        .reverse()
        .find((m) => m.role === "user")?.content;
        
      const { data: { session }} = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/v1/export/github", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          repoName: cleanRepo,
          files: filesPayload,
          token: effectiveToken,
          isPrivate,
          commitMessage: commitMessage.trim() || undefined,
          recentPrompt: lastUserMsg,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `GitHub export failed (${res.status})`);
      }

      if (data.url) {
        setExportedRepoUrl(data.url);
      }

      // FIX: Surface the AI-generated (or manual) commit message to the user
      if (data.commitMessage) {
        showToast(`Pushed: "${data.commitMessage}"`);
      } else {
        showToast(
          exportedRepoUrl
            ? `Pushed commit to ${cleanRepo}!`
            : `Created & pushed to ${cleanRepo}!`
        );
      }

      setCommitMessage(""); // Clear the input field for the next export
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to push to GitHub");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-[440px] rounded-2xl bg-[#101219] border border-white/[0.09] shadow-2xl overflow-hidden text-[#e8e8ee]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#14161d]">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.35 4.68-4.58 4.93.36.31.68.92.68 1.85v2.74c0 .26.18.58.69.48A10 10 0 0 0 12 2Z" />
            </svg>
            <div>
              <h3 className="text-[14.5px] font-semibold leading-tight">
                {exportedRepoUrl
                  ? "Commit & Push to GitHub"
                  : "Export to GitHub Repository"}
              </h3>
              <p className="text-[11.5px] text-[#8a8b9a]">
                {exportedRepoUrl
                  ? "Push latest schema & API updates directly"
                  : "Create a repository and push your generated backend"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-[#8a8b9a] hover:text-white hover:bg-white/[0.06] flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleExport} className="p-5 space-y-4">
          {/* GitHub Connection Badge or Fallback Input */}
          {checkingAuth ? (
            <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-[12px] text-[#8a8b9a] font-mono">
              Checking GitHub connection…
            </div>
          ) : oauthToken && !useManualOverride ? (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#8fbf6b]/10 border border-[#8fbf6b]/30 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[12.5px]">
                <span className="w-2 h-2 rounded-full bg-[#8fbf6b]" />
                <span className="text-[#e8e8ee] font-medium">
                  Connected{githubUsername ? ` as @${githubUsername}` : " via GitHub"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setUseManualOverride(true)}
                className="text-[11px] font-mono text-[#8a8b9a] hover:text-[#e8e8ee] underline cursor-pointer"
              >
                Use custom PAT
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-[#14161d] border border-white/[0.09] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[#8a8b9a]">
                  {oauthToken
                    ? "Using custom Personal Access Token"
                    : "GitHub account not linked"}
                </span>
                {oauthToken ? (
                  <button
                    type="button"
                    onClick={() => setUseManualOverride(false)}
                    className="text-[11px] font-mono text-[#8fbf6b] hover:underline cursor-pointer"
                  >
                    Use OAuth account
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectGitHub}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-[11.5px] font-medium text-[#e8e8ee] cursor-pointer transition-colors"
                  >
                    Connect GitHub →
                  </button>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[#8a8b9a] mb-1.5">
                  Personal Access Token (repo scope)
                </label>
                <input
                  type="password"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="ghp_••••••••••••••••••••"
                  className="w-full bg-[#0b0c10] border border-white/[0.09] focus:border-[#e08a3c]/60 rounded-lg px-3 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none"
                />
              </div>
            </div>
          )}

          {/* Repository Name + Visibility */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11.5px] text-[#8a8b9a]">
                Repository Name
              </label>
              {!exportedRepoUrl && (
                <button
                  type="button"
                  onClick={() => setIsPrivate((p) => !p)}
                  className="text-[11px] font-mono px-2 py-0.5 rounded border border-white/[0.09] bg-white/[0.03] text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
                >
                  {isPrivate ? "Public" : "Private"}
                </button>
              )}
            </div>

            <div className="flex items-center bg-[#0b0c10] border border-white/[0.09] focus-within:border-[#e08a3c]/60 rounded-lg overflow-hidden">
              {githubUsername && (
                <span className="pl-3 pr-1 py-2 text-[12.5px] font-mono text-[#565766] select-none">
                  {githubUsername}/
                </span>
              )}
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="my-archeon-backend"
                required
                className="flex-1 bg-transparent px-3 py-2 text-[13px] font-mono text-[#e8e8ee] outline-none"
              />
            </div>
          </div>

          {/* Commit Message (Optional — falls back to Groq AI / Conventional Commit) */}
          <div>
            <label className="block text-[11.5px] text-[#8a8b9a] mb-1.5">
              Commit Message{" "}
              <span className="text-[#565766] font-mono text-[10.5px]">
                (leave blank to auto-generate)
              </span>
            </label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="feat: update schema and generated routes"
              className="w-full bg-[#0b0c10] border border-white/[0.09] focus:border-[#e08a3c]/60 rounded-lg px-3 py-2 text-[12.5px] font-mono text-[#e8e8ee] outline-none"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-[#e0708f]/12 border border-[#e0708f]/30 text-[12px] text-[#e0708f] font-mono">
              {errorMsg}
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.06] text-[12.5px] text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isExporting || (!effectiveToken && !checkingAuth)}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] hover:brightness-110 disabled:opacity-50 cursor-pointer transition-all shadow-lg"
            >
              {isExporting
                ? "Pushing to GitHub…"
                : exportedRepoUrl
                ? "Commit & Push"
                : "Create Repo & Push"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}