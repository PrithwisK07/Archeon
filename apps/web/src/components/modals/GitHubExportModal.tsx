"use client";

import { useState, useEffect, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
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

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      ),
    []
  );

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
        data: { user },
      } = await supabase.auth.getUser();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token =
        session?.provider_token ||
        user?.user_metadata?.github_token ||
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
        queryParams: {
          prompt: "consent",
        },
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          returnPath
        )}`,
      },
    });

    if (error) setErrorMsg(error.message);
  };

  const handleDisconnect = async () => {
    setCheckingAuth(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase.auth.updateUser({
        data: {
          github_token: null,
          github_username: null,
        },
      });
    }

    setOauthToken(null);
    setGithubUsername(null);
    setCheckingAuth(false);
    setErrorMsg("Disconnected. Please connect again to fetch a fresh token.");
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

      const filesPayload = buildStudioFileMap(present, compiledFiles);

      const lastUserMsg = [...(chatHistory || [])]
        .reverse()
        .find((m) => m.role === "user")?.content;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;

      const res = await fetch("/api/v1/export/github", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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
        throw new Error(
          data.error || `GitHub export failed (${res.status})`
        );
      }

      if (data.url) {
        setExportedRepoUrl(data.url);
      }

      if (data.commitMessage) {
        showToast(`Pushed: "${data.commitMessage}"`);
      } else {
        showToast(
          exportedRepoUrl
            ? `Pushed commit to ${cleanRepo}!`
            : `Created & pushed to ${cleanRepo}!`
        );
      }

      setCommitMessage("");
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to push to GitHub");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="
        fixed inset-0 z-50
        flex items-center justify-center
        bg-black/70
        backdrop-blur-xs
        p-4
        animate-in fade-in duration-150
      "
    >
      <div
        className="
          relative w-full max-w-[470px]
          overflow-hidden
          rounded-[18px]
          border border-white/[0.10]
          bg-[#0d0f14]
          text-[#e8e8ee]
          shadow-[0_30px_100px_rgba(0,0,0,0.55)]
          animate-in zoom-in-[0.98] slide-in-from-bottom-2
          duration-200
        "
      >
        {/* Header */}
        <div className="border-b border-white/[0.07] bg-[#111319]/90 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* GitHub icon container */}
              <div
                className="
                  flex h-9 w-9 shrink-0 items-center justify-center
                  rounded-[10px]
                  border border-white/[0.09]
                  bg-white/[0.045]
                  shadow-inner
                "
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-[19px] w-[19px] text-[#e8e8ee]"
                >
                  <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.35 4.68-4.58 4.93.36.31.68.92.68 1.85v2.74c0 .26.18.58.69.48A10 10 0 0 0 12 2Z" />
                </svg>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                    {exportedRepoUrl
                      ? "Commit & Push to GitHub"
                      : "Export to GitHub"}
                  </h3>

                  {exportedRepoUrl && (
                    <span className="rounded-full border border-[#8fbf6b]/20 bg-[#8fbf6b]/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[#8fbf6b]">
                      Existing
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-[11px] leading-4 text-[#777987]">
                  {exportedRepoUrl
                    ? "Push the latest schema & API updates"
                    : "Create a repository from your generated backend"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="
                flex h-7 w-7 shrink-0 items-center justify-center
                rounded-lg
                text-[#686a77]
                transition-all
                hover:bg-white/[0.06]
                hover:text-[#d8d8df]
                active:scale-95
                cursor-pointer
              "
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-4 w-4"
              >
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleExport} className="p-5">
          <div className="space-y-[18px]">
            {/* Connection */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#656774]">
                  Authentication
                </label>

                {oauthToken && !useManualOverride && !checkingAuth && (
                  <span className="text-[10px] font-mono text-[#555762]">
                    OAuth
                  </span>
                )}
              </div>

              {checkingAuth ? (
                <div
                  className="
                    flex items-center gap-2.5
                    rounded-xl
                    border border-white/[0.07]
                    bg-white/[0.025]
                    px-3.5 py-3
                  "
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#6b6d78]" />
                  <span className="text-[11.5px] text-[#777987]">
                    Checking GitHub connection…
                  </span>
                </div>
              ) : oauthToken && !useManualOverride ? (
                <div
                  className="
                    rounded-xl
                    border border-[#8fbf6b]/20
                    bg-[#8fbf6b]/[0.055]
                    p-3
                  "
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#8fbf6b]/10">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8fbf6b]/40" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8fbf6b]" />
                        </span>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-[11.5px] font-medium text-[#dfe8d8]">
                          {githubUsername
                            ? `@${githubUsername}`
                            : "GitHub account connected"}
                        </p>
                        <p className="mt-0.5 text-[9.5px] text-[#74806e]">
                          Ready to create and push repositories
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setUseManualOverride(true)}
                        className="text-[10px] text-[#777987] transition-colors hover:text-[#d0d0d7] cursor-pointer"
                      >
                        Use PAT
                      </button>

                      <span className="h-3 w-px bg-white/[0.08]" />

                      <button
                        type="button"
                        onClick={handleDisconnect}
                        className="text-[10px] text-[#a96578] transition-colors hover:text-[#e0708f] cursor-pointer"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="
                    rounded-xl
                    border border-white/[0.08]
                    bg-[#111319]
                    p-3
                  "
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11.5px] font-medium text-[#c9cad1]">
                        {oauthToken
                          ? "Using a custom access token"
                          : "GitHub account not connected"}
                      </p>
                      <p className="mt-0.5 text-[9.5px] text-[#656774]">
                        {oauthToken
                          ? "Your PAT will be used for this export"
                          : "Connect GitHub or provide a personal token"}
                      </p>
                    </div>

                    {oauthToken ? (
                      <button
                        type="button"
                        onClick={() => setUseManualOverride(false)}
                        className="
                          shrink-0 rounded-lg
                          border border-[#8fbf6b]/15
                          bg-[#8fbf6b]/[0.06]
                          px-2.5 py-1.5
                          text-[10px] font-medium
                          text-[#8fbf6b]
                          transition-all
                          hover:bg-[#8fbf6b]/10
                          cursor-pointer
                        "
                      >
                        Use OAuth
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleConnectGitHub}
                        className="
                          flex shrink-0 items-center gap-1.5
                          rounded-lg
                          border border-white/[0.09]
                          bg-white/[0.055]
                          px-2.5 py-1.5
                          text-[10.5px] font-medium
                          text-[#dedee4]
                          transition-all
                          hover:border-white/[0.14]
                          hover:bg-white/[0.09]
                          cursor-pointer
                        "
                      >
                        Connect GitHub
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          className="h-3 w-3"
                        >
                          <path
                            d="M3.5 8h8M8.5 4.5L12 8l-3.5 3.5"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#656774]">
                      Personal Access Token
                    </label>

                    <div className="relative">
                      <input
                        type="password"
                        value={manualToken}
                        onChange={(e) => setManualToken(e.target.value)}
                        placeholder="ghp_••••••••••••••••••••"
                        className="
                          w-full rounded-lg
                          border border-white/[0.08]
                          bg-[#090a0e]
                          px-3 py-2.5 pr-3
                          font-mono text-[11.5px]
                          text-[#e8e8ee]
                          outline-none
                          transition-all
                          placeholder:text-[#3f414b]
                          focus:border-[#e08a3c]/50
                          focus:ring-1
                          focus:ring-[#e08a3c]/10
                        "
                      />
                    </div>

                    <p className="mt-1.5 text-[9.5px] text-[#4f515c]">
                      Requires repository access to create and push changes.
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* Repository */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#656774]">
                  Repository
                </label>

                {!exportedRepoUrl && (
                  <button
                    type="button"
                    onClick={() => setIsPrivate((p) => !p)}
                    className="
                      flex items-center gap-1.5
                      rounded-md
                      border border-white/[0.07]
                      bg-white/[0.025]
                      px-2 py-1
                      text-[9.5px]
                      font-medium
                      text-[#777987]
                      transition-all
                      hover:border-white/[0.11]
                      hover:bg-white/[0.05]
                      hover:text-[#c5c6cc]
                      cursor-pointer
                    "
                  >
                    {isPrivate ? (
                      <>
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          className="h-3 w-3"
                        >
                          <rect
                            x="3.5"
                            y="7"
                            width="9"
                            height="6"
                            rx="1.5"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                          <path
                            d="M5.5 7V5.5a2.5 2.5 0 015 0V7"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                        </svg>
                        Private
                      </>
                    ) : (
                      <>
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          className="h-3 w-3"
                        >
                          <path
                            d="M2.5 8s2-4 5.5-4 5.5 4 5.5 4-2 4-5.5 4-5.5-4-5.5-4Z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                          <circle
                            cx="8"
                            cy="8"
                            r="1.5"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                        </svg>
                        Public
                      </>
                    )}
                  </button>
                )}
              </div>

              <div
                className="
                  flex overflow-hidden rounded-xl
                  border border-white/[0.08]
                  bg-[#090a0e]
                  transition-all
                  focus-within:border-[#e08a3c]/45
                  focus-within:ring-1
                  focus-within:ring-[#e08a3c]/10
                "
              >
                {githubUsername && (
                  <div className="flex items-center border-r border-white/[0.06] bg-white/[0.015] px-3">
                    <span className="font-mono text-[11px] text-[#4d4f59]">
                      {githubUsername}/
                    </span>
                  </div>
                )}

                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-archeon-backend"
                  required
                  className="
                    min-w-0 flex-1
                    bg-transparent
                    px-3 py-2.5
                    font-mono text-[12px]
                    text-[#e8e8ee]
                    outline-none
                    placeholder:text-[#3e4049]
                  "
                />

                <div className="flex items-center pr-3 text-[#41434d]">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    className="h-3.5 w-3.5"
                  >
                    <path
                      d="M6 3l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </section>

            {/* Commit message */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#656774]">
                  Commit Message
                </label>

                <span className="text-[9.5px] text-[#484a54]">
                  Optional
                </span>
              </div>

              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="feat: update schema and generated routes"
                className="
                  w-full rounded-xl
                  border border-white/[0.08]
                  bg-[#090a0e]
                  px-3 py-2.5
                  font-mono text-[11.5px]
                  text-[#e8e8ee]
                  outline-none
                  transition-all
                  placeholder:text-[#3e4049]
                  focus:border-[#e08a3c]/45
                  focus:ring-1
                  focus:ring-[#e08a3c]/10
                "
              />

              <p className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-[#50525d]">
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  className="h-3 w-3"
                >
                  <path
                    d="M8 3.5v5l3 1.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="8"
                    cy="8"
                    r="5.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
                Leave empty to generate a conventional commit automatically.
              </p>
            </section>

            {/* Error */}
            {errorMsg && (
              <div
                className="
                  flex gap-2.5
                  rounded-xl
                  border border-[#e0708f]/20
                  bg-[#e0708f]/[0.055]
                  px-3 py-2.5
                "
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#e0708f]"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="5.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M8 5v3.5M8 11h.01"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>

                <p className="font-mono text-[10.5px] leading-4 text-[#d77d93]">
                  {errorMsg}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4">
            <div className="flex items-center gap-1.5 text-[9.5px] text-[#4f515b]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8fbf6b]/70" />
              Changes will be pushed directly
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="
                  rounded-lg
                  border border-white/[0.08]
                  bg-white/[0.025]
                  px-3.5 py-2
                  text-[11.5px]
                  font-medium
                  text-[#777987]
                  transition-all
                  hover:border-white/[0.12]
                  hover:bg-white/[0.055]
                  hover:text-[#d0d0d7]
                  active:scale-[0.98]
                  cursor-pointer
                "
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isExporting || (!effectiveToken && !checkingAuth)}
                className="
                  group relative
                  flex items-center gap-2
                  overflow-hidden
                  rounded-lg
                  bg-gradient-to-br from-[#e08a3c] to-[#c9692a]
                  px-4 py-2
                  text-[11.5px]
                  font-semibold
                  text-[#1a1206]
                  shadow-[0_5px_20px_rgba(201,105,42,0.18)]
                  transition-all
                  hover:brightness-110
                  hover:shadow-[0_7px_25px_rgba(201,105,42,0.25)]
                  active:scale-[0.98]
                  disabled:cursor-not-allowed
                  disabled:opacity-45
                  cursor-pointer
                "
              >
                {isExporting ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#1a1206]/25 border-t-[#1a1206]" />
                    Pushing…
                  </>
                ) : (
                  <>
                    {exportedRepoUrl ? "Commit & Push" : "Create Repo & Push"}

                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    >
                      <path
                        d="M3 8h9M8.5 4.5L12 8l-3.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}