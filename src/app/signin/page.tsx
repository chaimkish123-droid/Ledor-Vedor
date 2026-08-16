'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    setBusy(false);
    if (data.error) return setError(data.error);
    router.push(data.onboarded ? '/tree' : '/onboarding');
    router.refresh();
  };

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm fade-in">
        <Link href="/" className="mb-10 block text-center">
          <span className="hebrew serif text-3xl text-ink">לדור ודור</span>
        </Link>

        <h1 className="serif mb-6 text-center text-2xl text-ink">Welcome back</h1>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[13px] uppercase tracking-wide text-ink-faint">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="w-full rounded-lg border border-stone-line bg-card px-4 py-3 text-[16px] text-ink"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] uppercase tracking-wide text-ink-faint">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-stone-line bg-card px-4 py-3 text-[16px] text-ink"
            />
          </label>

          {error && <p className="text-[14px] text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-sage px-6 py-3.5 text-[16px] text-white transition-colors hover:bg-sage-deep disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-[14px] text-ink-soft">
          Been invited? <Link href="/join" className="text-sage underline underline-offset-2">Join the family</Link>
        </p>

        <div className="mt-10 rounded-xl border border-stone-line bg-card px-4 py-3 text-center text-[13px] text-ink-soft">
          <p className="mb-1 text-ink">Try the demonstration family</p>
          <p>demo@ldorvador.family · family</p>
        </div>
      </div>
    </main>
  );
}
