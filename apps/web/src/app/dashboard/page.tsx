'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

interface Project {
  id: string;
  name: string;
  updated_at: string;
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  useEffect(() => {
    const fetchProjects = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .select('id, name, updated_at')
        .order('updated_at', { ascending: false });

      if (!error && data) setProjects(data);
      setIsLoading(false);
    };

    fetchProjects();
  }, [supabase, router]);

  const handleCreateProject = async () => {
    const name = prompt("Enter project name:", "Untitled Architecture");
    if (!name) return;

    const { data, error } = await supabase
      .from('projects')
      .insert([{ name, user_id: (await supabase.auth.getUser()).data.user?.id }])
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
    return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white p-12 selection:bg-indigo-500/30">
      <header className="flex justify-between items-center mb-16 max-w-6xl mx-auto">
        <h1 className="text-3xl tracking-wide" style={{ fontFamily: '"Canva Fatimi", "Inter", sans-serif' }}>
          Workspaces
        </h1>
        <div className="flex gap-4">
          <button 
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium text-white/50 hover:text-white transition-colors"
          >
            Sign Out
          </button>
          <button 
            onClick={handleCreateProject}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-sm font-medium rounded-md shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all"
          >
            + New Architecture
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {projects.map(project => (
          <div 
            key={project.id}
            onClick={() => router.push(`/editor/${project.id}`)}
            className="group relative h-48 bg-[#111111]/80 backdrop-blur-xl border border-white/5 hover:border-indigo-500/50 rounded-xl p-6 cursor-pointer transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
            <h2 className="text-lg font-medium text-white/90 mb-2 truncate group-hover:text-white transition-colors" style={{ fontFamily: '"Canva Fatimi", "Inter", sans-serif' }}>
              {project.name}
            </h2>
            <p className="text-xs text-white/40 font-mono">
              Last edited: {new Date(project.updated_at).toLocaleDateString()}
            </p>
          </div>
        ))}
        
        {projects.length === 0 && (
          <div className="col-span-full py-20 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
            <p className="text-white/40 font-mono text-sm">No projects found. Create one to begin.</p>
          </div>
        )}
      </main>
    </div>
  );
}