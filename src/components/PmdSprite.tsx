import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Side } from '../game/types';
import {
  dirRow,
  PMD_FRAME_MS,
  pmdSheetUrl,
  resolvePmdAnim,
  type PmdAnimKind,
} from '../game/pmd';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Renders a PMD-style animated sprite by stepping through one direction-row of a
 * SpriteCollab sheet. Frame timing follows the per-frame `durs` from AnimData,
 * so non-uniform anims (a long idle "breath", a snappy attack) play correctly —
 * something CSS `steps()` can't express.
 *
 * Frames are scaled by the species' *resting* height so the character stays a
 * constant on-screen size even when an attack frame is a much larger canvas; the
 * extra lunge area simply overflows the box (which is what makes attacks read).
 *
 * Falls back to `fallback` (the flat Essentials front/back PNG) when a species
 * has no bundled PMD sprite, so the battle always renders something.
 */
export function PmdSprite({
  dexId,
  side,
  kind,
  heightPx,
  loop,
  speed = 1,
  playToken = 0,
  onAnimEnd,
  fallback,
}: {
  dexId: number;
  side: Side;
  kind: PmdAnimKind;
  heightPx: number;
  loop: boolean;
  speed?: number;
  /** Bump to restart a one-shot anim even when `kind` is unchanged. */
  playToken?: number;
  onAnimEnd?: () => void;
  fallback: ReactNode;
}) {
  const anim = resolvePmdAnim(dexId, kind);
  const [frame, setFrame] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const endRef = useRef(onAnimEnd);
  endRef.current = onAnimEnd;

  const frames = anim?.frames ?? 1;
  const durKey = anim ? anim.durs.join(',') : '';

  useEffect(() => {
    if (!anim) return;
    setFrame(0);
    if (frames <= 1 || prefersReducedMotion()) {
      // Static (or motion-averse): hold frame 0 and report completion so the
      // battle replay never stalls waiting on an animation that won't play.
      if (!loop) {
        timer.current = window.setTimeout(() => endRef.current?.(), 120);
      }
      return () => window.clearTimeout(timer.current);
    }

    let i = 0;
    const tick = () => {
      const next = i + 1;
      if (next >= frames) {
        if (loop) {
          i = 0;
          setFrame(0);
        } else {
          endRef.current?.();
          return;
        }
      } else {
        i = next;
        setFrame(next);
      }
      schedule();
    };
    const schedule = () => {
      const ms = Math.max(16, (anim.durs[i] ?? 2) * PMD_FRAME_MS) / Math.max(0.25, speed);
      timer.current = window.setTimeout(tick, ms);
    };
    schedule();
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dexId, kind, loop, speed, frames, durKey, playToken]);

  if (!anim) return <>{fallback}</>;

  // Draw each species near its *relative* native size (a frame's pixel height is
  // a decent proxy: Onix's resting frame is ~104px, Geodude's ~24px), but
  // compress the range with a power curve + clamp so tiny mons aren't dwarfed
  // and huge ones don't overflow the stage. heightPx is the size at REF height.
  const REF = 48;
  const target = heightPx * Math.pow(anim.refHeight / REF, 0.6);
  const displayed = Math.max(heightPx * 0.62, Math.min(heightPx * 1.45, target));
  const scale = displayed / anim.refHeight;
  const w = anim.fw * scale;
  const h = anim.fh * scale;
  const row = dirRow(side, anim.rows);

  return (
    <div
      aria-hidden
      style={{
        width: w,
        height: h,
        backgroundImage: `url(${pmdSheetUrl(dexId, anim.sheet)})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${anim.frames * w}px ${anim.rows * h}px`,
        backgroundPosition: `${-frame * w}px ${-row * h}px`,
        imageRendering: 'pixelated',
      }}
      className="pointer-events-none drop-shadow-lg"
    />
  );
}
