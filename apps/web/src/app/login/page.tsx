'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
          });

    setLoading(false);

    if (error) showToast(error.message);
    else router.push('/dashboard');
  };

  const handleGitHubOAuth = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) showToast(error.message);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1.05fr_1fr] h-screen w-screen bg-[#0b0c10] text-[#e8e8ee]">
      {/* Left Visual Showcase */}
      <div className="hidden md:flex relative overflow-hidden bg-[#101219] border-r border-white/[0.09] flex-col justify-between p-[40px_46px]">
        <div
          className="absolute -inset-[2000px]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1.4px, transparent 1.4px)',
            backgroundSize: '26px 26px',
          }}
        />
        <div className="absolute w-[360px] h-[360px] rounded-full bg-[#e08a3c] -top-20 -left-20 blur-[70px] opacity-32 animate-drift" />
        <div className="absolute w-[320px] h-[320px] rounded-full bg-[#8b7ff0] -bottom-[100px] -right-[60px] blur-[70px] opacity-32 animate-drift-delayed" />

        <div className="relative z-10 flex items-center gap-2 font-semibold text-[15px]">
          <span className="w-5 h-5 flex-none">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
              <path d="M4 12 L12 4 L20 12 L12 20 Z" stroke="#e08a3c" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="2.3" fill="#e08a3c" />
            </svg>
          </span>
          Nexus
        </div>

        <div className="relative z-10">
          <h1 className="text-[clamp(28px,3.6vw,46px)] font-bold leading-[1.08] tracking-[-0.01em] mb-4 max-w-[480px]">
            Sketch it.
            <br />
            <span className="bg-gradient-to-r from-[#e08a3c] to-[#8b7ff0] bg-clip-text text-transparent">
              Ship the backend.
            </span>
          </h1>
          <p className="text-[#8a8b9a] max-w-[380px] text-[14.5px] leading-[1.65]">
            Design schemas, routes and relationships on a live canvas — Nexus
            compiles it straight into a running, production-ready API.
          </p>
        </div>

        <div className="relative z-10 text-[11.5px] text-[#565766] font-mono">
          Trusted by teams shipping on Postgres
        </div>
      </div>

      {/* Right Auth Form */}
      <div className="flex items-center justify-center p-10 overflow-y-auto">
        <div className="w-full max-w-[360px]">
          <form onSubmit={handleAuth} className="flex flex-col gap-[11px]">
            <h2 className="text-[22px] font-semibold tracking-[-0.01em]">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-[#8a8b9a] text-[13px] -mt-1 mb-1">
              {mode === 'login'
                ? 'Sign in to continue to your workspaces'
                : 'Start building in seconds — no credit card required'}
            </p>

            <button
              type="button"
              onClick={handleGitHubOAuth}
              className="flex items-center justify-center gap-2 p-2.5 rounded-[9px] border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] text-[13px] text-[#e8e8ee] transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-[15px] h-[15px]">
                <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.35 4.68-4.58 4.93.36.31.68.92.68 1.85v2.74c0 .26.18.58.69.48A10 10 0 0 0 12 2Z" />
              </svg>
              Continue with GitHub
            </button>

            <div className="flex items-center gap-2.5 text-[#565766] text-[11px] my-0.5 before:content-[''] before:flex-1 before:h-px before:bg-white/[0.09] after:content-[''] after:flex-1 after:h-px after:bg-white/[0.09]">
              <span>or continue with email</span>
            </div>

            {mode === 'signup' && (
              <>
                <label className="text-[11.5px] text-[#8a8b9a] -mb-1">Full name</label>
                <input
                  type="text"
                  placeholder="Ada Lovelace"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-3 py-2.5 text-[13px] text-[#e8e8ee] outline-none"
                />
              </>
            )}

            <label className="text-[11.5px] text-[#8a8b9a] -mb-1">Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-3 py-2.5 text-[13px] text-[#e8e8ee] outline-none"
            />

            <label className="text-[11.5px] text-[#8a8b9a] -mb-1">Password</label>
            <input
              type="password"
              placeholder={mode === 'login' ? '••••••••' : 'Create a password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-3 py-2.5 text-[13px] text-[#e8e8ee] outline-none"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1.5 p-[11px] rounded-[9px] text-[13.5px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] hover:brightness-110 disabled:opacity-50 flex items-center justify-center cursor-pointer transition-all"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>

            <p className="text-center text-[12.5px] text-[#8a8b9a] mt-1">
              {mode === 'login' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="text-[#e08a3c] font-semibold hover:underline cursor-pointer"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-[#e08a3c] font-semibold hover:underline cursor-pointer"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        </div>
      </div>

      {/* Toast */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#14161d] border border-[#e08a3c]/35 rounded-[10px] px-4 py-[11px] text-[12.5px] flex items-center gap-2.5 shadow-2xl transition-all duration-200 pointer-events-none ${
          toastMsg ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[15px] h-[15px] text-[#8fbf6b]">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <span>{toastMsg}</span>
      </div>
    </div>
  );
}