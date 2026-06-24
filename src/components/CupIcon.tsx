import { type BracketId, type CupId, bracketCup, cupSrc } from '../game/gens';

const CUP_LABEL: Record<CupId, string> = {
  cool: 'Cool Cup',
  beauty: 'Beauty Cup',
  cute: 'Cute Cup',
  clever: 'Clever Cup',
  tough: 'Tough Cup',
};

/**
 * A Ribbon Cup sprite emblem. Pass either an explicit {@link CupId} (`cup`) or a
 * {@link BracketId} (`bracket`) to use that era's assigned cup. Replaces the old
 * crown/trophy emojis.
 */
export function CupIcon({
  cup,
  bracket,
  className = 'h-5 w-5',
}: {
  cup?: CupId;
  bracket?: BracketId;
  className?: string;
}) {
  const id: CupId = cup ?? (bracket ? bracketCup(bracket) : 'cool');
  return (
    <img
      src={cupSrc(id)}
      alt={CUP_LABEL[id]}
      title={CUP_LABEL[id]}
      className={`shrink-0 object-contain [image-rendering:pixelated] ${className}`}
    />
  );
}
