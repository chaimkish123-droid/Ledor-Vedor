'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { VISIBILITIES, VISIBILITY_LABELS, VISIBILITY_NOTES, type Visibility } from '@/lib/visibility-labels';

const LEGACY_KINDS = [
  { id: 'value', label: 'A value they stood for' },
  { id: 'lesson', label: 'Something we learned' },
  { id: 'saying', label: 'Something they always said' },
  { id: 'teaching', label: 'Something they taught' },
  { id: 'contribution', label: 'Something they gave' },
  { id: 'known_for', label: 'What they were known for' },
];

/**
 * Contributing is deliberately easy and deliberately separate: a memory is a
 * memory, a legacy is a legacy, and neither becomes a genealogical fact.
 */
export default function Contribute({ personId, personName }: { personId: string; personName: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'none' | 'memory' | 'legacy'>('none');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dateText, setDateText] = useState('');
  const [provenance, setProvenance] = useState('');
  const [kind, setKind] = useState('value');
  const [visibility, setVisibility] = useState<Visibility>('family');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstName = personName.split(' ')[0];

  const submit = async () => {
    setBusy(true);
    setError(null);
    const endpoint = mode === 'memory' ? '/api/memories' : '/api/legacy';
    const payload =
      mode === 'memory'
        ? { title, body, dateText, provenance, personIds: [personId], visibility }
        : { personId, kind, title, body, visibility };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setBusy(false);
    if (data.error) return setError(data.error);

    setMode('none');
    setTitle('');
    setBody('');
    setDateText('');
    setProvenance('');
    setVisibility('family');
    router.refresh();
  };

  if (mode === 'none') {
    return (
      <div className="mt-12 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('memory')}
          className="rounded-full border border-stone-line bg-card px-5 py-3 text-[15px] text-ink transition-colors hover:border-sage"
        >
          Add a memory of {firstName}
        </button>
        <button
          type="button"
          onClick={() => setMode('legacy')}
          className="rounded-full border border-stone-line bg-card px-5 py-3 text-[15px] text-ink transition-colors hover:border-sage"
        >
          Add to {firstName}&rsquo;s legacy
        </button>
      </div>
    );
  }

  return (
    <div className="mt-12 rounded-2xl border border-stone-line bg-card px-5 py-5">
      <h2 className="serif mb-4 text-[20px] text-ink">
        {mode === 'memory' ? `A memory of ${firstName}` : `${firstName}'s legacy`}
      </h2>

      {mode === 'legacy' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {LEGACY_KINDS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setKind(option.id)}
              className={`rounded-full border px-3.5 py-1.5 text-[14px] transition-colors ${
                kind === option.id ? 'border-sage bg-sage-soft text-sage-deep' : 'border-stone-line text-ink-soft'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label={mode === 'memory' ? 'Memory title' : 'Heading'}
          placeholder={mode === 'memory' ? 'Give it a title' : 'A short heading (optional)'}
          className="w-full rounded-lg border border-stone-line bg-parchment px-4 py-2.5 text-[16px] text-ink"
        />

        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={6}
          autoFocus
          aria-label={mode === 'memory' ? 'The memory' : 'What to pass on'}
          placeholder={
            mode === 'memory'
              ? `What do you remember about ${firstName}?`
              : `What should the next generation know about ${firstName}?`
          }
          className="w-full rounded-lg border border-stone-line bg-parchment px-4 py-3 text-[16px] leading-relaxed text-ink"
        />

        {mode === 'memory' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={dateText}
              onChange={(event) => setDateText(event.target.value)}
              aria-label="When this happened"
              placeholder="When was this? e.g. Summer 1972"
              className="rounded-lg border border-stone-line bg-parchment px-4 py-2.5 text-[15px] text-ink"
            />
            <input
              type="text"
              value={provenance}
              onChange={(event) => setProvenance(event.target.value)}
              aria-label="Where the memory came from"
              placeholder="Where it came from, e.g. As told to me by Mum"
              className="rounded-lg border border-stone-line bg-parchment px-4 py-2.5 text-[15px] text-ink"
            />
          </div>
        )}
      </div>

      {/* Who this is for. Everyone is the ordinary case and stays the default. */}
      <fieldset className="mt-5">
        <legend className="mb-2 text-[13px] uppercase tracking-wide text-ink-faint">Who is this for</legend>
        <div className="flex flex-wrap gap-2">
          {VISIBILITIES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={visibility === option}
              onClick={() => setVisibility(option)}
              className={`rounded-full border px-4 py-2 text-[14px] transition-colors ${
                visibility === option ? 'border-sage bg-sage-soft text-sage-deep' : 'border-stone-line text-ink-soft'
              }`}
            >
              {VISIBILITY_LABELS[option]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-ink-faint">{VISIBILITY_NOTES[visibility]}</p>
      </fieldset>

      {error && <p className="mt-3 text-[14px] text-red-700">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !body.trim()}
          className="rounded-full bg-sage px-6 py-3 text-[15px] text-white transition-colors hover:bg-sage-deep disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setMode('none')}
          className="rounded-full border border-stone-line px-5 py-3 text-[15px] text-ink transition-colors hover:border-ink-faint"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
