'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import dynamic from 'next/dynamic';
import { useArchitectureStore } from '../../../store/architectureStore';
import type { CanonicalIR } from '@zero-dollar/ir-core';

const DynamicCanvas = dynamic(() => import('../../../components/canvas/Canvas'), { 
  ssr: false,
  loading: () => (
    <div className="w-screen h-screen flex flex-col items-center justify-center gap-4 bg-[#0A0A0A]">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-white/50 font-mono tracking-widest uppercase">Mounting Canvas...</p>
    </div>
  )
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
    setSyncStatus 
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

      // Fetch the new columns alongside ir_state and name
      const { data, error } = await supabase
        .from('projects')
        .select('name, ir_state, chat_history, exported_repo_url')
        .eq('id', projectId)
        .single();

      if (error || !data) {
        console.error("Failed to load project:", error);
        router.push('/dashboard');
        return;
      }

      // Hydrate the Zustand store with all cloud state including project name
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
    
    // Wait 1.5 seconds after the user stops typing/dragging before saving
    const debounceTimer = setTimeout(async () => {
      // Push all state properties back to Supabase
      const { error } = await supabase
        .from('projects')
        .update({ 
          ir_state: present, 
          chat_history: chatHistory,
          exported_repo_url: exportedRepoUrl,
          updated_at: new Date().toISOString() 
        })
        .eq('id', projectId);

      if (error) {
        console.error("Sync failed:", error);
        setSyncStatus('error');
      } else {
        markClean();
      }
    }, 1500);

    return () => clearTimeout(debounceTimer);
  }, [present, chatHistory, exportedRepoUrl, isDirty, isLoading, projectId, supabase, markClean, setSyncStatus]);

  if (isLoading) {
    return (
      <div className="w-screen h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-4">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-white/50 font-mono tracking-widest uppercase">Loading Architecture...</p>
      </div>
    );
  }
  
  return <DynamicCanvas />;
}