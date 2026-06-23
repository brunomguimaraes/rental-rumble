import {
  ALL_TYPES,
  TYPE_COLORS,
  typeIconUrl,
  typeLabel,
} from '../game/typechart';

const FADE =
  'linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)';

/**
 * Auto-scrolling, seamless marquee of all 18 Pokémon types with their icons.
 * The track holds two identical copies and slides by -50%, so the loop is
 * perfectly continuous. Each pill carries a trailing margin (not flex `gap`)
 * so the -50% shift lands exactly on a copy boundary.
 */
export function TypeMarquee() {
  const items = [...ALL_TYPES, ...ALL_TYPES];
  return (
    <div
      className="relative w-full overflow-hidden py-1"
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
      aria-label="All Pokémon types"
    >
      <div className="flex w-max animate-marquee">
        {items.map((t, i) => {
          const color = TYPE_COLORS[t];
          return (
            <div
              key={`${t}-${i}`}
              aria-hidden={i >= ALL_TYPES.length}
              className="mr-2.5 flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3"
              style={{ borderColor: `${color}55`, background: `${color}1a` }}
            >
              <img
                src={typeIconUrl(t)}
                alt=""
                className="h-6 w-6 shrink-0 object-contain"
              />
              <span className="text-xs font-semibold text-white/85">
                {typeLabel(t)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
