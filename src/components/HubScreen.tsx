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

export function HubScreen({
  me, box, profile, party, world, worldError, serverOffsetMs,
  onViewBox, onViewDex, onViewGuide, onViewAccount, onEditParty, onOpenMap, onOpenActivity, onOpenBag, onRetryWorld,
}: {
  me: AccountUser;
  box: OwnedMon[];
  profile: Profile;
  /** The saved party's rows, lead first. */
  party: OwnedMon[];
  world: RouteState | null;
  worldError: string | null;
  serverOffsetMs: number;
  onViewBox: () => void;
  onViewDex: () => void;
  onViewGuide: () => void;
  onViewAccount: () => void;
  onEditParty: () => void;
  onOpenMap: () => void;
  onOpenActivity: () => void;
  onOpenBag: () => void;
  onRetryWorld: () => void;
}) {
  const professor = professorById(profile.mentor);
  const starter = box.find((m) => m.id === profile.starterId);
  const starterCreature = starter ? ownedMonToCreature(starter) : null;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-5 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`} alt="" className="h-9 w-9 object-contain [image-rendering:pixelated]" />
          <div>
            <div className="bg-gradient-to-br from-white to-white/50 bg-clip-text text-xl font-black tracking-tight text-transparent">TRAINER {me.displayName?.toUpperCase() || ''}</div>
            <div className="text-xs text-white/50">{professor?.name ?? 'Professor'}’s protégé{starterCreature ? ` · partner: ${starterCreature.name}` : ''}</div>
          </div>
        </div>
        <button type="button" onClick={onViewAccount} className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/[0.08]">Account</button>
      </header>

      <HubParty members={party} onEdit={onEditParty} />
      <HubActivity
        world={world}
        worldError={worldError}
        serverOffsetMs={serverOffsetMs}
        onOpenMap={onOpenMap}
        onOpenActivity={onOpenActivity}
        onOpenBag={onOpenBag}
        onOpenBox={onViewBox}
        onRetry={onRetryWorld}
      />

      <nav className="mt-auto flex flex-wrap items-center justify-center gap-2 pt-10 text-xs">
        {[{ label: 'Pokédex', on: onViewDex }, { label: 'Guide', on: onViewGuide }].map((l) => (
          <button key={l.label} type="button" onClick={l.on} className="rounded-full border border-white/10 bg-white/[0.02] px-4 py-1.5 font-semibold text-white/60 hover:bg-white/[0.06] hover:text-white">{l.label}</button>
        ))}
        <span className="flex items-center gap-4 px-2">
          <InstallGuide />
          <Credits />
          <PrivacyPolicy />
        </span>
      </nav>
    </div>
  );
}
