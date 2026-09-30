import { useState } from 'react';
import { canPromptInstall, detectInstallPlatform, isInstalled, promptInstall, type InstallPlatform } from '../install';

type Step = { text: string; image: string };

// Screenshots live in public/install/; a missing one shows a placeholder frame.
const STEPS: Record<'ios' | 'android', Step[]> = {
  ios: [
    { text: 'In Safari, tap Share: the square with an arrow. No Share button? Tap ••• first.', image: 'ios-1.png' },
    { text: 'Scroll down the menu and tap “Add to Home Screen”. You may need “View More” to find it.', image: 'ios-2.png' },
    { text: 'Leave “Open as Web App” on, then tap Add. Launch Rental Rumble from its new icon.', image: 'ios-3.png' },
  ],
  android: [
    { text: 'In Chrome, tap the ⋮ menu in the top-right corner.', image: 'android-1.png' },
    { text: 'Tap “Add to home screen” or “Install app”.', image: 'android-2.png' },
    { text: 'Tap Install. Launch Rental Rumble from its new icon.', image: 'android-3.png' },
  ],
};

const TABS: { id: 'ios' | 'android'; label: string }[] = [
  { id: 'ios', label: 'iPhone / iPad' },
  { id: 'android', label: 'Android' },
];

function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  return detectInstallPlatform({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
}

function StepShot({ src, label }: { src: string; label: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <div className="flex aspect-[9/16] w-32 shrink-0 items-center justify-center bg-slot p-2 text-center font-label text-[9px] uppercase text-ink-dim">
        Screenshot coming soon
      </div>
    );
  }
  return (
    <img
      src={`${import.meta.env.BASE_URL}install/${src}`}
      alt={label}
      loading="lazy"
      onError={() => setMissing(true)}
      className="w-32 shrink-0 bg-slot object-contain"
    />
  );
}

/** A "Install app" footer button + modal teaching players to add the game to
 *  their home screen, so it launches full-screen like a native app. Hidden when
 *  the game is already running from the home screen. */
export function InstallGuide() {
  const [open, setOpen] = useState(false);
  const [platform] = useState(detectPlatform);
  const [tab, setTab] = useState<'ios' | 'android'>(platform === 'android' ? 'android' : 'ios');
  const [prompting, setPrompting] = useState(false);
  const [installed, setInstalled] = useState(isInstalled);

  if (installed) return null;

  const showPromptButton = tab === 'android' && canPromptInstall();

  async function install() {
    setPrompting(true);
    const accepted = await promptInstall();
    setPrompting(false);
    if (accepted) {
      setInstalled(true);
      setOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white/45 underline-offset-4 transition hover:text-white/80 hover:underline"
      >
        Install app
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-guide-title"
            className="ui-window m-3 max-h-[85dvh] w-full max-w-md overflow-y-auto p-4 text-left font-pixel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="install-guide-title" className="text-lg font-bold text-ink">Play it like an app</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ui-button ui-focus shrink-0 px-3 py-1 font-label text-[10px] uppercase"
              >
                Close
              </button>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              Add Rental Rumble to your home screen. It opens full-screen, with no browser bars, straight from its own icon.
            </p>
            {platform === 'desktop' && (
              <p className="mt-2 text-sm leading-relaxed text-ink-dim">
                Best on a phone: open this page there and follow the steps below.
              </p>
            )}

            <div className="mt-4 flex gap-2" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`ui-focus px-2 py-1 font-label text-[10px] uppercase ${tab === t.id ? 'text-accent' : 'text-ink-dim hover:text-ink'}`}
                >
                  {tab === t.id ? '▶ ' : ''}{t.label}
                </button>
              ))}
            </div>

            {showPromptButton && (
              <button
                type="button"
                onClick={install}
                disabled={prompting}
                className="ui-button ui-focus mt-3 w-full px-3 py-2 font-label text-[11px] uppercase"
              >
                {prompting ? 'Installing…' : 'Install now'}
              </button>
            )}

            <ol className="mt-4 space-y-4">
              {STEPS[tab].map((step, i) => (
                <li key={step.image} className="flex gap-3">
                  <StepShot src={step.image} label={`Step ${i + 1}: ${step.text}`} />
                  <div>
                    <div className="font-label text-[10px] uppercase text-info">Step {i + 1}</div>
                    <p className="mt-1 text-sm leading-relaxed text-ink">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
