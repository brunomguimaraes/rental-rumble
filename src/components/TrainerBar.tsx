import type { ReactNode } from 'react';
import type { MeterView } from '../game/meter';
import { StaminaMeter } from './ui/StaminaMeter';
import { useServerClock } from './ui/useServerClock';

const ICON = (name: string) => `${import.meta.env.BASE_URL}sprites/ui/night/96/${name}.png`;

/**
 * The trainer bar on the Hub and in the world: the trainer's portrait, the trainer and their mentor,
 * mail (not open yet) and settings, what the Bag holds, and both stamina meters once the world is activated.
 */
export function TrainerBar({ portrait, displayName, mentorName, balls, stamina, onOpenSettings }: {
  portrait: ReactNode;
  displayName: string;
  mentorName: string;
  /** Omit while the world is unavailable; zero is a real, empty Bag. */
  balls?: number;
  stamina?: { travel: MeterView; actions: MeterView; serverNow: number };
  onOpenSettings: () => void;
}) {
  return (
    <header className="ui-window grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 p-2 min-[400px]:gap-x-3">
      <div className={`${balls === undefined ? 'row-span-2' : 'row-span-3'} grid place-items-center self-start rounded-[3px] border-2 border-window-frame bg-slot p-1`}>
        {portrait}
      </div>

      <div className="min-w-0">
        <p className="font-label text-[9px] uppercase tracking-widest text-info">Trainer</p>
        <p className="break-words font-pixel text-sm uppercase leading-tight text-ink min-[360px]:text-base min-[400px]:text-lg">{displayName}</p>
      </div>

      <div className="flex gap-2">
        <button type="button" disabled aria-label="Mail, coming soon" className="ui-button ui-focus grid h-11 w-11 place-items-center">
          <img src={ICON('mail')} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
        </button>
        <button type="button" onClick={onOpenSettings} aria-label="Settings" className="ui-button ui-focus grid h-11 w-11 place-items-center">
          <img src={ICON('settings')} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
        </button>
      </div>

      <p className="col-span-2 col-start-2 font-pixel text-sm leading-snug text-ink-dim">{mentorName}’s protégé</p>

      {balls !== undefined && (
        <p className="col-span-2 col-start-2 flex items-center justify-end gap-1 border-t-2 border-window-frame pt-1 font-label text-[11px] uppercase text-ink">
          <img src={ICON('item-bag')} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
          {balls}
          <span className="sr-only">{balls === 1 ? 'ball' : 'balls'} in your Bag</span>
        </p>
      )}

      {stamina && <StaminaRows stamina={stamina} />}
    </header>
  );
}

function StaminaRows({ stamina }: { stamina: { travel: MeterView; actions: MeterView; serverNow: number } }) {
  const now = useServerClock(stamina.serverNow);
  return (
    <div className="col-span-3 flex flex-col gap-1 border-t-2 border-window-frame pt-1">
      <StaminaMeter label="Travel" meter={stamina.travel} now={now} fill="bg-info" />
      <StaminaMeter label="Actions" meter={stamina.actions} now={now} fill="bg-exp" />
    </div>
  );
}
