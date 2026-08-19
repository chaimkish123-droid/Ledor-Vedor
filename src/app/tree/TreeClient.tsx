'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import FamilyCanvas from '@/components/canvas/FamilyCanvas';
import QuickView from '@/components/QuickView';
import SearchBar from '@/components/SearchBar';
import RelationshipFinder from '@/components/RelationshipFinder';
import AddRelative from '@/components/AddRelative';
import FamilyMenu from '@/components/FamilyMenu';
import type { CalendarPreference } from '@/lib/dates';
import type { GraphSlice, PersonSummary } from '@/lib/types';

type GraphResponse = {
  focusId: string;
  slice: GraphSlice;
  relations: Record<string, string>;
  focus: PersonSummary | null;
  recent: PersonSummary[];
  viewerPersonId: string | null;
};

type View = 'mine' | 'father' | 'mother' | 'spouse' | 'full';

const VIEWS: { id: View; label: string }[] = [
  { id: 'mine', label: 'My branch' },
  { id: 'father', label: "Father's side" },
  { id: 'mother', label: "Mother's side" },
  { id: 'spouse', label: "Spouse's side" },
  { id: 'full', label: 'Full family' },
];

export default function TreeClient({
  initialFocusId,
  viewerPersonId,
  userName,
  isAdmin,
}: {
  initialFocusId: string;
  viewerPersonId: string | null;
  userName: string;
  isAdmin: boolean;
}) {
  const [focusId, setFocusId] = useState(initialFocusId);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [depth, setDepth] = useState({ up: 2, down: 2 });
  const [view, setView] = useState<View>('mine');
  const [focusMode, setFocusMode] = useState(true);
  const [spacious, setSpacious] = useState(true);
  const [showFinder, setShowFinder] = useState(false);
  const [highlightPath, setHighlightPath] = useState<string[] | null>(null);
  const [adding, setAdding] = useState<{
    anchor: PersonSummary;
    relation: 'parent' | 'child' | 'sibling' | 'spouse';
    unionId?: string | null;
  } | null>(null);
  const [showViews, setShowViews] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<CalendarPreference>('gregorian');
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  // Bump this to make open panels refetch after a preference changes.
  const [prefVersion, setPrefVersion] = useState(0);

  /* --- Loading the visible slice ---------------------------------- */

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      focus: focusId,
      up: String(depth.up),
      down: String(depth.down),
      expand: expanded.join(','),
    });
    const response = await fetch(`/api/graph?${params}`);
    const payload = await response.json();
    if (!payload.error) setData(payload);
    setLoading(false);
  }, [focusId, depth.up, depth.down, expanded]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/prefs')
      .then((response) => response.json())
      .then((prefs) => {
        if (prefs?.calendar) setCalendar(prefs.calendar);
        if (prefs?.density) setSpacious(prefs.density !== 'compact');
        // Branches this viewer had open last time stay open.
        if (prefs?.expandedGroups?.length) setExpandedGroups(new Set<string>(prefs.expandedGroups));
        if (prefs?.expandedPeople?.length) setExpanded(prefs.expandedPeople);
        setPrefsLoaded(true);
      })
      .catch(() => setPrefsLoaded(true));
  }, []);

  // Remember what was opened, without a save on every single click.
  useEffect(() => {
    if (!prefsLoaded) return;
    const timer = setTimeout(() => {
      fetch('/api/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expandedGroups: JSON.stringify([...expandedGroups]),
          expandedPeople: JSON.stringify(expanded),
        }),
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [expandedGroups, expanded, prefsLoaded]);

  const changeCalendar = useCallback(async (value: CalendarPreference) => {
    setCalendar(value);
    setPrefVersion((current) => current + 1);
    await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendar: value }),
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  /* --- Moving around the family ----------------------------------- */

  const refocus = useCallback((personId: string) => {
    setFocusId(personId);
    setSelectedId(personId);
    setHighlightPath(null);
    setDepth({ up: 2, down: 2 });
  }, []);

  const goHome = useCallback(() => {
    if (viewerPersonId) {
      setView('mine');
      refocus(viewerPersonId);
    }
  }, [viewerPersonId, refocus]);

  /**
   * Views are perspectives on one graph, never separate trees: each simply
   * chooses a different starting point and depth.
   */
  const applyView = useCallback(
    async (next: View) => {
      setView(next);
      setShowViews(false);
      if (!viewerPersonId) return;

      if (next === 'mine') {
        setDepth({ up: 2, down: 2 });
        refocus(viewerPersonId);
        return;
      }
      if (next === 'full') {
        setDepth({ up: 4, down: 4 });
        setFocusMode(false);
        return;
      }

      const response = await fetch(`/api/person/${viewerPersonId}`);
      const detail = await response.json();

      const pick = () => {
        if (next === 'father') {
          return detail.parents?.find((p: any) => p.gender === 'male') ?? detail.parents?.[0];
        }
        if (next === 'mother') {
          return detail.parents?.find((p: any) => p.gender === 'female') ?? detail.parents?.[1] ?? detail.parents?.[0];
        }
        return detail.families?.find((f: any) => f.partner)?.partner;
      };

      const target = pick();
      if (target) {
        setDepth({ up: 3, down: 2 });
        refocus(target.id);
      } else {
        setToast(
          next === 'spouse'
            ? 'No spouse recorded yet. Add one from your own card.'
            : `No ${next === 'father' ? 'father' : 'mother'} recorded yet. You can add one from your own card.`,
        );
        setView('mine');
      }
    },
    [viewerPersonId, refocus],
  );

  const expandPerson = useCallback((personId: string, direction: 'up' | 'down') => {
    setExpanded((current) => (current.includes(personId) ? current : [...current, personId]));
    setDepth((current) =>
      direction === 'up' ? { ...current, up: current.up + 1 } : { ...current, down: current.down + 1 },
    );
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Keyboard: Escape closes whatever is open, "m" returns to me.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName);
      if (typing) return;
      if (event.key === 'Escape') {
        setSelectedId(null);
        setShowFinder(false);
        setShowViews(false);
        setHighlightPath(null);
      }
      if (event.key === 'm') goHome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goHome]);

  const focusPerson = data?.focus;
  const selectedPerson = selectedId && data ? data.slice.persons[selectedId] : null;

  const branchLabel = useMemo(() => {
    if (view !== 'mine') return VIEWS.find((v) => v.id === view)?.label ?? 'My branch';
    return focusId === viewerPersonId ? 'My branch' : focusPerson?.preferredName ?? 'My branch';
  }, [view, focusId, viewerPersonId, focusPerson]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Header: search first, because search is how a big family is navigated. */}
      <header className="z-30 flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-line bg-parchment/90 px-3 py-2.5 backdrop-blur-sm sm:gap-3 sm:px-5">
        <Link href="/" className="hidden shrink-0 items-center gap-2 sm:flex" title="L'Dor VaDor">
          <span className="hebrew serif text-[19px] text-ink">לדור ודור</span>
        </Link>

        <div className="order-3 w-full sm:order-none sm:w-auto sm:max-w-sm sm:flex-1">
          <SearchBar onPick={refocus} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Branch selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowViews((current) => !current)}
              aria-expanded={showViews}
              className="rounded-full border border-stone-line bg-card px-3.5 py-2 text-[14px] text-ink transition-colors hover:border-sage sm:px-4"
            >
              {branchLabel} <span aria-hidden className="text-ink-faint">▾</span>
            </button>
            {showViews && (
              <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-stone-line bg-card py-1.5 card-shadow">
                {VIEWS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => applyView(option.id)}
                    className={`block w-full px-4 py-2.5 text-left text-[15px] transition-colors hover:bg-parchment ${
                      view === option.id ? 'text-sage-deep' : 'text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                {data && data.recent.length > 0 && (
                  <>
                    <p className="mt-1.5 border-t border-stone-line px-4 pb-1 pt-2.5 text-[12px] uppercase tracking-wide text-ink-faint">
                      Recently viewed
                    </p>
                    {data.recent.slice(0, 5).map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => {
                          refocus(person.id);
                          setShowViews(false);
                        }}
                        className="block w-full truncate px-4 py-2 text-left text-[14px] text-ink-soft transition-colors hover:bg-parchment"
                      >
                        {person.preferredName}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={goHome}
            title="Back to me"
            className="rounded-full border border-stone-line bg-card px-3.5 py-2 text-[14px] text-ink transition-colors hover:border-sage"
          >
            Me
          </button>

          <button
            type="button"
            onClick={() => setShowFinder((current) => !current)}
            className="hidden rounded-full border border-stone-line bg-card px-4 py-2 text-[14px] text-ink transition-colors hover:border-sage sm:block"
          >
            How are we related?
          </button>

          <FamilyMenu
            userName={userName}
            calendar={calendar}
            isAdmin={isAdmin}
            onCalendarChange={changeCalendar}
          />
        </div>
      </header>

      {/* The canvas dominates everything. */}
      <main id="main" className="relative flex-1">
        {data && (
          <FamilyCanvas
            slice={data.slice}
            focusId={focusId}
            viewerPersonId={data.viewerPersonId}
            relations={data.relations}
            selectedId={selectedId}
            expandedGroups={expandedGroups}
            focusMode={focusMode}
            spacious={spacious}
            highlightPath={highlightPath}
            rightInset={selectedId ? 440 : 0}
            onSelect={setSelectedId}
            onRefocus={refocus}
            onToggleGroup={toggleGroup}
            onExpandPerson={expandPerson}
            anythingOpen={expandedGroups.size > 0 || expanded.length > 0}
            onFoldAll={() => {
              setExpandedGroups(new Set());
              setExpanded([]);
            }}
          />
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-ink-faint">Gathering the family…</p>
          </div>
        )}

        {/* View controls, bottom-left, out of the way. */}
        <div className="absolute bottom-5 left-4 flex flex-col items-start gap-1.5 sm:bottom-6 sm:left-6">
          <button
            type="button"
            onClick={() => setFocusMode((current) => !current)}
            aria-pressed={focusMode}
            className={`rounded-full border px-3.5 py-2 text-[13px] transition-colors ${
              focusMode ? 'border-sage bg-sage-soft text-sage-deep' : 'border-stone-line bg-card text-ink-soft'
            }`}
          >
            Focus mode {focusMode ? 'on' : 'off'}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !spacious;
              setSpacious(next);
              fetch('/api/prefs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ density: next ? 'spacious' : 'compact' }),
              });
            }}
            className="hidden rounded-full border border-stone-line bg-card px-3.5 py-2 text-[13px] text-ink-soft transition-colors hover:border-sage sm:block"
          >
            {spacious ? 'Spacious' : 'Compact'}
          </button>
          <button
            type="button"
            onClick={() => setShowFinder((current) => !current)}
            className="rounded-full border border-stone-line bg-card px-3.5 py-2 text-[13px] text-ink-soft transition-colors hover:border-sage sm:hidden"
          >
            How are we related?
          </button>
        </div>

        {highlightPath && (
          <button
            type="button"
            onClick={() => setHighlightPath(null)}
            className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-sage bg-card px-4 py-2 text-[14px] text-sage-deep card-shadow"
          >
            Showing the connection · clear
          </button>
        )}

        {toast && (
          <div className="absolute left-1/2 top-4 z-20 max-w-sm -translate-x-1/2 rounded-xl border border-stone-line bg-card px-4 py-2.5 text-center text-[14px] text-ink card-shadow">
            {toast}
          </div>
        )}
      </main>

      {selectedId && (
        <QuickView
          key={`${selectedId}:${prefVersion}`}
          personId={selectedId}
          onClose={() => setSelectedId(null)}
          onFocus={refocus}
          onSelect={setSelectedId}
          onAddRelative={(anchorId, relation, unionId) => {
            const anchor = data?.slice.persons[anchorId];
            if (anchor) setAdding({ anchor, relation, unionId });
          }}
          onChanged={load}
          isAdmin={isAdmin}
        />
      )}

      {showFinder && (
        <RelationshipFinder
          viewerPersonId={data?.viewerPersonId ?? null}
          initialTo={selectedId}
          onClose={() => setShowFinder(false)}
          onShowPath={setHighlightPath}
          onSelect={setSelectedId}
        />
      )}

      {adding && (
        <AddRelative
          anchor={adding.anchor}
          relation={adding.relation}
          unionId={adding.unionId}
          onClose={() => setAdding(null)}
          onCreated={async (personId) => {
            setAdding(null);
            // Reveal the new person immediately, in place.
            await load();
            setSelectedId(personId);
            setToast('Added to the family.');
          }}
        />
      )}

      {/* Add anyone, from anywhere. */}
      <button
        type="button"
        onClick={() => {
          const anchor = (selectedId && data?.slice.persons[selectedId]) || focusPerson;
          if (anchor) setAdding({ anchor, relation: 'child' });
        }}
        className="fixed bottom-5 right-[4.5rem] z-20 rounded-full bg-sage px-5 py-3 text-[15px] text-white card-shadow transition-colors hover:bg-sage-deep sm:bottom-6 sm:right-24"
      >
        + Add
      </button>
    </div>
  );
}
