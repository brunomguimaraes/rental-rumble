import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Side } from '../game/types';
import {
  dirRow,
  hasAltColorPmdSprite,
  hasShinyPmdSprite,
  PMD_FRAME_MS,
  pmdScale,
  pmdSheetUrl,
  pmdSheetUrls,
  resolvePmdAnim,
  type PmdAnimKind,
  type PmdVariant,
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
  shiny = false,
  altColor = false,
  onAnimEnd,
  fallback,
  wholeScale = false,
}: {
  dexId: number;
  side: Side;
  kind: PmdAnimKind;
  heightPx: number;
  loop: boolean;
  speed?: number;
  /** Bump to restart a one-shot anim even when `kind` is unchanged. */
  playToken?: number;
  /** Render the shiny recolour (falls back to the normal sheets if none exists). */
  shiny?: boolean;
  /** Render the fan-made alternate colour (falls back to normal if none exists). */
  altColor?: boolean;
  onAnimEnd?: () => void;
  fallback: ReactNode;
  /** Round to a whole multiple of the sheet's pixels (Night screens). */
  wholeScale?: boolean;
}) {
  const anim = resolvePmdAnim(dexId, kind);
  // Pick the recolour to render, but only when this species ships its full set
  // of sheets (else fall back to the base palette). Shiny takes precedence.
  const variant: PmdVariant =
    shiny && hasShinyPmdSprite(dexId)
      ? 'shiny'
      : altColor && hasAltColorPmdSprite(dexId)
        ? 'alt'
        : undefined;
  const [frame, setFrame] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const endRef = useRef(onAnimEnd);
  endRef.current = onAnimEnd;

  const frames = anim?.frames ?? 1;
  const durKey = anim ? anim.durs.join(',') : '';

  // Reset to the first frame *during render* (not in the effect, which runs
  // after paint) whenever we switch to a different sheet/anim. Without this the
  // browser can paint one frame using the previous anim's frame index — which
  // may point past the new, shorter sheet — flashing a blank cell ("blink").
  const animSig = `${dexId}|${anim?.sheet ?? ''}|${durKey}|${playToken}`;
  const sigRef = useRef(animSig);
  if (sigRef.current !== animSig) {
    sigRef.current = animSig;
    if (frame !== 0) setFrame(0);
  }

  // Preload (decode) every sheet this species can use, so an animation switch
  // never blanks while the browser fetches a sheet it hasn't shown yet.
  useEffect(() => {
    const imgs = pmdSheetUrls(dexId, variant).map((url) => {
      const img = new Image();
      img.src = url;
      return img;
    });
    return () => {
      for (const img of imgs) img.src = '';
    };
  }, [dexId, variant]);

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

  const scale = pmdScale({ refHeight: anim.refHeight, heightPx, wholeScale });
  const w = anim.fw * scale;
  const h = anim.fh * scale;
  const row = dirRow(side, anim.rows);
  // Guard against a stale index landing past the current sheet (blank cell).
  const safeFrame = Math.min(Math.max(frame, 0), frames - 1);

  return (
    <div
      aria-hidden
      style={{
        width: w,
        height: h,
        backgroundImage: `url(${pmdSheetUrl(dexId, anim.sheet, variant)})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${anim.frames * w}px ${anim.rows * h}px`,
        backgroundPosition: `${-safeFrame * w}px ${-row * h}px`,
        imageRendering: 'pixelated',
      }}
      className={`pointer-events-none ${wholeScale ? '' : 'drop-shadow-lg'}`}
    />
  );
}
