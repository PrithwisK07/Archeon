'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import dynamic from 'next/dynamic';
import { useArchitectureStore } from '../../../store/architectureStore';
import type { CanonicalIR } from '@zero-dollar/ir-core';

function NexusLoadingScreen({ label }: { label: string }) {
  return (
    <div className="w-screen h-screen bg-[#0b0c10] text-[#e8e8ee] flex flex-col items-center justify-center gap-4 relative overflow-hidden select-none">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1.4px, transparent 1.4px)',
          backgroundSize: '26px 26px',
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-3.5 bg-[#14161d] border border-white/[0.09] px-7 py-6 rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.7)]">
        <div className="relative flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-[#e08a3c]/25 border-t-[#e08a3c] animate-spin" />
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 absolute">
            <path d="M4 12 L12 4 L20 12 L12 20 Z" stroke="#e08a3c" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="2.3" fill="#e08a3c" />
          </svg>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[13px] font-semibold tracking-[0.2px]">Nexus Studio</span>
          <span className="text-[11px] text-[#8a8b9a] font-mono">{label}</span>
        </div>
      </div>
    </div>
  );
}

const DynamicCanvas = dynamic(() => import('../../../components/canvas/Canvas'), {
  ssr: false,
  loading: () => <NexusLoadingScreen label="Mounting schema.graph…" />,
});

export default function EditorPage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  const {
    present,
    chatHistory,
    exportedRepoUrl,
    isDirty,
    loadProjectState,
    markClean,
    setSyncStatus,
  } = useArchitectureStore();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  // 1. Initial Data Fetch (Hydration)
  useEffect(() => {
    const fetchProject = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .select('name, ir_state, chat_history, exported_repo_url')
        .eq('id', projectId)
        .single();

      if (error || !data) {
        console.error('Failed to load project:', error);
        router.push('/dashboard');
        return;
      }

      loadProjectState(
        data.ir_state as CanonicalIR,
        data.chat_history,
        data.exported_repo_url,
        data.name
      );
      setIsLoading(false);
    };

    fetchProject();
  }, [projectId, supabase, router, loadProjectState]);

  // 2. Debounced Background Sync
  useEffect(() => {
    if (!isDirty || isLoading) return;

    setSyncStatus('syncing');

    const debounceTimer = setTimeout(async () => {
      const { error } = await supabase
        .from('projects')
        .update({
          ir_state: present,
          chat_history: chatHistory,
          exported_repo_url: exportedRepoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);

      if (error) {
        console.error('Sync failed:', error);
        setSyncStatus('error');
      } else {
        markClean();
      }
    }, 1500);

    return () => clearTimeout(debounceTimer);
  }, [
    present,
    chatHistory,
    exportedRepoUrl,
    isDirty,
    isLoading,
    projectId,
    supabase,
    markClean,
    setSyncStatus,
  ]);

  if (isLoading) {
    return <NexusLoadingScreen label="Hydrating workspace state…" />;
  }

  return <DynamicCanvas />;
}