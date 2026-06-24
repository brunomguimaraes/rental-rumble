import type { SubmissionMon } from '../game/leaderboard';
import {
  portraitUrl,
  shinyPortraitUrl,
  altColorPortraitUrl,
  spriteUrl,
} from '../game/pokemon';

/**
 * The ordered list of art to try for a recorded team slot, best first:
 *
 *   1. the exact colour + emotion the run fielded (e.g. shiny "Happy"),
 *   2. that colour's neutral face (the emotion may not exist in every set),
 *   3. the plain non-recoloured face (a shiny/alt with no recoloured portrait),
 *   4. the crisp front battle sprite as a last resort.
 *
 * Walking this on each <img> error means a record always shows the closest
 * thing to the real face, and never a broken image.
 */
function portraitCandidates(mon: SubmissionMon): string[] {
  const dexId = Number(mon.id);
  const { shiny, altColor, emotion } = mon;
  const variant = (e?: string) =>
    shiny
      ? shinyPortraitUrl(dexId, e)
      : altColor
        ? altColorPortraitUrl(dexId, e)
        : portraitUrl(dexId, e);

  const urls: string[] = [];
  if (emotion && emotion !== 'Normal') urls.push(variant(emotion));
  urls.push(variant('Normal'));
  if (shiny || altColor) urls.push(portraitUrl(dexId, 'Normal'));
  urls.push(spriteUrl(dexId));
  return urls.filter((u, i) => urls.indexOf(u) === i);
}

/**
 * A single recorded team member shown as its PMD-style portrait — the exact
 * shiny / alternate-colour / emotion face the run actually fielded, so a board
 * row, hall entry or champion card reflects the real team rather than a generic
 * default. A small twinkle (shiny) or diamond (alt colour) marks a special
 * colouring even when only its plain art exists to fall back to.
 */
export function TeamPortrait({
  mon,
  className = 'h-7 w-7',
}: {
  mon: SubmissionMon;
  className?: string;
}) {
  const dexId = Number(mon.id);
  const candidates = portraitCandidates(mon);
  const fallback = spriteUrl(dexId);

  const img = (
    <img
      src={candidates[0]}
      data-i="0"
      alt=""
      loading="lazy"
      onError={(e) => {
        const el = e.currentTarget;
        const next = Number(el.dataset.i ?? '0') + 1;
        if (next >= candidates.length) return;
        el.dataset.i = String(next);
        if (candidates[next] === fallback) {
          el.classList.add('[image-rendering:pixelated]');
        }
        el.src = candidates[next];
      }}
      className={`${className} rounded-md border border-white/10 bg-white/5 object-cover`}
    />
  );

  if (!mon.shiny && !mon.altColor) return img;
  return (
    <div className="relative inline-grid place-items-center">
      {img}
      {mon.shiny ? (
        <span
          aria-hidden
          title="Shiny"
          className="shiny-twinkle pointer-events-none absolute -right-0.5 -top-0.5 text-[9px] leading-none drop-shadow"
          style={{ color: '#ffd76b' }}
        >
          ✦
        </span>
      ) : (
        <span
          aria-hidden
          title="Alternate colour"
          className="pointer-events-none absolute -right-0.5 -top-0.5 text-[8px] leading-none drop-shadow"
          style={{ color: '#c4b5fd' }}
        >
          ◆
        </span>
      )}
    </div>
  );
}
