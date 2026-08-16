'use client';

import { useEffect, useRef, useState } from 'react';
import type { PersonSummary } from '@/lib/types';

type Hit = {
  person: PersonSummary;
  matchedName: string;
  matchedKind: string;
  relation: string | null;
};

/**
 * Search is the fastest way through a large family: type a name, land on them.
 * Any name finds them — Hebrew name, maiden name, nickname.
 */
export default function SearchBar({ onPick }: { onPick: (personId: string) => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 1) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((response) => response.json())
        .then((data) => {
          setHits(data.results ?? []);
          setActive(0);
          setOpen(true);
        });
    }, 130);
    return () => clearTimeout(timer);
  }, [query]);

  // "/" focuses search from anywhere, like every tool people already know.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA'].includes(target.tagName);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const choose = (hit: Hit) => {
    onPick(hit.person.id);
    setQuery('');
    setHits([]);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((current) => Math.min(current + 1, hits.length - 1));
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
          }
          if (event.key === 'Enter' && hits[active]) choose(hits[active]);
          if (event.key === 'Escape') setOpen(false);
        }}
        placeholder="Search for anyone in the family"
        aria-label="Search the family"
        role="combobox"
        aria-expanded={open}
        aria-controls="search-results"
        className="w-full rounded-full border border-stone-line bg-card px-5 py-3 text-[16px] text-ink placeholder:text-ink-faint focus:border-sage"
      />

      {open && hits.length > 0 && (
        <ul
          id="search-results"
          role="listbox"
          className="soft-scroll absolute left-0 right-0 top-full z-40 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-stone-line bg-card py-1.5 card-shadow"
        >
          {hits.map((hit, index) => (
            <li key={hit.person.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                onClick={() => choose(hit)}
                onMouseEnter={() => setActive(index)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  index === active ? 'bg-parchment' : ''
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] serif ${
                    hit.person.living ? 'bg-sage-soft text-sage-deep' : 'bg-parchment-deep text-ink-faint'
                  }`}
                >
                  {hit.person.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{hit.person.preferredName}</span>
                  <span className="block truncate text-[13px] text-ink-faint">
                    {[
                      hit.person.lifespan,
                      hit.relation && hit.relation !== 'You' ? `your ${hit.relation}` : hit.relation,
                      // Show why this person matched when it was not their main name.
                      hit.matchedKind !== 'preferred' && hit.matchedName !== hit.person.preferredName
                        ? `also known as ${hit.matchedName}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim().length > 0 && hits.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 rounded-2xl border border-stone-line bg-card px-4 py-3 text-[14px] text-ink-soft card-shadow">
          Nobody by that name yet.
        </div>
      )}
    </div>
  );
}
