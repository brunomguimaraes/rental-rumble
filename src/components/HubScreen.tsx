import type { AccountUser } from '../game/account';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import type { Profile } from '../game/profile';
import { professorById } from '../game/professions';
import type { RouteState } from '../game/route-actions';
import { HubParty } from './HubParty';
import { HubActivity } from './HubActivity';
import { Credits } from './Credits';
import { PrivacyPolicy } from './PrivacyPolicy';
import { InstallGuide } from './InstallGuide';
import type { WorldEntry } from './world/RouteScreen';

const ICON = (name: string) => `${import.meta.env.BASE_URL}sprites/ui/night/96/${name}.png`;

export function HubScreen({
  me, box, profile, party, world, worldError, location,
  onViewBox, onViewDex, onViewGuide, onViewAccount, onEditParty, onOpenMap, onVisit, onOpenBag, onRetryWorld,
}: {
  me: AccountUser;
  box: OwnedMon[];
  profile: Profile;
  /** The saved party's rows, lead first. */
  party: OwnedMon[];
  world: RouteState | null;
  worldError: string | null;
  location: 'home' | 'r1';
  onViewBox: () => void;
  onViewDex: () => void;
  onViewGuide: () => void;
  onViewAccount: () => void;
  onEditParty: () => void;
  onOpenMap: () => void;
  onVisit: (entry: WorldEntry) => void;
  onOpenBag: () => void;
  onRetryWorld: () => void;
}) {
  const professor = professorById(profile.mentor);
  const starter = box.find((m) => m.id === profile.starterId);
  const starterCreature = starter ? ownedMonToCreature(starter) : null;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[552px] flex-col gap-5 px-4 py-5 font-pixel text-ink">
      <header className="ui-window flex items-center justify-between gap-2 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`} alt="" className="h-9 w-9 object-contain [image-rendering:pixelated]" />
          <div className="min-w-0">
            <div className="break-words font-label text-[11px] uppercase leading-relaxed">Trainer {me.displayName || ''}</div>
            <div className="mt-1 text-xs text-ink-dim">{professor?.name ?? 'Professor'}’s protégé{starterCreature ? ` · ${starterCreature.name}` : ''}</div>
          </div>
        </div>
        <button type="button" onClick={onViewAccount} aria-label="Account" className="ui-button ui-focus grid min-h-11 min-w-11 shrink-0 place-items-center text-xl">⚙</button>
      </header>

      <HubActivity
        world={world}
        worldError={worldError}
        location={location}
        lead={party[0]}
        onVisit={onVisit}
        onRetry={onRetryWorld}
      />
      <HubParty members={party} onEdit={onEditParty} />

      <nav aria-label="Trainer shortcuts" className="grid grid-cols-2 gap-3">
        {[
          { label: 'World map', icon: 'world-map', onClick: onOpenMap },
          { label: 'Your box', icon: 'your-box', onClick: onViewBox },
          { label: 'Bag', icon: 'item-bag', onClick: onOpenBag },
          { label: 'Pokédex', icon: 'party', onClick: onViewDex },
        ].map((link) => <button key={link.label} type="button" onClick={link.onClick} className="ui-button ui-focus flex min-h-16 items-center gap-2 px-2 text-left">
          <img src={ICON(link.icon)} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]" />
          <span className="font-label text-[10px] uppercase">{link.label}</span>
        </button>)}
      </nav>

      <nav aria-label="Help and information" className="mt-auto flex flex-wrap items-center justify-center gap-2 py-4 text-xs">
        <button type="button" onClick={onViewGuide} className="ui-button ui-focus min-h-11 px-3 font-label text-[9px] uppercase">Field guide</button>
        <span className="flex items-center gap-4 px-2">
          <InstallGuide />
          <Credits />
          <PrivacyPolicy />
        </span>
      </nav>
    </div>
  );
}
