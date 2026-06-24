import { useState } from 'react';

/** A self-contained "Privacy" button + modal. Rental Rumble is a pure frontend
 *  with no accounts, ads, cookies, or third-party analytics — the only data it
 *  ever stores is what you type to post a leaderboard score. This panel spells
 *  that out plainly so players know exactly what does and doesn't leave their
 *  device. Keep it factual: if the data we handle changes, update this copy. */
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
              anything, we don't run ads, and we don't want your personal data.
              There are no accounts to create. This page explains the little bit
              of data the game touches.
            </p>

            <Section title="What we don't collect">
              <p>
                No tracking, no advertising, no third-party analytics, and no
                cookies. We don't ask for your email, and there's nothing to log
                in to. The game runs entirely in your browser.
              </p>
            </Section>

            <Section title="Stored on your device only">
              <p>
                The game saves a small amount of data in your browser's local
                storage so it can remember your progress and the display name
                you last used for the leaderboard. This never leaves your device
                and you can clear it at any time from your browser settings.
              </p>
            </Section>

            <Section title="The daily leaderboard (only if you choose to post)">
              <p>
                If you beat the daily Champion and decide to submit a score, we
                store the display name you type (you can stay “Anonymous”),
                along with your run's result — the Pokémon team you used (species
                and sign), how far you got, and the time of your win. That's it.
                We don't attach this to your identity, and submitting is
                entirely optional — you can play the whole game without ever
                posting.
              </p>
              <p className="mt-2">
                Leaderboard entries are stored on a hosting provider's database
                (Upstash Redis) and automatically expire after about 40 days.
                Please don't type real personal information into the name field.
              </p>
            </Section>

            <Section title="Hosting & external links">
              <p>
                The site is served by our hosting provider (Vercel), which may
                process standard technical request information (such as IP
                address and browser type) in its server logs to deliver and
                secure the site, as described in its own privacy policy. The
                “Buy me a coffee” and Pix support links are optional and lead to
                third-party services with their own privacy policies — we never
                see your payment details.
              </p>
            </Section>

            <Section title="Children & contact">
              <p>
                This is a hobby project not directed at collecting data from
                anyone, including children. If you'd like a leaderboard entry
                removed or have any privacy question, reach out at{' '}
                <a
                  href="mailto:pokerentalrumble@gmail.com"
                  className="font-semibold text-white underline underline-offset-2"
                >
                  pokerentalrumble@gmail.com
                </a>
                .
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
