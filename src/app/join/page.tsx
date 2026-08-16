'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({
    code: params.get('code') ?? '',
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/auth/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    setBusy(false);
    if (data.error) return setError(data.error);
    router.push('/onboarding');
    router.refresh();
  };

  const field = (key: keyof typeof form, label: string, type = 'text', autoComplete?: string) => (
    <label className="block">
      <span className="mb-1 block text-[13px] uppercase tracking-wide text-ink-faint">{label}</span>
      <input
        type={type}
        value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        autoComplete={autoComplete}
        required
        className="w-full rounded-lg border border-stone-line bg-card px-4 py-3 text-[16px] text-ink"
      />
    </label>
  );

  return (
    <div className="w-full max-w-sm fade-in">
      <Link href="/" className="mb-10 block text-center">
        <span className="hebrew serif text-3xl text-ink">לדור ודור</span>
      </Link>

      <h1 className="serif mb-2 text-center text-2xl text-ink">Join the family</h1>
      <p className="mb-6 text-center text-[15px] text-ink-soft">
        This is a private family space. You will need the invitation link a relative sent you.
      </p>

      <form onSubmit={submit} className="space-y-3">
        {field('code', 'Invitation code')}
        {field('name', 'Your name', 'text', 'name')}
        {field('email', 'Email', 'email', 'email')}
        {field('password', 'Choose a password', 'password', 'new-password')}

        {error && <p className="text-[14px] text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-sage px-6 py-3.5 text-[16px] text-white transition-colors hover:bg-sage-deep disabled:opacity-60"
        >
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>

      <p className="mt-6 text-center text-[14px] text-ink-soft">
        Already have an account? <Link href="/signin" className="text-sage underline underline-offset-2">Sign in</Link>
      </p>
    </div>
  );
}

export default function JoinPage() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <Suspense fallback={null}>
        <JoinForm />
      </Suspense>
    </main>
  );
}
