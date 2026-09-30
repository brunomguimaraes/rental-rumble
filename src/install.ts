// "Add to Home Screen" support: which install steps fit this device, whether
// the game is already running as an installed app, and Chrome's deferred
// install prompt.

export type InstallPlatform = 'ios' | 'android' | 'desktop';

/** iPadOS 13+ reports a desktop Mac user agent; touch points tell them apart. */
export function detectInstallPlatform({ userAgent, maxTouchPoints }: { userAgent: string; maxTouchPoints: number }): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'desktop';
}

/** True when launched from the home screen, where the install button is pointless. */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

/** Chrome's `beforeinstallprompt` event; not in the DOM lib types. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Chrome fires the event once, often before the hub mounts, so hold it here.
let deferredPrompt: InstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
  });
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

/** Shows Chrome's install dialog. Resolves true when the player accepts. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null; // the event can only be used once
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}
