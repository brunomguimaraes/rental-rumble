import type { MDXComponents } from 'mdx/types';

// Tailwind styling for the raw markdown elements MDX emits, so every doc gets a
// consistent dark-theme look without per-file classes. Interactive widgets are
// imported directly inside each .mdx file, not mapped here.
export const mdxComponents: MDXComponents = {
  h1: (props) => (
    <h1 className="text-2xl font-black tracking-tight" {...props} />
  ),
  h2: (props) => (
    <h2
      className="mt-7 mb-2 scroll-mt-20 text-xs font-bold uppercase tracking-widest text-white/40"
      {...props}
    />
  ),
  h3: (props) => (
    <h3 className="mt-4 mb-1.5 text-sm font-bold text-white/80" {...props} />
  ),
  p: (props) => (
    <p className="mt-2 text-[13px] leading-relaxed text-white/60" {...props} />
  ),
  a: (props) => (
    <a
      className="font-semibold text-sky-300 underline-offset-2 hover:underline"
      {...props}
    />
  ),
  strong: (props) => <strong className="font-semibold text-white/85" {...props} />,
  em: (props) => <em className="italic text-white/75" {...props} />,
  ul: (props) => (
    <ul
      className="mt-2 ml-4 list-disc space-y-1 text-[13px] leading-relaxed text-white/60 marker:text-white/30"
      {...props}
    />
  ),
  ol: (props) => (
    <ol
      className="mt-2 ml-4 list-decimal space-y-1.5 text-[13px] leading-relaxed text-white/60 marker:text-white/40"
      {...props}
    />
  ),
  li: (props) => <li className="pl-1" {...props} />,
  hr: () => <hr className="my-5 border-white/10" />,
  blockquote: (props) => (
    <blockquote
      className="mt-3 border-l-2 border-white/20 pl-3 text-[13px] italic text-white/50"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-white/80"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11.5px] leading-relaxed text-white/75 [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  table: (props) => (
    <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full border-collapse text-left text-[12px]" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-white/[0.04]" {...props} />,
  th: (props) => (
    <th
      className="border-b border-white/10 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white/50"
      {...props}
    />
  ),
  td: (props) => (
    <td
      className="border-t border-white/10 px-2.5 py-1.5 align-top text-white/65"
      {...props}
    />
  ),
};
