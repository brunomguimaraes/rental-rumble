import { COLLECTION_LAYERS, type VariantMarks } from './dex';

/** Three square pips (normal / alt colour / shiny) in the surrounding ink colour. */
export function CollectionPips({ marks }: { marks: VariantMarks }) {
  const owned = COLLECTION_LAYERS.filter((l) => marks[l.key]).map((l) => l.label.toLowerCase());
  return (
    <span
      role="img"
      aria-label={owned.length ? `Caught: ${owned.join(', ')}` : 'Not caught'}
      className="flex shrink-0 items-center gap-0.5"
    >
      {COLLECTION_LAYERS.map((l) => (
        <span
          key={l.key}
          className={`h-1.5 w-1.5 border border-current ${marks[l.key] ? l.fill : ''}`}
        />
      ))}
    </span>
  );
}
