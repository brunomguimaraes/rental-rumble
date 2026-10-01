import type { ReactNode } from 'react';

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="ui-window m-2 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-label text-[11px] uppercase text-info">{title}</h2>{aside}</div>{children}</section>;
}
