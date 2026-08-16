'use client';

import { useEffect, useState } from 'react';
import type { PersonSummary } from '@/lib/types';

type PathStep = { person: PersonSummary; via: string; label: string };
type Result = {
  from: PersonSummary;
  to: PersonSummary;
  sentence: string;
  paths: { length: number; steps: PathStep[] }[];
};

/**
 * "How am I related to this person?" — answered in a sentence, then shown
 * as the actual route through the family.
 */
export default function RelationshipFinder({
  viewerPersonId,
  initialTo,
  onClose,
  onShowPath,
  onSelect,
}: {
  viewerPersonId: string | null;
  initialTo?: string | null;
  onClose: () => void;
  onShowPath: (personIds: string[] | null) => void;
  onSelect: (personId: string) => void;
}) {
  const [fromId, setFromId] = useState<string | null>(viewerPersonId);
  const [toId, setToId] = useState<string | null>(initialTo ?? null);
  const [result, setResult] = useState<Result | null>(null);
  const [pathIndex, setPathIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fromId || !toId) {
      setResult(null);
      onShowPath(null);
      return;
    }
    fetch(`/api/relationship?from=${fromId}&to=${toId}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setResult(null);
        } else {
          setError(null);
          setResult(data);
          setPathIndex(0);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, toId]);

  const showPath = (index: number) => {
    setPathIndex(index);
    const path = result?.paths[index];
    onShowPath(path ? path.steps.map((step) => step.person.id) : null);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-line bg-card px-5 pb-6 pt-4 panel-shadow sheet-in md:inset-x-auto md:bottom-6 md:left-6 md:w-[420px] md:rounded-2xl md:border">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="serif text-[19px] text-ink">How are we related?</h2>
        <button
          type="button"
          onClick={() => {
            onShowPath(null);
            onClose();
          }}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-faint hover:bg-parchment hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2">
        <PersonPicker label="From" personId={fromId} onPick={setFromId} youId={viewerPersonId} />
        <PersonPicker label="To" personId={toId} onPick={setToId} youId={viewerPersonId} />
      </div>

      {error && <p className="mt-3 text-[14px] text-red-700">{error}</p>}

      {result && (
        <div className="mt-4 border-t border-stone-line pt-4">
          <p className="serif text-[18px] leading-snug text-ink">{result.sentence}</p>

          {result.paths.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => showPath(pathIndex)}
                className="mt-2 text-[14px] text-sage transition-colors hover:text-sage-deep"
              >
                Show the connection on the tree →
              </button>

              <ol className="mt-3 space-y-1">
                {result.paths[pathIndex].steps.map((step, index) => (
                  <li key={`${step.person.id}-${index}`} className="flex items-baseline gap-2">
                    <span aria-hidden className="text-ink-faint">
                      {index === 0 ? '•' : '↳'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelect(step.person.id)}
                      className="text-left text-[15px] text-ink hover:text-sage-deep"
                    >
                      {step.person.preferredName}
                      {index > 0 && <span className="text-ink-faint"> — {step.label}</span>}
                    </button>
                  </li>
                ))}
              </ol>

              {result.paths.length > 1 && (
                <div className="mt-3 text-[14px] text-ink-soft">
                  <p>Another family connection exists.</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {result.paths.map((path, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => showPath(index)}
                        className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
                          index === pathIndex ? 'border-sage text-sage-deep' : 'border-stone-line text-ink-soft'
                        }`}
                      >
                        {index === 0 ? 'Closest' : `Path ${index + 1}`} · {path.length} steps
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PersonPicker({
  label,
  personId,
  onPick,
  youId,
}: {
  label: string;
  personId: string | null;
  onPick: (id: string) => void;
  youId: string | null;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ person: PersonSummary }[]>([]);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!personId) {
      setName(null);
      return;
    }
    fetch(`/api/person/${personId}`)
      .then((response) => response.json())
      .then((data) => setName(data?.person?.preferredName ?? null));
  }, [personId]);

  useEffect(() => {
    if (query.trim().length < 1) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((response) => response.json())
        .then((data) => setHits(data.results ?? []));
    }, 130);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-[13px] uppercase tracking-wide text-ink-faint">{label}</span>
        {name && !query ? (
          <button
            type="button"
            onClick={() => setQuery(' ')}
            className="flex-1 rounded-lg border border-stone-line bg-parchment px-3 py-2 text-left text-[15px] text-ink"
          >
            {name}
            {personId === youId && <span className="text-sage"> · you</span>}
          </button>
        ) : (
          <input
            type="text"
            value={query.trim()}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a person"
            aria-label={`${label} person`}
            className="flex-1 rounded-lg border border-stone-line bg-parchment px-3 py-2 text-[15px] text-ink"
          />
        )}
      </div>

      {query.trim() && hits.length > 0 && (
        <ul className="absolute left-12 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-stone-line bg-card py-1 card-shadow">
          {hits.map((hit) => (
            <li key={hit.person.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(hit.person.id);
                  setQuery('');
                }}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-parchment"
              >
                <span className="text-[15px] text-ink">{hit.person.preferredName}</span>
                <span className="text-[13px] text-ink-faint">{hit.person.lifespan}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
