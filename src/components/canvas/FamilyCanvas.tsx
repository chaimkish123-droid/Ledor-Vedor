'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GraphSlice } from '@/lib/types';
import PersonCard from './PersonCard';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  descentPath,
  layoutFamily,
  type LayoutNode,
} from './layout';

type Props = {
  slice: GraphSlice;
  focusId: string;
  viewerPersonId: string | null;
  relations: Record<string, string>;
  selectedId: string | null;
  expandedGroups: Set<string>;
  /** Focus Mode dims branches outside the selected person's context. */
  focusMode: boolean;
  spacious: boolean;
  /** Highlighted route from the Relationship Finder. */
  highlightPath: string[] | null;
  /** Width of the side panel, so centring uses the space actually visible. */
  rightInset: number;
  onSelect: (personId: string) => void;
  onRefocus: (personId: string) => void;
  onToggleGroup: (key: string) => void;
  onExpandPerson: (personId: string, direction: 'up' | 'down') => void;
};

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.9;

export default function FamilyCanvas({
  slice,
  focusId,
  viewerPersonId,
  relations,
  selectedId,
  expandedGroups,
  focusMode,
  spacious,
  highlightPath,
  rightInset,
  onSelect,
  onRefocus,
  onToggleGroup,
  onExpandPerson,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 1200, height: 800 });
  const [transform, setTransform] = useState({ x: 0, y: 0, zoom: 1 });
  const [dragging, setDragging] = useState(false);
  const [animate, setAnimate] = useState(true);
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pinchState = useRef<{ distance: number; zoom: number } | null>(null);

  const layout = useMemo(
    () => layoutFamily(slice, focusId, { expandedGroups, spacious, collapseAfter: 6 }),
    [slice, focusId, expandedGroups, spacious],
  );

  /* --- Focus Mode: who stays bright ------------------------------- */

  const contextIds = useMemo(() => {
    const anchor = selectedId ?? focusId;
    const keep = new Set<string>([anchor]);

    const parents = slice.parentEdges.filter((e) => e.childId === anchor).map((e) => e.parentId);
    const children = slice.parentEdges.filter((e) => e.parentId === anchor).map((e) => e.childId);
    const spouses = Object.values(slice.unions)
      .filter((u) => u.partnerIds.includes(anchor))
      .flatMap((u) => u.partnerIds);

    for (const id of [...parents, ...children, ...spouses]) keep.add(id);

    // The marriage this person actually came from is the one that matters to
    // them. A parent's other marriages stay on the canvas but recede — the data
    // treats every marriage equally, only the view has a point of view.
    const originUnionIds = new Set(
      slice.parentEdges.filter((e) => e.childId === anchor && e.unionId).map((e) => e.unionId as string),
    );

    for (const parentId of parents) {
      for (const edge of slice.parentEdges.filter((e) => e.parentId === parentId)) {
        // Full siblings and half-siblings from this marriage.
        if (!edge.unionId || originUnionIds.size === 0 || originUnionIds.has(edge.unionId)) {
          keep.add(edge.childId);
        }
      }
      for (const union of Object.values(slice.unions)) {
        const relevant = originUnionIds.size === 0 || originUnionIds.has(union.id);
        if (relevant && union.partnerIds.includes(parentId)) {
          for (const pid of union.partnerIds) keep.add(pid);
        }
      }
      // Grandparents keep the anchor's place in the wider family legible.
      for (const edge of slice.parentEdges.filter((e) => e.childId === parentId)) keep.add(edge.parentId);
    }
    // Grandchildren.
    for (const childId of children) {
      for (const edge of slice.parentEdges.filter((e) => e.parentId === childId)) keep.add(edge.childId);
    }
    // Spouses of children, so a child's family reads as a family.
    for (const childId of children) {
      for (const union of Object.values(slice.unions)) {
        if (union.partnerIds.includes(childId)) for (const pid of union.partnerIds) keep.add(pid);
      }
    }

    return keep;
  }, [slice, selectedId, focusId]);

  const highlighted = useMemo(() => (highlightPath ? new Set(highlightPath) : null), [highlightPath]);

  const isDimmed = useCallback(
    (personId: string) => {
      if (highlighted) return !highlighted.has(personId);
      if (!focusMode) return false;
      return !contextIds.has(personId);
    },
    [focusMode, contextIds, highlighted],
  );

  /* --- Viewport and centring -------------------------------------- */

  // Measure before first paint: centring on the focus person with a guessed
  // viewport is what leaves the tree sitting off to one side.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0) setViewport({ width: rect.width, height: rect.height });

    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /**
   * Settle the view on the focus person, zooming out only as far as needed to
   * bring the loaded family into view. Once the viewer pans or zooms by hand,
   * their view is theirs to keep until they move to someone new.
   */
  const settle = useCallback(() => {
    const inset = viewport.width >= 768 ? rightInset : 0;
    const usableWidth = Math.max(320, viewport.width - inset);

    // Fit the focus person's immediate family, not the whole slice: a wide
    // branch of nine cousins must never shrink the names to nothing. Anything
    // beyond stays one gesture away.
    const close = new Set<string>([focusId]);
    for (const edge of slice.parentEdges) {
      if (edge.childId === focusId) close.add(edge.parentId);
      if (edge.parentId === focusId) close.add(edge.childId);
    }
    for (const union of Object.values(slice.unions)) {
      if (union.partnerIds.includes(focusId)) for (const pid of union.partnerIds) close.add(pid);
    }
    // Siblings, so the focus person's own row reads as a row.
    for (const edge of slice.parentEdges) {
      if (close.has(edge.parentId) && edge.parentId !== focusId) close.add(edge.childId);
    }

    const relevant = layout.nodes.filter((node) => close.has(node.id));
    const box = (relevant.length ? relevant : layout.nodes).reduce(
      (acc, node) => ({
        minX: Math.min(acc.minX, node.x),
        maxX: Math.max(acc.maxX, node.x + node.width),
        minY: Math.min(acc.minY, node.y),
        maxY: Math.max(acc.maxY, node.y + node.height),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );

    const contentWidth = box.maxX - box.minX + 140;
    const contentHeight = box.maxY - box.minY + 140;

    const fit = Math.min(usableWidth / contentWidth, viewport.height / contentHeight, 1);
    // Readable names matter more than seeing everyone at once, though a phone
    // is allowed to pull back further before it gives up on context.
    const floor = viewport.width < 768 ? 0.5 : 0.62;
    const zoom = Math.max(floor, Math.min(1, fit));

    setTransform({
      x: usableWidth / 2 - layout.focusPoint.x * zoom,
      y: viewport.height / 2 - layout.focusPoint.y * zoom,
      zoom,
    });
  }, [viewport.width, viewport.height, rightInset, layout.nodes, layout.focusPoint, slice, focusId]);

  const hasPanned = useRef(false);
  const settledFor = useRef<string | null>(null);

  useEffect(() => {
    if (viewport.width < 10) return;
    const movedToSomeoneNew = settledFor.current !== focusId;
    if (!movedToSomeoneNew && hasPanned.current) return;

    settledFor.current = focusId;
    if (movedToSomeoneNew) hasPanned.current = false;
    setAnimate(true);
    settle();
  }, [focusId, viewport.width, viewport.height, rightInset, settle]);

  /* --- Pan, zoom, keyboard ---------------------------------------- */

  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('button')) return;
    setAnimate(false);
    setDragging(true);
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragState.current) return;
    hasPanned.current = true;
    setTransform((current) => ({
      ...current,
      x: dragState.current!.originX + (event.clientX - dragState.current!.startX),
      y: dragState.current!.originY + (event.clientY - dragState.current!.startY),
    }));
  };

  const endDrag = () => {
    dragState.current = null;
    setDragging(false);
  };

  const zoomBy = useCallback(
    (factor: number, origin?: { x: number; y: number }) => {
      hasPanned.current = true;
      setAnimate(false);
      setTransform((current) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor));
        const point = origin ?? { x: viewport.width / 2, y: viewport.height / 2 };
        const scale = zoom / current.zoom;
        return {
          zoom,
          x: point.x - (point.x - current.x) * scale,
          y: point.y - (point.y - current.y) * scale,
        };
      });
    },
    [viewport.width, viewport.height],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      if (!element.contains(event.target as Node)) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const origin = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      if (event.ctrlKey || event.metaKey) {
        zoomBy(event.deltaY < 0 ? 1.08 : 0.93, origin);
      } else {
        hasPanned.current = true;
        setAnimate(false);
        setTransform((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
      }
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const onTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    if (!pinchState.current) {
      pinchState.current = { distance, zoom: transform.zoom };
      return;
    }
    const rect = containerRef.current!.getBoundingClientRect();
    const origin = {
      x: (a.clientX + b.clientX) / 2 - rect.left,
      y: (a.clientY + b.clientY) / 2 - rect.top,
    };
    const target = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, pinchState.current.zoom * (distance / pinchState.current.distance)),
    );
    zoomBy(target / transform.zoom, origin);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 200 : 80;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[event.key]) {
      event.preventDefault();
      hasPanned.current = true;
      setAnimate(true);
      const [dx, dy] = moves[event.key];
      setTransform((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    }
    if (event.key === '+' || event.key === '=') zoomBy(1.15);
    if (event.key === '-' || event.key === '_') zoomBy(0.87);
    if (event.key === '0') {
      setAnimate(true);
      hasPanned.current = false;
      settle();
    }
  };

  /* --- Expansion affordances -------------------------------------- */

  const frontierChips = useMemo(() => {
    const chips: { id: string; x: number; y: number; label: string; onClick: () => void; title: string }[] = [];

    // A couple shares their children, so only one of the two offers to show them.
    const spokenForByUnion = new Set<string>();
    const ordered = layout.nodes.filter((n) => n.kind === 'person').sort((a, b) => a.x - b.x);

    for (const node of ordered) {
      if (node.kind !== 'person') continue;
      const frontier = slice.frontier[node.id];
      if (!frontier) continue;

      const partnerHasIt = Object.values(slice.unions).some(
        (union) => union.partnerIds.includes(node.id) && spokenForByUnion.has(union.id),
      );
      if (frontier.moreDown && !partnerHasIt) {
        for (const union of Object.values(slice.unions)) {
          if (union.partnerIds.includes(node.id)) spokenForByUnion.add(union.id);
        }
      }

      // Parents that exist but are not on screen.
      if (frontier.moreUp) {
        chips.push({
          id: `up:${node.id}`,
          x: node.x + CARD_WIDTH / 2 - 42,
          y: node.y - 34,
          label: 'Parents ↑',
          title: `Show ${slice.persons[node.id].preferredName}'s parents`,
          onClick: () => onExpandPerson(node.id, 'up'),
        });
      }
      // Children that exist but are not on screen.
      if (frontier.moreDown && !partnerHasIt) {
        chips.push({
          id: `down:${node.id}`,
          x: node.x + CARD_WIDTH / 2 - 52,
          y: node.y + CARD_HEIGHT + 10,
          label: `${frontier.children} ${frontier.children === 1 ? 'child' : 'children'} ↓`,
          title: `Show ${slice.persons[node.id].preferredName}'s children`,
          onClick: () => onExpandPerson(node.id, 'down'),
        });
      }
    }
    return chips;
  }, [layout.nodes, slice, onExpandPerson]);

  const strokeFor = (childId: string, parentIds: string[]) => {
    if (!highlighted) return undefined;
    return highlighted.has(childId) && parentIds.some((p) => highlighted.has(p)) ? 'highlight' : 'dim';
  };

  return (
    <div
      ref={containerRef}
      className={`canvas-field relative h-full w-full overflow-hidden ${dragging ? 'canvas-moving' : 'cursor-grab'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onTouchMove={onTouchMove}
      onTouchEnd={() => (pinchState.current = null)}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="application"
      aria-label="Family tree canvas. Use arrow keys to move around, plus and minus to zoom, and 0 to return to the centre."
    >
      <div
        className={animate ? 'tree-move absolute left-0 top-0' : 'absolute left-0 top-0'}
        style={{
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {/* Connecting lines sit beneath the cards. */}
        <svg
          className="pointer-events-none absolute overflow-visible"
          style={{ left: 0, top: 0, width: 1, height: 1 }}
          aria-hidden
        >
          {layout.descentLines.map((line) => {
            const state = strokeFor(line.childId, line.parentIds);
            return (
              <path
                key={line.id}
                d={descentPath(line)}
                fill="none"
                stroke={state === 'highlight' ? 'var(--color-sage)' : 'var(--color-stone-line)'}
                strokeWidth={state === 'highlight' ? 2.5 : 1.5}
                strokeOpacity={state === 'dim' ? 0.3 : 1}
                strokeDasharray={line.kind === 'adoptive' || line.kind === 'step' ? '5 5' : undefined}
                className="node-move"
              />
            );
          })}

          {layout.unionLines.map((line) => {
            const state = highlighted
              ? line.partnerIds.every((p) => highlighted.has(p))
                ? 'highlight'
                : 'dim'
              : undefined;
            const dimmedUnion = focusMode && !line.partnerIds.some((p) => contextIds.has(p));
            const opacity = state === 'dim' ? 0.3 : dimmedUnion ? 0.35 : 1;

            return (
              <g key={line.unionId} className="node-move" opacity={opacity}>
                <line
                  x1={line.fromX}
                  y1={line.y}
                  x2={line.toX}
                  y2={line.y}
                  stroke={state === 'highlight' ? 'var(--color-sage)' : 'var(--color-stone-line)'}
                  strokeWidth={state === 'highlight' ? 2.5 : 1.5}
                  // A marriage that ended is drawn as a broken line, and also
                  // stated in words in the person's panel.
                  strokeDasharray={line.status === 'divorced' || line.status === 'separated' ? '6 5' : undefined}
                />
                <circle
                  cx={line.junctionX}
                  cy={line.junctionY}
                  r={5}
                  fill={state === 'highlight' ? 'var(--color-sage)' : 'var(--color-parchment)'}
                  stroke={state === 'highlight' ? 'var(--color-sage)' : 'var(--color-ink-faint)'}
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
        </svg>

        {/* Cards */}
        {layout.nodes.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            slice={slice}
            relations={relations}
            focusId={focusId}
            viewerPersonId={viewerPersonId}
            selectedId={selectedId}
            dimmed={node.kind === 'person' ? isDimmed(node.id) : false}
            onSelect={onSelect}
            onRefocus={onRefocus}
            onToggleGroup={onToggleGroup}
          />
        ))}

        {/* Expansion affordances: the family always continues somewhere. */}
        {frontierChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={chip.onClick}
            title={chip.title}
            className="node-move absolute whitespace-nowrap rounded-full border border-stone-line bg-card/90 px-3 py-1 text-[12px] text-ink-soft backdrop-blur-sm transition-colors hover:border-sage hover:text-sage-deep"
            style={{ left: chip.x, top: chip.y }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Zoom controls — large targets, always in the same place. */}
      <div className="absolute bottom-5 right-4 flex flex-col gap-1.5 sm:bottom-6 sm:right-6">
        <CanvasButton label="Zoom in" onClick={() => zoomBy(1.2)}>
          +
        </CanvasButton>
        <CanvasButton label="Zoom out" onClick={() => zoomBy(0.83)}>
          −
        </CanvasButton>
        <CanvasButton
          label="Centre the tree"
          onClick={() => {
            setAnimate(true);
            hasPanned.current = false;
            settle();
          }}
        >
          ⊙
        </CanvasButton>
      </div>
    </div>
  );
}

function CanvasButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-line bg-card text-lg text-ink-soft card-shadow transition-colors hover:border-sage hover:text-sage-deep"
    >
      {children}
    </button>
  );
}

function NodeView({
  node,
  slice,
  relations,
  focusId,
  viewerPersonId,
  selectedId,
  dimmed,
  onSelect,
  onRefocus,
  onToggleGroup,
}: {
  node: LayoutNode;
  slice: GraphSlice;
  relations: Record<string, string>;
  focusId: string;
  viewerPersonId: string | null;
  selectedId: string | null;
  dimmed: boolean;
  onSelect: (id: string) => void;
  onRefocus: (id: string) => void;
  onToggleGroup: (key: string) => void;
}) {
  if (node.kind === 'more') {
    return (
      <button
        type="button"
        onClick={() => onToggleGroup(`${node.parentId}:${node.unionId ?? 'none'}`)}
        className="node-move absolute flex items-center justify-center whitespace-nowrap rounded-full border border-dashed border-stone-line bg-card/80 text-[13px] text-ink-soft transition-colors hover:border-sage hover:text-sage-deep"
        style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
        aria-label={`Show ${node.count} more ${node.count === 1 ? 'person' : 'people'} in this family`}
      >
        + {node.count} more
      </button>
    );
  }

  const person = slice.persons[node.id];
  if (!person) return null;

  return (
    <div
      className="node-move absolute"
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
    >
      <PersonCard
        person={person}
        relation={relations[node.id]}
        isFocus={node.id === focusId}
        isViewer={node.id === viewerPersonId}
        isSelected={node.id === selectedId}
        dimmed={dimmed}
        onSelect={onSelect}
        onOpen={onRefocus}
      />
    </div>
  );
}
