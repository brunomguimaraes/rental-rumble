import type { ReactNode } from 'react';

/** The red DS-style handheld: lens and lights, top screen, hinge, bottom screen. */
export function DexDevice({
  countLabel,
  top,
  bottom,
}: {
  countLabel: string;
  top: ReactNode;
  bottom: ReactNode;
}) {
  // No overflow-hidden here: it would break the sticky top screen on phones.
  return (
    <div className="rounded-[6px_6px_18px_6px] bg-dex-red p-2.5 shadow-[inset_-4px_-4px_0_var(--color-dex-red-dark),inset_4px_4px_0_var(--color-dex-red-light),6px_6px_0_var(--color-edge)]">
      <div className="mb-2 flex items-center gap-2">
        <span
          aria-hidden
          className="h-5 w-5 rounded-full bg-dex-lens shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--color-dex-bezel),inset_-3px_-3px_0_var(--color-dex-lens-dark)]"
        />
        <span aria-hidden className="ml-1 h-2 w-2 rounded-full bg-dex-red-light shadow-[0_0_0_2px_var(--color-dex-bezel)]" />
        <span aria-hidden className="h-2 w-2 rounded-full bg-select shadow-[0_0_0_2px_var(--color-dex-bezel)]" />
        <span aria-hidden className="h-2 w-2 rounded-full bg-caught-alt shadow-[0_0_0_2px_var(--color-dex-bezel)]" />
        <span className="ml-auto font-label text-[10px] uppercase text-white [text-shadow:1px_1px_0_#000]">
          {countLabel}
        </span>
      </div>
      <div className="sticky top-0 z-10 -mx-2.5 bg-dex-red px-2.5 py-1 sm:static">
        <div className="bg-dex-bezel p-1.5">{top}</div>
      </div>
      <div
        aria-hidden
        className="-mx-2.5 my-1.5 h-2.5 bg-dex-red-dark shadow-[inset_0_-2px_0_var(--color-dex-red-light)]"
      />
      <div className="bg-dex-bezel p-1.5">{bottom}</div>
      <div aria-hidden className="mt-2 flex items-center justify-between px-1">
        <span className="relative h-8 w-8">
          <span className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 bg-dex-bezel" />
          <span className="absolute inset-y-0 left-1/2 w-2.5 -translate-x-1/2 bg-dex-bezel" />
        </span>
        <span className="flex gap-1.5">
          <span className="h-4 w-4 rounded-full bg-dex-bezel" />
          <span className="h-4 w-4 rounded-full bg-dex-bezel" />
        </span>
      </div>
    </div>
  );
}
