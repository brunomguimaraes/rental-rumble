import type { OwnedMon } from './box';
import type { Profile } from './profile';

/**
 * Onboarding is finished only once the tutorial gift is in the box. A profile
 * without one was interrupted mid-tutorial, even when the box also holds
 * catches from before onboarding existed (legacy accounts).
 */
export function needsOnboarding(profile: Profile | null, box: readonly OwnedMon[]): boolean {
  return !profile || !box.some((m) => m.origin === 'tutorial');
}

/** The starter to resume the tutorial with; the box is newest-first, so search by origin. */
export function resumeStarterOf(box: readonly OwnedMon[]): OwnedMon | undefined {
  return box.find((m) => m.origin === 'starter');
}
