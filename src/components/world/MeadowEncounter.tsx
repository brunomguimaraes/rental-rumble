import { useId, useRef } from 'react';
import { ballUrl } from '../../game/balls';
import type { OwnedMon } from '../../game/box';
import { ballCount, itemById, itemQuantity } from '../../game/items';
import { asAltColor, asShiny, CREATURES_BY_ID, spriteUrl } from '../../game/pokemon';
import type { CaptureBallId, RouteChoice, RouteEvent, RouteState } from '../../game/route-actions';
import { MEADOW_LANDMARKS } from '../../game/route-rules';
import { PixelSprite } from '../ui/PixelSprite';
import { MeadowScene } from './MeadowScene';
import { RouteBattleRewards } from './RouteResultView';
import { monName, POKEBALL, speciesName } from './scene';

export function MeadowEncounter({ event, state, box, locked, busy, selectedBall, onSelectBall, onChoose, onBag, onReplay }: {
  event: RouteEvent;
  state: RouteState;
  box: OwnedMon[];
  locked: boolean;
  busy: boolean;
  selectedBall: CaptureBallId | null;
  onSelectBall: (ball: CaptureBallId | null) => void;
  onChoose: (choice: RouteChoice, ballId?: CaptureBallId) => void;
  onBag: () => void;
  onReplay: () => void;
}) {
  const headingId = useId();
  const actions = useRef<HTMLHeadingElement>(null);
  const foe = event.foe;
  const name = foe ? speciesName(foe.dexId) : event.npc?.name ?? 'An encounter';
  const base = foe ? CREATURES_BY_ID[String(foe.dexId)] : null;
  const creature = base ? foe?.shiny ? asShiny(base) : foe?.altColor ? asAltColor(base) : base : null;
  const canCatch = event.choices.includes('catch');
  const full = state.ownedCount >= 600;
  const balls = ballCount(state.inventory);
  const ball = selectedBall && canCatch ? selectedBall : null;
  const quantity = ball ? itemQuantity(state.inventory, ball) : 0;
  const chance = ball ? event.catchChances?.[ball] : undefined;
  const canThrow = !locked && ball !== null && quantity > 0 && !full && chance !== undefined;
  const canChooseBall = !locked && canCatch && balls > 0 && !full;
  const title = event.kind === 'wild' ? event.phase === 'catch' ? 'One catch attempt remains' : 'A wild Pokémon appeared!' : event.npc?.name ?? 'An encounter';
  const imageAction = () => {
    if (ball && canThrow) onChoose('catch', ball);
    else if (canChooseBall) onBag();
    else actions.current?.focus({ preventScroll: true });
  };

  return <>
    <section className="ui-window m-2" aria-labelledby={headingId} aria-busy={busy}>
      <MeadowScene className="min-h-[360px]" label={`${name} encounter`}>
        <div className="absolute left-3 right-3 top-3 rounded-[3px] border border-window-rim bg-window px-3 py-2 shadow-[3px_3px_0_var(--color-edge)]">
          <p className="font-label text-[9px] uppercase text-info">{busy ? 'Saving your choice…' : title}</p>
          {foe && <p className="mt-1 text-xl">{name} {foe.shiny && <span className="text-caught-shiny">✦ Shiny</span>}{!foe.shiny && foe.altColor && <span className="text-caught-alt">Alternate color</span>}{foe.rare && <span className="ml-2 text-sm text-caught-shiny">Rare</span>}</p>}
        </div>
        <button type="button" disabled={locked} onClick={imageAction}
          aria-label={ball && canThrow ? `Throw 1 ${itemById(ball)?.name} at ${name}, ${Math.round((chance ?? 0) * 100)}% catch chance` : canChooseBall ? `${name}: choose a ball` : `${name}: view encounter choices`}
          className="ui-focus absolute left-1/2 top-[26%] flex w-48 -translate-x-1/2 flex-col items-center rounded-[3px] disabled:opacity-75">
          {event.npc ? <img src={`${import.meta.env.BASE_URL}sprites/trainers/${event.npc.spriteKey}.png`} width={192} height={192} alt="" className="h-48 w-48 object-contain [image-rendering:pixelated]" />
            : <PixelSprite src={creature?.sprite ?? (foe ? spriteUrl(foe.dexId) : POKEBALL)} fallback={POKEBALL} size={192} alt="" />}
          <span className={`rounded-[3px] border px-3 py-1.5 text-center text-sm shadow-[3px_3px_0_var(--color-edge)] ${ball && canThrow ? 'border-edge bg-accent text-edge' : 'border-window-rim bg-window text-ink'}`}>
            {ball && canThrow ? 'Tap to throw 1 ball' : canChooseBall ? 'Tap to choose a ball' : 'Encounter choices ↓'}
          </span>
        </button>
      </MeadowScene>
      <div className="border-t-2 border-window-frame p-3">
        <div className="flex items-start justify-between gap-2"><h2 id={headingId} ref={actions} tabIndex={-1} className="ui-focus rounded-[3px] text-xl">{ball ? 'Ready for your one throw?' : event.npc ? 'A moment on the path.' : event.phase === 'catch' ? 'Your chance to catch them.' : 'What will you do?'}</h2><span className="shrink-0 pt-1 text-xs text-ink-dim">No action cost</span></div>
        {event.npc && <p className="mt-2 text-base text-ink">“{event.npc.text}”</p>}
        {event.phase === 'researcher' && <p className="mt-2 text-sm text-ink-dim">{state.quest.status === 'not-accepted' ? 'Accept the survey to record your discoveries. Earlier finds count.' : state.quest.status === 'ready' ? 'You found every landmark. Claim your reward from the route’s survey.' : state.quest.status === 'claimed' ? 'Your survey reward is already in your Bag.' : `Survey progress: ${state.quest.landmarks.length} / ${state.quest.required.length} landmarks.`}</p>}
        {canCatch && balls === 0 && <p className="mt-2 text-sm text-accent">Your Bag has no capture balls. Battle or leave, then buy balls at the Village market or Explore for supplies.</p>}
        {canCatch && full && <p className="mt-2 text-sm text-accent">Your Box is full (600 Pokémon). You can still battle or leave.</p>}
        {ball ? <div className="mt-3 rounded-[3px] border-2 border-window-frame bg-slot p-3" aria-label="Confirm catch">
          <div className="flex items-center gap-2"><img src={ballUrl(ball)} width={32} height={32} alt="" className="[image-rendering:pixelated]" /><div className="min-w-0 flex-1"><p>{itemById(ball)?.name}</p><p className="text-xs text-ink-dim">{quantity} in your Bag</p></div><p className="text-2xl text-accent">{Math.round((chance ?? 0) * 100)}%</p></div>
          <p className="mt-2 text-sm text-ink-dim">One throw uses 1 ball and ends the encounter, whether it succeeds or fails.</p>
          {quantity === 0 && <p className="mt-2 text-sm text-accent">That ball is no longer available. Choose another ball.</p>}
          <button type="button" disabled={!canThrow} onClick={() => onChoose('catch', ball)} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-2 font-label text-[10px] uppercase">{busy ? 'Throwing…' : 'Throw 1 ball'}</button>
          <div className="mt-3 flex gap-2"><button type="button" disabled={locked} onClick={onBag} className="ui-button ui-focus min-h-11 flex-1 px-2 text-sm">Change ball</button><button type="button" disabled={locked} onClick={() => onSelectBall(null)} className="ui-button ui-focus min-h-11 flex-1 px-2 text-sm">Cancel</button></div>
        </div> : <>
          {event.kind === 'wild' && <p className="mt-2 text-sm text-ink-dim">{event.phase === 'catch' ? 'Winning improved your catch chance. Choose a ball for your one throw.' : 'Battle to earn EXP and improve your catch chance, or try a catch right away.'}</p>}
          <div className="mt-3 grid grid-cols-2 gap-3">
            {event.choices.includes('battle') && <button type="button" disabled={locked} onClick={() => onChoose('battle')} className="ui-button-primary ui-focus min-h-14 px-2 font-label text-[10px] uppercase">{busy ? 'Battling…' : 'Battle'}<span className="mt-1 block font-pixel text-xs normal-case">Earn EXP and ₽ on a win</span></button>}
            {canCatch && <button type="button" disabled={!canChooseBall} onClick={onBag} className={`${event.phase === 'catch' ? 'ui-button-primary col-span-2' : 'ui-button'} ui-focus min-h-14 px-2 font-label text-[10px] uppercase`}>Catch<span className="mt-1 block font-pixel text-xs normal-case">Choose a ball · one throw</span></button>}
            {event.choices.includes('accept') && <button type="button" disabled={locked} onClick={() => onChoose('accept')} className="ui-button-primary ui-focus col-span-2 min-h-12 px-3 font-label text-[10px] uppercase">Accept Meadow survey</button>}
            {event.choices.includes('talk') && <button type="button" disabled={locked} onClick={() => onChoose('talk')} className="ui-button-primary ui-focus col-span-2 min-h-12 px-3 font-label text-[10px] uppercase">Finish conversation</button>}
          </div>
        </>}
        <div className="mt-3 flex gap-2">
          {event.choices.includes('leave') && <button type="button" disabled={locked} onClick={() => onChoose('leave')} className="ui-button ui-focus min-h-11 flex-1 px-3 text-sm">Leave encounter</button>}
          {event.choices.includes('decline') && <button type="button" disabled={locked} onClick={() => onChoose('decline')} className="ui-button ui-focus min-h-11 flex-1 px-3 text-sm">Maybe another time</button>}
        </div>
        {event.newLandmarks.length > 0 && <p className="mt-3 border-t border-window-frame pt-2 text-sm text-accent">◆ Discovered: {event.newLandmarks.map((id) => MEADOW_LANDMARKS.find((landmark) => landmark.id === id)?.name ?? id).join(', ')}</p>}
      </div>
      <details className="border-t border-window-frame bg-slot p-3"><summary className="ui-focus min-h-8 rounded-[3px] text-sm">Your encounter party · {event.party.length}</summary><p className="mt-2 text-sm text-ink-dim">{event.party.map(monName).join(', ')}. Party changes apply to your next search.</p></details>
    </section>
    {event.battle && <RouteBattleRewards event={event} box={box} onReplay={onReplay} />}
  </>;
}
