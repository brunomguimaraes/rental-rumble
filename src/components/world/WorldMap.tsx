import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { MAP_SIZE, PLACE_LIST, placeById, type LocationId, type PlaceState } from '../../game/world';
import type { PlaceView } from '../../game/activity';
import { PixelIcon } from './PixelIcon';
import { STATE_GLYPH, STATE_LABEL, TRAINER } from './scene';

// The Hearthvale map: pixel art at 1×, 2× or 3× (whole pixels only), panned by
// dragging, the arrow keys, or the recenter button. Places are real buttons
// laid over the art; the pan position lives in the parent so it survives
// leaving the map and coming back.

export interface MapView {
  zoom: 1 | 2 | 3;
  x: number;
  y: number;
}

const ART = `${import.meta.env.BASE_URL}sprites/world/hearthvale.png`;
const FOG = `${import.meta.env.BASE_URL}sprites/world/fog.png`;
const DRAG_SLOP = 6;
const PAN_STEP = 48;

/** Keep the map covering the viewport (or centred when it is smaller). */
function clampView(v: MapView, vw: number, vh: number): MapView {
  const w = MAP_SIZE.width * v.zoom;
  const h = MAP_SIZE.height * v.zoom;
  const x = w <= vw ? Math.round((vw - w) / 2) : Math.min(0, Math.max(vw - w, v.x));
  const y = h <= vh ? Math.round((vh - h) / 2) : Math.min(0, Math.max(vh - h, v.y));
  return { zoom: v.zoom, x: Math.round(x), y: Math.round(y) };
}

function centredOn(point: { x: number; y: number }, zoom: MapView['zoom'], vw: number, vh: number): MapView {
  return clampView({ zoom, x: vw / 2 - point.x * zoom, y: vh / 2 - point.y * zoom }, vw, vh);
}

export function WorldMap({
  places,
  trainerAt,
  selected,
  view,
  onView,
  onSelect,
}: {
  places: readonly PlaceView[];
  trainerAt: LocationId;
  selected: LocationId | null;
  view: MapView | null;
  onView: (v: MapView) => void;
  onSelect: (id: LocationId) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<{ id: number; x0: number; y0: number; start: MapView; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const trainerPlace = placeById(trainerAt) ?? placeById('home');
  const trainerPoint = trainerPlace?.map ?? { x: MAP_SIZE.width / 2, y: MAP_SIZE.height / 2 };

  // First visit: centre the trainer. Later visits restore the saved view.
  useEffect(() => {
    if (size.w === 0) return;
    const next = view ? clampView(view, size.w, size.h) : centredOn(trainerPoint, 1, size.w, size.h);
    if (!view || next.x !== view.x || next.y !== view.y) onView(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  const v = view ?? { zoom: 1 as const, x: 0, y: 0 };
  const setView = (next: MapView) => onView(clampView(next, size.w, size.h));
  const zoomTo = (zoom: MapView['zoom']) => {
    // Keep the point under the viewport's centre where it is.
    const cx = size.w / 2;
    const cy = size.h / 2;
    const mx = (cx - v.x) / v.zoom;
    const my = (cy - v.y) / v.zoom;
    setView({ zoom, x: cx - mx * zoom, y: cy - my * zoom });
  };
  const zoomIn = () => v.zoom < 3 && zoomTo((v.zoom + 1) as MapView['zoom']);
  const zoomOut = () => v.zoom > 1 && zoomTo((v.zoom - 1) as MapView['zoom']);
  const recenter = () => onView(centredOn(trainerPoint, v.zoom, size.w, size.h));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, start: v, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
      // Only now take the pointer, so a plain tap still reaches a place button.
      d.moved = true;
      viewportRef.current?.setPointerCapture(e.pointerId);
    }
    setView({ ...d.start, x: d.start.x + dx, y: d.start.y + dy });
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) suppressClick.current = true;
    drag.current = null;
    if (viewportRef.current?.hasPointerCapture(e.pointerId)) viewportRef.current.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [PAN_STEP, 0],
      ArrowRight: [-PAN_STEP, 0],
      ArrowUp: [0, PAN_STEP],
      ArrowDown: [0, -PAN_STEP],
    };
    if (moves[e.key]) {
      e.preventDefault();
      setView({ ...v, x: v.x + moves[e.key][0], y: v.y + moves[e.key][1] });
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomIn();
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomOut();
    } else if (e.key === 'Home') {
      e.preventDefault();
      recenter();
    }
  };

  const stateOf = new Map(places.map((p) => [p.id, p.state]));
  const w = MAP_SIZE.width * v.zoom;
  const h = MAP_SIZE.height * v.zoom;

  return (
    <div>
      <div
        ref={viewportRef}
        tabIndex={0}
        role="group"
        aria-label="Hearthvale map. Drag or use the arrow keys to look around; plus and minus zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        onClickCapture={(e) => {
          // A drag that ended over a place must not also select it.
          if (suppressClick.current) {
            suppressClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        className="ui-focus relative h-[min(58dvh,520px)] min-h-[300px] w-full cursor-grab touch-none select-none overflow-hidden rounded-[3px] bg-slot active:cursor-grabbing"
      >
        <div className="absolute left-0 top-0" style={{ width: w, height: h, transform: `translate3d(${v.x}px, ${v.y}px, 0)` }}>
          <img
            src={ART}
            alt=""
            width={w}
            height={h}
            draggable={false}
            className="pointer-events-none block max-w-none [image-rendering:pixelated]"
          />

          {PLACE_LIST.map((place) => {
            const state = place.kind === 'home' ? null : (stateOf.get(place.id) ?? 'undiscovered');
            if (state !== 'undiscovered') return null;
            const r = 64 * v.zoom;
            return (
              <div
                key={`fog-${place.id}`}
                aria-hidden="true"
                className="pointer-events-none absolute [image-rendering:pixelated]"
                style={{
                  left: place.map.x * v.zoom - r,
                  top: place.map.y * v.zoom - r,
                  width: r * 2,
                  height: r * 2,
                  backgroundImage: `url(${FOG})`,
                  backgroundSize: `${32 * v.zoom}px ${32 * v.zoom}px`,
                  maskImage:
                    'radial-gradient(closest-side, #000 0 62%, rgb(0 0 0 / 0.7) 62% 80%, rgb(0 0 0 / 0.35) 80% 100%, transparent 100%)',
                }}
              />
            );
          })}

          {trainerPlace && (
            <img
              src={reduced ? TRAINER.still : TRAINER.walk}
              alt=""
              width={32}
              height={48}
              draggable={false}
              className="pointer-events-none absolute z-20 [image-rendering:pixelated]"
              style={{ left: trainerPoint.x * v.zoom + 10, top: trainerPoint.y * v.zoom - 52 }}
            />
          )}

          {PLACE_LIST.map((place) => {
            const home = place.kind === 'home';
            const state: PlaceState | null = home ? null : (stateOf.get(place.id) ?? 'undiscovered');
            const hidden = state === 'undiscovered';
            const label = hidden ? '???' : place.name;
            const isSelected = selected === place.id;
            const here = trainerPlace?.id === place.id;
            return (
              <button
                key={place.id}
                type="button"
                onClick={() => onSelect(place.id)}
                aria-pressed={isSelected}
                aria-label={`${hidden ? 'Undiscovered place' : place.name}${state ? `, ${STATE_LABEL[state]}` : ', your home town'}${here ? ', you are here' : ''}`}
                className="ui-focus absolute z-10 flex min-h-11 min-w-11 -translate-x-1/2 flex-col items-center"
                style={{ left: place.map.x * v.zoom, top: place.map.y * v.zoom - 14 }}
              >
                <span
                  className={`grid h-7 w-7 place-items-center rounded-[3px] border-2 ${
                    isSelected ? 'border-accent bg-window text-accent' : 'border-edge bg-window text-ink'
                  } ${here && !reduced ? 'animate-world-beacon' : ''} ${state === 'completed' ? 'text-accent' : ''}`}
                >
                  <PixelIcon name={home ? 'home' : STATE_GLYPH[state ?? 'undiscovered']} size={16} />
                </span>
                <span
                  className={`mt-0.5 whitespace-nowrap rounded-[2px] border border-edge px-1 font-label text-[8px] uppercase leading-[12px] ${
                    isSelected ? 'bg-accent text-edge' : 'bg-window text-ink'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Below the art, so the controls never cover a place. */}
      <div className="mt-2 flex items-center gap-2 px-1">
        <span className="mr-auto font-label text-[9px] uppercase text-ink-dim" aria-live="polite">
          Zoom {v.zoom}×
        </span>
        <button type="button" onClick={zoomOut} disabled={v.zoom <= 1} aria-label="Zoom out" className="ui-button ui-focus grid h-11 w-11 place-items-center font-label text-base">
          −
        </button>
        <button type="button" onClick={zoomIn} disabled={v.zoom >= 3} aria-label="Zoom in" className="ui-button ui-focus grid h-11 w-11 place-items-center font-label text-base">
          +
        </button>
        <button type="button" onClick={recenter} aria-label="Recenter on your trainer" className="ui-button ui-focus grid h-11 w-11 place-items-center">
          <PixelIcon name="flag" size={16} />
        </button>
      </div>
    </div>
  );
}
