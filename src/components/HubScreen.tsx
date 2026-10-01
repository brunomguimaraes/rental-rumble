import type { AccountUser } from '../game/account';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { ballCount } from '../game/items';
import type { Profile } from '../game/profile';
import { professorById } from '../game/professions';
import type { RouteState } from '../game/route-actions';
import { HubParty } from './HubParty';
import { HubActivity } from './HubActivity';
import { HubTrainerBar } from './HubTrainerBar';
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
      <HubTrainerBar
        displayName={me.displayName || ''}
        mentorName={professor?.name ?? 'Professor'}
        partner={starterCreature}
        balls={world?.activated ? ballCount(world.inventory) : undefined}
        onOpenSettings={onViewAccount}
      />

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
