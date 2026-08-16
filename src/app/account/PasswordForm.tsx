'use client';

import { useState } from 'react';

export default function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next !== again) return setError('Those two do not match.');

    setBusy(true);
    setError(null);
    const response = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current, next }),
    });
    const data = await response.json();
    setBusy(false);
    if (data.error) return setError(data.error);

    setCurrent('');
    setNext('');
    setAgain('');
    setDone(true);
  };

  const field = (label: string, value: string, onChange: (value: string) => void, hint?: string) => (
    <label className="block">
      <span className="mb-1 block text-[13px] uppercase tracking-wide text-ink-faint">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(event) => {
          setDone(false);
          onChange(event.target.value);
        }}
        autoComplete={label === 'Current password' ? 'current-password' : 'new-password'}
        required
        className="w-full rounded-lg border border-stone-line bg-card px-4 py-3 text-[16px] text-ink"
      />
      {hint && <span className="mt-1 block text-[12px] text-ink-faint">{hint}</span>}
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      {field('Current password', current, setCurrent)}
      {field('New password', next, setNext, 'At least 8 characters.')}
      {field('Type it again', again, setAgain)}

      {error && <p className="text-[14px] text-red-700">{error}</p>}
      {done && <p className="text-[14px] text-sage-deep">Your password has been changed.</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-sage px-6 py-3 text-[16px] text-white transition-colors hover:bg-sage-deep disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Change it'}
      </button>
    </form>
  );
}
