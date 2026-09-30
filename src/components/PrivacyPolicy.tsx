import { useState } from 'react';

/** A self-contained "Privacy" button + modal. Rental Rumble requires an
 *  account, so this spells out exactly what the account layer stores, where,
 *  and how to get it deleted. Keep it factual: if the data we handle changes,
 *  update this copy. */
export function PrivacyPolicy() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white/45 underline-offset-4 transition hover:text-white/80 hover:underline"
      >
        Privacy
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0e0e15] p-5 text-left sm:rounded-3xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-black">Privacy Policy</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Rental Rumble is a free, non-commercial fan project. We don't sell
              anything, we don't run ads, and we don't sell or share your data.
              You need an account to play, so this page explains exactly what
              that account stores.
            </p>

            <Section title="What we store">
              <ul className="list-disc space-y-1 pl-5">
                <li>Your email address and the display name you choose.</li>
                <li>
                  How you sign in: a salted password hash for email accounts
                  (never the password itself), or the account id Discord or
                  Google gives us if you use one of those.
                </li>
                <li>
                  A signed session cookie that keeps you signed in. It is the
                  only cookie we set.
                </li>
                <li>
                  Your game: your profile (profession and professor), the
                  Pokémon you own and their nicknames, your Pokédex progress,
                  and your idle sessions with their encounter logs.
                </li>
              </ul>
            </Section>

            <Section title="Where it lives">
              <p>
                Account and game data are kept in a Turso database. Upstash
                Redis is used only for rate limiting (short-lived counters that
                slow down abuse), not for storing your data. Resend sends the
                email-verification and password-reset messages, so it sees your
                email address when one is sent.
              </p>
              <p className="mt-2">
                Your browser also keeps a few preferences in local storage (the
                display name you last used and your battle speed). They never
                leave your device.
              </p>
            </Section>

            <Section title="Analytics & hosting">
              <p>
                The only analytics is Vercel Analytics, which counts page views
                without cookies. The site is served by Vercel, which may process
                standard request information (such as IP address and browser
                type) in its server logs to deliver and secure the site, as its
                own privacy policy describes.
              </p>
            </Section>

            <Section title="Deleting your data">
              <p>
                There is no self-serve delete button yet. To have your account
                and everything attached to it deleted, or for any privacy
                question, email{' '}
                <a
                  href="mailto:pokerentalrumble@gmail.com"
                  className="font-semibold text-white underline underline-offset-2"
                >
                  pokerentalrumble@gmail.com
                </a>{' '}
                from the address on your account. This is a hobby project not
                directed at children.
              </p>
            </Section>

            <p className="mt-5 text-xs leading-relaxed text-white/40">
              Rental Rumble is an unofficial, non-commercial fan project. It is
              not affiliated with, endorsed, sponsored, or approved by Nintendo,
              Game Freak, or The Pokémon Company, and does not own or claim any
              rights to any Nintendo trademark or the Pokémon trademark. All such
              references are used for commentary and informational purposes only.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">
        {title}
      </h3>
      <div className="mt-2 text-sm leading-relaxed text-white/70">
        {children}
      </div>
    </div>
  );
}
