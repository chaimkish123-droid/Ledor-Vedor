'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ResetForm({ code }: { code: string }) {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Check the link before asking them to type anything, so a dead link says so
  // straight away rather than after they have chosen a password.
  useEffect(() => {
    fetch(`/api/auth/reset?code=${encodeURIComponent(code)}`)
      .then((response) => response.json())
      .then((data) => (data.error ? setProblem(data.error) : setName(data.displayName)));
  }, [code]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== again) return setError('Those two do not match.');

    setBusy(true);
    setError(null);
    const response = await fetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, password }),
    });
    const data = await response.json();
    setBusy(false);
    if (data.error) return setError(data.error);

    router.push('/tree');
    router.refresh();
  };

  if (problem) {
    return (
      <div className="text-center">
        <h1 className="serif mb-2 text-2xl text-ink">That link will not work</h1>
        <p className="mb-6 text-[16px] leading-relaxed text-ink-soft">{problem}</p>
        <Link href="/signin" className="text-[15px] text-sage underline underline-offset-2">
          Back to signing in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="serif mb-2 text-center text-2xl text-ink">
        {name ? `Welcome back, ${name.split(' ')[0]}` : 'Choose a new password'}
      </h1>
      <p className="mb-8 text-center text-[15px] leading-relaxed text-ink-soft">
        Choose a new password and you will be signed straight in. Anywhere you were signed in before
        will be signed out.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[13px] uppercase tracking-wide text-ink-faint">New password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            autoFocus
            className="w-full rounded-lg border border-stone-line bg-card px-4 py-3 text-[16px] text-ink"
          />
          <span className="mt-1 block text-[12px] text-ink-faint">At least 8 characters.</span>
        </label>

        <label className="block">
          <span className="mb-1 block text-[13px] uppercase tracking-wide text-ink-faint">Type it again</span>
          <input
            type="password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
            autoComplete="new-password"
            required
            className="w-full rounded-lg border border-stone-line bg-card px-4 py-3 text-[16px] text-ink"
          />
        </label>

        {error && <p className="text-[14px] text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy || !name}
          className="w-full rounded-full bg-sage px-6 py-3.5 text-[16px] text-white transition-colors hover:bg-sage-deep disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save it and take me in'}
        </button>
      </form>
    </>
  );
}
