import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ballUrl } from '../../game/balls';
import { itemById } from '../../game/items';
import { asAltColor, asShiny, CREATURES_BY_ID, spriteUrl } from '../../game/pokemon';
import type { CaptureBallId, RouteCatch, RouteEvent } from '../../game/route-actions';
import { PixelSprite } from '../ui/PixelSprite';
import { MeadowScene } from './MeadowScene';
import { BATTLE_SHADOW, POKEBALL, speciesName } from './scene';
import './CatchSequence.css';

type Beat = 'throw' | 'absorb' | 'drop' | 'shake-one' | 'shake-two' | 'shake-three' | 'settle';
const BEATS: readonly [number, Beat][] = [
  [460, 'absorb'], [860, 'drop'], [1380, 'shake-one'],
  [2240, 'shake-two'], [3100, 'shake-three'], [3960, 'settle'],
];
const CAPTIONS: Record<Beat, string> = {
  throw: 'Here goes…', absorb: 'Into the ball!', drop: 'Stay in there…',
  'shake-one': 'One…', 'shake-two': 'Two…', 'shake-three': 'Come on…', settle: 'Checking your catch…',
};
const SPARKS = [
  [-94, -70], [0, -114], [94, -70], [-118, 12], [118, 12], [-68, 86], [68, 86],
];

/** Presentation only: a throw starts immediately, but only a server receipt can reveal its outcome. */
export function CatchSequence({ event, ballId, result, onDone }: {
  event: RouteEvent;
  ballId: CaptureBallId;
  result: RouteCatch | null;
  onDone: () => void;
}) {
  const [beat, setBeat] = useState<Beat>('throw');
  const [skipped, setSkipped] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const heading = useRef<HTMLHeadingElement>(null);
  const still = skipped || reducedMotion;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (still) return;
    const timers = BEATS.map(([delay, next]) => window.setTimeout(() => setBeat(next), delay));
    return () => timers.forEach(window.clearTimeout);
  }, [still]);

  const ready = still || beat === 'settle';
  const revealed = ready && result !== null;
  const stage = revealed ? result.caught ? 'caught' : 'escaped' : still ? 'settle' : beat;
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [revealed]);

  const foe = event.foe;
  const name = foe ? speciesName(foe.dexId) : 'Pokémon';
  const base = foe ? CREATURES_BY_ID[String(foe.dexId)] : null;
  const creature = base ? foe?.shiny ? asShiny(base) : foe?.altColor ? asAltColor(base) : base : null;
  const shakes = stage === 'caught' || stage === 'shake-three' || stage === 'settle' ? 3
    : stage === 'shake-two' ? 2 : stage === 'shake-one' ? 1 : 0;
  const title = stage === 'caught' ? 'Gotcha!' : stage === 'escaped' ? 'So close!' : CAPTIONS[stage];
  const detail = stage === 'caught' ? `${name} was caught!`
    : stage === 'escaped' ? `${name} broke free.`
      : ready ? 'Waiting for the meadow to confirm your throw.' : `Will ${name} stay in the ball?`;

  return <section className="catch-sequence ui-window m-2" data-stage={stage} data-still={still} aria-label="Catching Pokémon">
    <MeadowScene className="min-h-[360px]" label={`Catching ${name}`}>
      <div className="catch-shade pointer-events-none absolute inset-0 bg-edge/60" />
      <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2 rounded-[3px] border border-window-rim bg-window px-3 py-2 shadow-[3px_3px_0_var(--color-edge)]">
        <div><p className="font-label text-[9px] uppercase text-info">{revealed ? 'Throw complete' : 'Catch in progress'}</p><p className="mt-1 text-lg">{name}</p></div>
        {foe?.shiny ? <span className="text-sm text-caught-shiny">✦ Shiny</span> : foe?.altColor ? <span className="text-sm text-caught-alt">Alternate color</span> : foe?.rare ? <span className="text-sm text-accent">Rare</span> : null}
      </div>
      <div className="catch-art pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="catch-aura" />
        <div className="catch-pokemon-anchor"><div className="catch-pokemon">
          <PixelSprite src={creature?.sprite ?? (foe ? spriteUrl(foe.dexId) : POKEBALL)} fallback={POKEBALL} size={192} alt="" />
        </div></div>
        <div className="catch-ring" />
        <img src={BATTLE_SHADOW} alt="" className="catch-ground" />
        <div className="catch-ball-anchor"><div className="catch-ball-flight">
          <div key={stage} className="catch-ball-wobble"><PixelSprite src={ballUrl(ballId)} size={48} alt="" /><span className="catch-lock" /></div>
        </div></div>
        {stage === 'caught' && <div className="catch-sparks">{SPARKS.map(([x, y], index) => <span key={index}
          style={{ '--spark-x': `${x}px`, '--spark-y': `${y}px`, '--spark-delay': `${index * 35}ms` } as CSSProperties}>✦</span>)}</div>}
        {stage === 'caught' && <div className="catch-stamp font-label text-[11px] uppercase">✦ Caught! ✦</div>}
      </div>
      <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3" aria-hidden="true">
        {[1, 2, 3].map((shake) => <span key={shake} className={`catch-pip h-2.5 w-2.5 rotate-45 border-2 ${stage === 'escaped' ? 'border-window-rim bg-window' : shakes >= shake ? 'border-accent bg-accent' : 'border-window-rim bg-window'}`} />)}
      </div>
    </MeadowScene>
    <div className="border-t-2 border-window-frame p-4 text-center">
      <div role="status" aria-live="polite" aria-atomic="true">
        <h2 ref={heading} tabIndex={-1} className={`ui-focus rounded-[3px] font-label text-xl uppercase ${stage === 'caught' ? 'text-accent' : 'text-ink'}`}>{title}</h2>
        <p className="mt-2 text-lg">{detail}</p>
      </div>
      <p className="mt-2 text-sm text-ink-dim">{revealed ? result.caught ? 'A new companion. A new adventure.' : 'The meadow has more Pokémon to meet.' : itemById(ballId)?.name}</p>
      {revealed ? <button type="button" onClick={onDone} className="ui-button-primary ui-focus mt-4 min-h-12 w-full px-3 font-label text-[10px] uppercase">{result.caught ? 'Meet your Pokémon' : 'View result'}</button>
        : <button type="button" disabled={still} onClick={() => setSkipped(true)} className="ui-button ui-focus mt-4 min-h-12 w-full px-3 font-label text-[10px] uppercase">{still ? 'Checking catch…' : 'Skip animation'}</button>}
    </div>
  </section>;
}
