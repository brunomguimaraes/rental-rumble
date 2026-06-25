import { useEffect, useRef, useState } from 'react';
import { MDXProvider } from '@mdx-js/react';
import { mdxComponents } from '../guide/mdxComponents';
import { GUIDE_DOCS, findDoc, slugFromHash } from '../guide/registry';
import { guideHash, hashIsGuide } from '../guide/hash';

/** Sidebar entry — shared by the desktop rail and the mobile chip row. */
function NavItem({
  active,
  icon,
  title,
  compact,
  onClick,
}: {
  active: boolean;
  icon?: string;
  title: string;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
        compact ? 'whitespace-nowrap' : 'w-full'
      } ${
        active
          ? 'border-white/40 bg-white/10 text-white'
          : 'border-transparent text-white/55 hover:bg-white/5 hover:text-white/80'
      }`}
    >
      {icon && <span className="text-base leading-none">{icon}</span>}
      <span className="truncate">{title}</span>
    </button>
  );
}

/** The reusable guide layout: a sidebar of docs plus the rendered MDX page. */
function GuideBody({
  slug,
  onSelect,
  variant,
}: {
  slug: string;
  onSelect: (slug: string) => void;
  /**
   * `page` lets the document scroll on mobile (the desktop pane still scrolls
   * internally); `modal` keeps everything inside the dialog's own scroller.
   */
  variant: 'page' | 'modal';
}) {
  const doc = findDoc(slug) ?? GUIDE_DOCS[0];
  const scrollRef = useRef<HTMLDivElement>(null);
  const isModal = variant === 'modal';

  // Snap back to the top whenever the reader switches docs. The desktop pane and
  // the modal scroll their own content box; the mobile full page flows with the
  // document, so reset the window there instead.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    if (!isModal) window.scrollTo({ top: 0 });
  }, [slug, isModal]);

  if (!doc) return null;
  const Content = doc.Content;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      {/* Mobile: horizontal scrollable chips. On the full page they stick to the
          top of the viewport so docs stay switchable while the page scrolls.
          `min-w-0` lets the row actually scroll instead of stretching its flex
          parent to the non-wrapping chips' width. */}
      <nav
        className={`flex min-w-0 gap-1.5 overflow-x-auto border-b border-white/10 bg-[#15151c] px-3 py-2 md:hidden ${
          isModal ? '' : 'sticky top-0 z-10'
        }`}
      >
        {GUIDE_DOCS.map((d) => (
          <NavItem
            key={d.slug}
            compact
            active={d.slug === slug}
            icon={d.icon}
            title={d.title}
            onClick={() => onSelect(d.slug)}
          />
        ))}
      </nav>

      {/* Desktop: left rail */}
      <nav className="hidden w-56 shrink-0 space-y-0.5 overflow-y-auto border-r border-white/10 p-3 md:block">
        {GUIDE_DOCS.map((d) => (
          <NavItem
            key={d.slug}
            active={d.slug === slug}
            icon={d.icon}
            title={d.title}
            onClick={() => onSelect(d.slug)}
          />
        ))}
      </nav>

      {/* Content. The desktop pane and the modal scroll internally; the mobile
          full page flows naturally so it never gets trapped in a dead inner
          scroll container (the bug that broke this page on phones). */}
      <div
        ref={scrollRef}
        className={`min-h-0 min-w-0 flex-1 px-5 py-6 sm:px-8 md:overflow-y-auto ${
          isModal ? 'overflow-y-auto' : ''
        }`}
      >
        <article className="mx-auto max-w-2xl">
          {doc.summary && (
            <p className="mb-4 text-xs text-white/45">{doc.summary}</p>
          )}
          <MDXProvider components={mdxComponents}>
            <Content />
          </MDXProvider>
        </article>
      </div>
    </div>
  );
}

/** Full-page guide, deep-linkable via `#guide/<slug>` with working browser back. */
export function GuideScreen({ onBack }: { onBack: () => void }) {
  const [slug, setSlug] = useState(slugFromHash);

  // Reflect the slug into the URL so docs are shareable; pin it on mount.
  useEffect(() => {
    if (!hashIsGuide()) {
      window.location.hash = guideHash(slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to the back/forward buttons: stay in sync while in the guide, leave
  // when the hash moves elsewhere.
  useEffect(() => {
    const onHash = () => {
      if (!hashIsGuide()) {
        onBack();
        return;
      }
      setSlug(slugFromHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [onBack]);

  const select = (s: string) => {
    window.location.hash = guideHash(s);
    setSlug(s);
  };

  const leave = () => {
    if (hashIsGuide()) {
      history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      );
    }
    onBack();
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-3 py-4 sm:px-5 sm:py-6 md:h-[100dvh]">
      <header className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={leave}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-1.5 text-sm font-semibold text-white/75 transition hover:bg-white/10"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-lg font-black leading-tight">How battles work</h1>
          <p className="text-[11px] text-white/40">
            The rules under the hood, right down to the math.
          </p>
        </div>
      </header>
      {/* Mobile lets the document scroll (overflow-visible so the card grows with
          its content); desktop pins the height and scrolls the content pane. */}
      <div className="flex min-h-0 flex-1 overflow-visible rounded-3xl border border-white/10 bg-[#15151c] md:overflow-hidden">
        <GuideBody slug={slug} onSelect={select} variant="page" />
      </div>
    </div>
  );
}

/** Modal guide for mid-battle reference — keeps screen state, no hash changes. */
export function GuideModal({ onClose }: { onClose: () => void }) {
  const [slug, setSlug] = useState(() => GUIDE_DOCS[0]?.slug ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="How battles work"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#15151c] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h2 className="text-base font-black">How battles work</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/20 text-white/70 transition hover:bg-white/10"
          >
            ✕
          </button>
        </div>
        <GuideBody slug={slug} onSelect={setSlug} variant="modal" />
      </div>
    </div>
  );
}
