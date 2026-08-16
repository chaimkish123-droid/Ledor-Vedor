'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SetupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/auth/setup', {
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

  const field = (key: keyof typeof form, label: string, type = 'text', autoComplete?: string, hint?: string) => (
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
      {hint && <span className="mt-1 block text-[12px] text-ink-faint">{hint}</span>}
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      {field('name', 'Your name', 'text', 'name')}
      {field('email', 'Email', 'email', 'email')}
      {field('password', 'Password', 'password', 'new-password', 'At least 8 characters.')}

      {error && <p className="text-[14px] text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-sage px-6 py-3.5 text-[16px] text-white transition-colors hover:bg-sage-deep disabled:opacity-60"
      >
        {busy ? 'Creating…' : 'Create the first account'}
      </button>

      <p className="pt-2 text-center text-[13px] text-ink-faint">
        You will be the family administrator, which means you can also restore anything that gets
        changed by mistake.
      </p>
    </form>
  );
}
