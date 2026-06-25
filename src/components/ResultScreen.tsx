import { useEffect, useRef, useState } from 'react';
import type { Creature, Opponent, RelicId } from '../game/types';
import { renderShareBlob } from '../game/shareCard';
import { dailyKey } from '../game/opponents';
import type { LeaderboardEntry, ThroneGrant } from '../game/leaderboard';
import type { BracketId } from '../game/gens';
import type { Difficulty } from '../game/run';
import { Leaderboard } from './Leaderboard';
import { RelicStrip } from './RelicStrip';
import { SupportLinks } from './SupportLinks';

export function ResultScreen({
  gauntlet,
  won,
  team,
  seed,
  runToken = null,
  clearedStages,
  bracket,
  difficulty,
  relics = [],
  lostToTeam = [],
  onPlayAgain,
  onChallengeThrone,
}: {
  gauntlet: Opponent[];
  won: boolean;
  team: Creature[];
  seed: string;
  /** Signed run token from the server — proves the run was authorised. */
  runToken?: string | null;
  clearedStages: number;
  /** Team-wide relics collected this run (see relics.ts), submitted with the win. */
  relics?: RelicId[];
  /** The generation bracket this run was locked to (drives which board it ranks on). */
  bracket: BracketId;
  /** The mode this run was played on (drives leaderboard rank). */
  difficulty: Difficulty;
  /** Team of the trainer who ended the run — drawn on the loss share card. */
  lostToTeam?: Creature[];
  onPlayAgain: () => void;
  /** Stake a Master win's one shot at the reigning Master #1 (the throne). */
  onChallengeThrone?: (grant: ThroneGrant, king: LeaderboardEntry) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const fellTo = !won ? gauntlet[clearedStages] : null;
  const fileName = `rental-rumble-${won ? 'champion' : `${clearedStages}of${gauntlet.length}`}.png`;

  const shareText = won
    ? `I became Champion in Rental Rumble! Same gauntlet, can you take the crown?`
    : `I cleared ${clearedStages}/${gauntlet.length} in Rental Rumble${
        fellTo ? `, fell to ${fellTo.name}` : ''
      }. Can you do better?`;

  // Render the shareable card once the team is known.
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    setBuilding(true);
    renderShareBlob({ team, won, clearedStages, gauntlet, bracket, difficulty, fellToTeam: lostToTeam })
      .then((blob) => {
        if (!alive) return;
        blobRef.current = blob;
        url = URL.createObjectURL(blob);
        setImageUrl(url);
      })
      .catch(() => setImageUrl(null))
      .finally(() => alive && setBuilding(false));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = fileName;
    a.click();
  };

  const share = async () => {
    const blob = blobRef.current;
    const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;

    // Best case: native share sheet with the image attached.
    if (
      file &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: 'Rental Rumble',
          text: shareText,
        });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }

    // Fallback: copy the brag text, and make sure they still get the image.
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
    download();
    setShareNote('Image downloaded · caption copied');
    window.setTimeout(() => setShareNote(null), 2600);
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center px-4 py-8 text-center sm:px-6">
      <div className="animate-floaty">
        {won ? (
          <img
            src={`${import.meta.env.BASE_URL}sprites/ui/masterball.png`}
            alt="Champion"
            className="mx-auto h-28 w-auto object-contain [image-rendering:pixelated] drop-shadow-[0_4px_20px_rgba(168,85,247,0.35)] sm:h-36"
          />
        ) : (
          <img
            src={`${import.meta.env.BASE_URL}sprites/ui/cubone-skull.png`}
            alt="Defeated"
            className="mx-auto h-28 w-auto object-contain drop-shadow-[0_4px_20px_rgba(255,255,255,0.15)] sm:h-36"
          />
        )}
      </div>
      <h2
        className={`mt-3 text-3xl font-black sm:text-4xl ${
          won ? 'text-amber-300' : 'text-rose-300'
        }`}
      >
        {won ? 'CHAMPION!' : 'Run Over'}
      </h2>
      <p className="mt-2 text-white/60">
        {won
          ? 'You ran the gauntlet and took the crown. Flawless drafting.'
          : `Your team cleared ${clearedStages} of ${gauntlet.length} and fell to ${fellTo?.name}, the ${fellTo?.title}.`}
      </p>

      {/* Shareable team card preview */}
      <div className="mt-6 w-full max-w-sm">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Your Rental Rumble team"
              className="block w-full"
            />
          ) : (
            <div className="grid aspect-[4/5] w-full place-items-center text-sm text-white/40">
              {building ? 'Painting your team card…' : 'Could not build image'}
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] text-white/35">
          Your six picks, rendered to a shareable card — portraits and all.
        </p>
      </div>

      <div className="mt-5 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <button
          type="button"
          onClick={share}
          disabled={building}
          className="rounded-full bg-white px-6 py-3 font-bold text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
        >
          {copied ? '✓ Caption copied!' : 'Share team 📣'}
        </button>
        <button
          type="button"
          onClick={download}
          disabled={building || !imageUrl}
          className="rounded-full border border-white/20 px-6 py-3 font-bold transition hover:bg-white/10 disabled:opacity-40"
        >
          Download PNG
        </button>
        <button
          type="button"
          onClick={onPlayAgain}
          className="rounded-full border border-white/20 px-6 py-3 font-bold transition hover:bg-white/10"
        >
          New run →
        </button>
      </div>
      <div className="mt-2 h-4 text-xs text-white/45">{shareNote}</div>

      <RelicStrip relics={relics} className="mt-6 justify-center" />

      <Leaderboard
        date={dailyKey()}
        runBracket={bracket}
        canSubmit={won}
        run={{
          difficulty,
          seed,
          stage: gauntlet.length - 1,
          clearedStages,
          team,
          relics,
          token: runToken,
        }}
        onChallengeThrone={onChallengeThrone}
      />

      <div className="mt-8">
        <p className="mb-2 text-xs text-white/40">
          Enjoying Rental Rumble? Help keep it running:
        </p>
        <SupportLinks />
      </div>
    </div>
  );
}
