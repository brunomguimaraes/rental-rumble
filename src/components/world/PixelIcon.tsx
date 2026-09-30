// Tiny 8×8 pixel glyphs for map states and route info, drawn as crisp SVG
// rects so they scale by whole pixels. Each row is 8 characters; '#' is ink,
// '+' is the lighter shade, anything else is transparent.

const GLYPHS = {
  lock: ['..####..', '.#....#.', '.#....#.', '########', '###++###', '###++###', '########', '........'],
  question: ['..####..', '.##..##.', '.....##.', '....##..', '...##...', '........', '...##...', '........'],
  star: ['...##...', '...##...', '########', '.######.', '..####..', '.##..##.', '##....##', '........'],
  starOutline: ['...##...', '...##...', '###..###', '.#....#.', '..#..#..', '.##..##.', '##....##', '........'],
  flag: ['.##.....', '.#####..', '.######.', '.#####..', '.##.....', '.#......', '.#......', '.#......'],
  sparkle: ['...#....', '...#....', '.#####..', '...#....', '...#..#.', '.....###', '......#.', '........'],
  home: ['...##...', '..####..', '.######.', '########', '.##++##.', '.##++##.', '.######.', '........'],
  eye: ['........', '..####..', '.#+..+#.', '#.+##+.#', '#.+##+.#', '.#+..+#.', '..####..', '........'],
  book: ['.######.', '.#+++++#', '.#+###+#', '.#+++++#', '.#+###+#', '.#+++++#', '.#######', '........'],
  exp: ['..####..', '.#++++#.', '#+####+#', '#+#++#+#', '#+#++#+#', '#+####+#', '.#++++#.', '..####..'],
  boot: ['..###...', '..###...', '..###...', '..####..', '..#####.', '.#######', '.#######', '........'],
  clock: ['..####..', '.#+..+#.', '#+..#.+#', '#...#..#', '#...###.', '#+....+#', '.#+..+#.', '..####..'],
} as const;

export type GlyphName = keyof typeof GLYPHS;

export function PixelIcon({
  name,
  size = 16,
  className = '',
  label,
}: {
  name: GlyphName;
  size?: number;
  className?: string;
  /** Screen-reader name; omit when the icon sits next to its own text. */
  label?: string;
}) {
  const rows = GLYPHS[name];
  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`shrink-0 ${className}`}
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '#' || ch === '+' ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" opacity={ch === '+' ? 0.5 : 1} />
          ) : null,
        ),
      )}
    </svg>
  );
}
