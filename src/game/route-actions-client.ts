import type { OwnedMon } from './box.js';
import type { RouteChooseInput, RouteQuestInput, RouteReply, RouteSearchInput, RouteState } from './route-actions.js';

export interface RouteClientError {
  ok: false;
  error: string;
  expired?: boolean;
  status?: number;
  /** The server may have committed a write. Keep its exact request ID. */
  uncertain?: boolean;
  state?: RouteState;
  party?: string[];
}
export type RouteClientReply = ({ ok: true } & RouteReply) | RouteClientError;
export type RouteCommand =
  | { operation: 'activate'; input: { requestId: string } }
  | { operation: 'search'; input: RouteSearchInput }
  | { operation: 'choose'; input: RouteChooseInput }
  | { operation: 'quest-claim'; input: RouteQuestInput }
  | { operation: 'heal'; input: { requestId: string } };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isRouteState(v: unknown): v is RouteState {
  if (!isObject(v) || !isNumber(v.serverNow) || !isNumber(v.revision) || typeof v.activated !== 'boolean') return false;
  if (!isObject(v.inventory) || !isNumber(v.inventory.revision) || !Array.isArray(v.inventory.stacks)) return false;
  if (!v.inventory.stacks.every((stack) => isObject(stack) && (stack.itemId === 'poke' || stack.itemId === 'great') && Number.isSafeInteger(stack.quantity) && Number(stack.quantity) >= 0)) return false;
  if (!isObject(v.allowance) || !isNumber(v.allowance.available) || !isNumber(v.allowance.capacity) || !isNumber(v.allowance.refillEveryMs)) return false;
  if (v.allowance.nextRefillAt !== null && !isNumber(v.allowance.nextRefillAt)) return false;
  if (!isObject(v.quest) || !Array.isArray(v.quest.landmarks) || !Array.isArray(v.quest.required) || !isObject(v.legacy)) return false;
  return Array.isArray(v.places) && (v.trainerAt === 'home' || v.trainerAt === 'r1') && isNumber(v.ownedCount)
    && (v.activeEvent === null || isObject(v.activeEvent)) && (v.result === null || isObject(v.result));
}

/** A late reply cannot rewind inventory, an encounter, or the action bank. */
export function reconcileRouteState(current: RouteState | null, incoming: RouteState): RouteState {
  if (!current) return incoming;
  if (incoming.revision < current.revision || incoming.inventory.revision < current.inventory.revision) return current;
  if (incoming.revision === current.revision && incoming.serverNow < current.serverNow) return current;
  return incoming;
}

/** Box and world hydrate in parallel; keep a newer mutation's Box while those reads finish. */
export function shouldApplyHydratedBox({ startedAtRevision, current, incoming }: {
  startedAtRevision: number | null;
  current: RouteState | null;
  incoming: RouteState | null;
}): boolean {
  if (current && current.revision > (startedAtRevision ?? -1)) return false;
  return incoming === null || reconcileRouteState(current, incoming) === incoming;
}

async function request(operation: string, body?: unknown): Promise<RouteClientReply> {
  try {
    const response = await fetch(`/api/world/${operation}`, {
      credentials: 'include', cache: 'no-store',
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const raw: unknown = await response.json().catch(() => null);
    const data = isObject(raw) ? raw : {};
    const state = isRouteState(data.state) ? data.state : undefined;
    if (response.status === 401) return { ok: false, expired: true, status: 401, error: typeof data.error === 'string' ? data.error : 'Your session expired — sign in again.' };
    if (!response.ok || data.ok !== true) {
      return {
        ok: false, status: response.status,
        error: typeof data.error === 'string' ? data.error : 'The route is unavailable. Please try again.',
        ...((response.status >= 500 || (response.ok && data.ok !== false)) && body !== undefined ? { uncertain: true } : {}),
        ...(state ? { state } : {}),
        ...(Array.isArray(data.party) ? { party: data.party.filter((id): id is string => typeof id === 'string') } : {}),
      };
    }
    if (!state) return { ok: false, uncertain: body !== undefined, error: 'The route response was incomplete. Please retry to recover your progress.' };
    return {
      ok: true, state,
      ...(Array.isArray(data.box) ? { box: data.box as OwnedMon[] } : {}),
      ...(isObject(data.event) ? { event: data.event as unknown as NonNullable<RouteReply['event']> } : {}),
      ...(data.replayed === true ? { replayed: true } : {}),
    };
  } catch {
    return { ok: false, uncertain: body !== undefined, error: 'Network error — please retry. Your action will not be spent twice.' };
  }
}

export const fetchRouteState = (): Promise<RouteClientReply> => request('state');
export const activateRoute = (input: { requestId: string }): Promise<RouteClientReply> => request('activate', input);
export const searchRoute = (input: RouteSearchInput): Promise<RouteClientReply> => request('search', input);
export const chooseRoute = (input: RouteChooseInput): Promise<RouteClientReply> => request('choose', input);
export const claimRouteQuest = (input: RouteQuestInput): Promise<RouteClientReply> => request('quest-claim', input);
export const dismissRouteResult = (eventId: string): Promise<RouteClientReply> => request('result-dismiss', { eventId });
export const healAtCenter = (input: { requestId: string }): Promise<RouteClientReply> => request('heal', input);
export const runRouteCommand = (command: RouteCommand): Promise<RouteClientReply> => request(command.operation, command.input);

export function newRouteRequestId(): string {
  return globalThis.crypto.randomUUID();
}

function pendingKey(accountKey: string): string { return `rental-rumble:route-command:${encodeURIComponent(accountKey)}`; }

/** Tab-local storage survives a reload, without another tab replacing an uncertain command. */
export function readPendingRouteCommand(accountKey: string): RouteCommand | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(pendingKey(accountKey)) ?? 'null');
    if (!isObject(value) || !isObject(value.input) || typeof value.input.requestId !== 'string') return null;
    if (!['activate', 'search', 'choose', 'quest-claim', 'heal'].includes(String(value.operation))) return null;
    return value as unknown as RouteCommand;
  } catch { return null; }
}

export function savePendingRouteCommand(accountKey: string, command: RouteCommand): void {
  try { sessionStorage.setItem(pendingKey(accountKey), JSON.stringify(command)); } catch { /* The in-memory command still protects this visit. */ }
}

export function clearPendingRouteCommand(accountKey: string): void {
  try { sessionStorage.removeItem(pendingKey(accountKey)); } catch { /* Storage may be disabled. */ }
}
