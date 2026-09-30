import type { OwnedMon } from './box.js';
import type { ActivityResult, PublicActivity, StartInput, StepEvent, StepInput, WorldState } from './activity.js';

// Same-origin wrappers for /api/world/*. They never throw. `ok: false` means
// the request failed (with the server's player-facing sentence), `expired`
// that the session ended; neither ever reads as "nothing there".

export interface ClientError {
  ok: false;
  error: string;
  expired?: boolean;
  status?: number;
}

const NETWORK = 'Network error — please try again.';
const EXPIRED = 'Your session expired — sign in again.';

type Raw = Record<string, unknown>;
type Reply = { ok: true; data: Raw } | (ClientError & { data: Raw });

async function request(path: string, body?: unknown): Promise<Reply> {
  try {
    const res = await fetch(path, {
      credentials: 'include',
      cache: 'no-store',
      ...(body === undefined
        ? {}
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const parsed: unknown = await res.json().catch(() => ({}));
    const data: Raw = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Raw) : {};
    if (res.status === 401) return { ok: false, error: EXPIRED, expired: true, status: 401, data };
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: typeof data.error === 'string' ? data.error : 'Something went wrong.', status: res.status, data };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: NETWORK, data: {} };
  }
}

function errorOf(r: ClientError): ClientError {
  return { ok: false, error: r.error, ...(r.expired ? { expired: true } : {}), ...(r.status ? { status: r.status } : {}) };
}

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function fetchWorldState(): Promise<{ ok: true; state: WorldState } | ClientError> {
  const r = await request('/api/world/state');
  if (!r.ok) return errorOf(r);
  const d = r.data;
  if (typeof d.serverNow !== 'number' || !Array.isArray(d.places)) return { ok: false, error: 'Something went wrong.' };
  return {
    ok: true,
    state: {
      serverNow: d.serverNow,
      places: d.places as WorldState['places'],
      activity: isObj(d.activity) ? (d.activity as unknown as PublicActivity) : null,
      result: isObj(d.result) ? (d.result as unknown as ActivityResult) : null,
      trainerAt: typeof d.trainerAt === 'string' ? (d.trainerAt as WorldState['trainerAt']) : 'home',
    },
  };
}

export async function startActivity(
  input: StartInput,
): Promise<{ ok: true; activity: PublicActivity } | (ClientError & { activity?: PublicActivity; party?: string[] })> {
  const r = await request('/api/world/start', input);
  if (!r.ok) {
    return {
      ...errorOf(r),
      ...(isObj(r.data.activity) ? { activity: r.data.activity as unknown as PublicActivity } : {}),
      ...(Array.isArray(r.data.party) ? { party: r.data.party.filter((id): id is string => typeof id === 'string') } : {}),
    };
  }
  if (!isObj(r.data.activity)) return { ok: false, error: 'Something went wrong.' };
  return { ok: true, activity: r.data.activity as unknown as PublicActivity };
}

export async function stepExpedition(
  input: StepInput,
): Promise<
  | { ok: true; activity: PublicActivity | null; event: StepEvent; result: ActivityResult | null; box: OwnedMon[] | null }
  | (ClientError & { activity?: PublicActivity | null; result?: ActivityResult | null })
> {
  const r = await request('/api/world/step', input);
  const activity = isObj(r.data.activity) ? (r.data.activity as unknown as PublicActivity) : null;
  const result = isObj(r.data.result) ? (r.data.result as unknown as ActivityResult) : null;
  if (!r.ok) return { ...errorOf(r), activity, result };
  if (!isObj(r.data.event)) return { ok: false, error: 'Something went wrong.' };
  return {
    ok: true,
    activity,
    event: r.data.event as unknown as StepEvent,
    result,
    box: Array.isArray(r.data.box) ? (r.data.box as OwnedMon[]) : null,
  };
}

export async function finishActivity(activityId: string): Promise<{ ok: true; result: ActivityResult; box: OwnedMon[] | null } | ClientError> {
  const r = await request('/api/world/finish', { activityId });
  if (!r.ok) return errorOf(r);
  if (!isObj(r.data.result)) return { ok: false, error: 'Something went wrong.' };
  return { ok: true, result: r.data.result as unknown as ActivityResult, box: Array.isArray(r.data.box) ? (r.data.box as OwnedMon[]) : null };
}

export async function dismissResult(activityId: string): Promise<{ ok: true } | ClientError> {
  const r = await request('/api/world/dismiss', { activityId });
  return r.ok ? { ok: true } : errorOf(r);
}

/** An id for one start attempt, so a retried request returns the same activity. */
export function newRequestId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
