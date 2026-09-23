'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const handleAuth = async (action: 'login' | 'signup') => {
    setLoading(true);
    const { error } = action === 'login' 
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (error) alert(error.message);
    else router.push('/dashboard');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#111111] border border-white/10 rounded-xl p-6 shadow-2xl">
        <h1 className="text-2xl text-white mb-6" style={{ fontFamily: '"Canva Fatimi", "Inter", sans-serif' }}>
          Welcome Architect
        </h1>
        <div className="flex flex-col gap-4">
          <input 
            type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="bg-[#0A0A0A] border border-white/10 text-white px-4 py-2 rounded-md outline-none focus:border-indigo-500"
          />
          <input 
            type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            className="bg-[#0A0A0A] border border-white/10 text-white px-4 py-2 rounded-md outline-none focus:border-indigo-500"
          />
          <div className="flex gap-3 mt-2">
            <button onClick={() => handleAuth('login')} disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-md transition-colors">
              Login
            </button>
            <button onClick={() => handleAuth('signup')} disabled={loading} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-2 rounded-md transition-colors">
              Sign Up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}