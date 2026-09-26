'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { CanonicalIR } from '@zero-dollar/ir-core';

const COLORS: Record<string, string> = {
  violet: '#8b7ff0',
  cyan: '#3fc6d8',
  amber: '#e08a3c',
  rose: '#e0708f',
  lime: '#8fbf6b',
};

const COLOR_COMBOS = [
  ['violet', 'cyan', 'amber'],
  ['cyan', 'rose', 'lime'],
  ['amber', 'violet', 'rose'],
  ['lime', 'cyan', 'violet'],
];

interface Project {
  id: string;
  name: string;
  updated_at: string;
  ir_state?: CanonicalIR | null;
}

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function WorkspaceThumbSVG({ colorKeys }: { colorKeys: string[] }) {
  const c = colorKeys.map((k) => COLORS[k] || COLORS.violet);
  return (
    <svg viewBox="0 0 240 104" className="absolute inset-0 w-full h-full">
      <path d="M63 33 C 95 33 95 55 125 55" stroke={c[0]} strokeWidth="1.5" fill="none" opacity=".7" />
      <path d="M125 55 C 148 55 148 78 172 78" stroke={c[1]} strokeWidth="1.5" fill="none" opacity=".7" />
      <rect x="34" y="22" width="46" height="26" rx="6" fill={c[0]} opacity=".16" stroke={c[0]} strokeWidth="1.2" />
      <rect x="100" y="42" width="46" height="26" rx="6" fill={c[1]} opacity=".16" stroke={c[1]} strokeWidth="1.2" />
      <rect x="148" y="66" width="46" height="26" rx="6" fill={c[2]} opacity=".16" stroke={c[2]} strokeWidth="1.2" />
    </svg>
  );
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userInitials, setUserInitials] = useState('PK');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  useEffect(() => {
    const fetchProjects = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }

      const user = sessionData.session.user;
      const nameMeta = user.user_metadata?.full_name || user.email || 'Architect';
      const parts = nameMeta.trim().split(/[\s.@_]+/);
      const initials =
        parts.length >= 2
          ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
          : nameMeta.slice(0, 2).toUpperCase();
      setUserInitials(initials);

      const { data, error } = await supabase
        .from('projects')
        .select('id, name, updated_at, ir_state')
        .order('updated_at', { ascending: false });

      if (!error && data) setProjects(data);
      setIsLoading(false);
    };

    fetchProjects();
  }, [supabase, router]);

  const handleCreateProject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = (newWorkspaceName || 'untitled-workspace').trim();
    setIsCreateModalOpen(false);
    setNewWorkspaceName('');

    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('projects')
      .insert([{ name, user_id: userData.user?.id }])
      .select('id')
      .single();

    if (data && !error) {
      router.push(`/editor/${data.id}`);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b0c10] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#e08a3c] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0c10] text-[#e8e8ee]" onClick={() => setMenuOpen(false)}>
      {/* Topbar */}
      <header className="relative z-40 h-[52px] flex items-center px-3.5 gap-4 bg-[#14161d] border-b border-white/[0.09] shrink-0">
        <div className="flex items-center gap-2 font-semibold text-[15px] tracking-[0.2px] cursor-pointer select-none">
          <span className="w-5 h-5 flex-none">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
              <path d="M4 12 L12 4 L20 12 L12 20 Z" stroke="#e08a3c" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="2.3" fill="#e08a3c" />
            </svg>
          </span>
          Nexus
        </div>

        <div className="flex-1" />

        <button
          onClick={() => {
            setNewWorkspaceName('untitled-workspace');
            setIsCreateModalOpen(true);
          }}
          className="px-[13px] py-[7px] rounded-[7px] text-[13px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] hover:brightness-110 flex items-center gap-[7px] cursor-pointer transition-all"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New workspace
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8b7ff0] to-[#3fc6d8] text-[12px] font-bold text-[#0e0a1f] flex items-center justify-center cursor-pointer"
          title="Account"
        >
          {userInitials}
        </button>
      </header>

      {/* Avatar Dropdown */}
      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-[56px] right-4 bg-[#14161d] border border-white/[0.09] rounded-[10px] shadow-2xl p-1.5 z-50 min-w-[130px]"
        >
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-[7px] text-[12.5px] text-[#e8e8ee] hover:bg-white/[0.045] cursor-pointer"
          >
            Log out
          </button>
        </div>
      )}

      {/* Main Workspaces Grid */}
      <main className="flex-1 overflow-y-auto p-[36px_44px]">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.01em] mb-1.5">Your workspaces</h1>
          <p className="text-[#8a8b9a] text-[13.5px] mb-[26px]">
            Pick up where you left off, or start something new.
          </p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-[18px]">
          {projects.map((project, idx) => {
            const tableCount = project.ir_state?.entities?.length ?? 0;
            const colors = COLOR_COMBOS[idx % COLOR_COMBOS.length];
            return (
              <div
                key={project.id}
                onClick={() => router.push(`/editor/${project.id}`)}
                className="bg-[#14161d] border border-white/[0.09] hover:border-white/[0.18] rounded-[12px] overflow-hidden cursor-pointer transition-all duration-150 hover:-translate-y-[3px] hover:shadow-[0_16px_34px_-16px_rgba(0,0,0,0.55)]"
              >
                <div className="h-[104px] relative bg-[#101219] overflow-hidden">
                  <div
                    className="absolute -inset-10"
                    style={{
                      backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1.2px, transparent 1.2px)',
                      backgroundSize: '18px 18px',
                    }}
                  />
                  <WorkspaceThumbSVG colorKeys={colors} />
                </div>
                <div className="p-[13px_14px_15px]">
                  <div className="font-mono text-[13px] font-semibold mb-1 truncate">{project.name}</div>
                  <div className="font-mono text-[11px] text-[#565766]">
                    {tableCount} {tableCount === 1 ? 'table' : 'tables'} · Updated{' '}
                    {formatRelativeTime(project.updated_at)}
                  </div>
                </div>
              </div>
            );
          })}

          {/* + New Workspace Card */}
          <div
            onClick={() => {
              setNewWorkspaceName('untitled-workspace');
              setIsCreateModalOpen(true);
            }}
            className="flex flex-col items-center justify-center gap-2 border border-dashed border-white/[0.09] hover:border-[#e08a3c]/40 rounded-[12px] min-h-[181px] text-[#565766] hover:text-[#e08a3c] text-[12.5px] cursor-pointer transition-all duration-150 hover:-translate-y-[3px]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New workspace
          </div>
        </div>
      </main>

      {/* Create Workspace Modal */}
      {isCreateModalOpen && (
        <div
          onClick={() => setIsCreateModalOpen(false)}
          className="fixed inset-0 bg-[#050508]/60 backdrop-blur-[3px] z-50 flex items-center justify-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[min(420px,92vw)] bg-[#14161d] border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-[16px_18px] border-b border-white/[0.09] flex items-center">
              <b className="text-[14px]">New workspace</b>
              <span className="text-[11.5px] text-[#565766] ml-2 font-mono">schema.graph</span>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="ml-auto w-[26px] h-[26px] rounded-full bg-white/[0.045] border border-white/[0.09] hover:border-white/20 flex items-center justify-center text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="p-[18px]">
              <div className="mb-4">
                <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Workspace name</label>
                <input
                  type="text"
                  autoFocus
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="e.g. acme-commerce"
                  className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-2.5 py-[9px] text-[#e8e8ee] text-[12.5px] font-mono outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-[13px] py-[7px] rounded-[7px] border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] text-[13px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-[13px] py-[7px] rounded-[7px] text-[13px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] hover:brightness-110 cursor-pointer"
                >
                  Create workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}