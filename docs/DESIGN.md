# Simple Events UI/UX design guide

Reference for anyone (human or agent) making visual or interaction changes here.
It records what the product *is*, the conventions already in the codebase, and
the decisions behind them, so future work extends the design instead of
re-litigating it.

Where this guide and the code disagree, the code is the bug. Fix the code.

---

## 1. What the product is

A host creates a private event page, shares one link, and collects RSVPs and a
bring list. **Nobody has an account**, not the host and not the guests.

Four consequences that should drive every design decision:

- **No accounts means no recovery.** A host who loses their admin link loses
  the event. Anything implying otherwise is a lie. `src/lib/myEvents.ts`
  carries this rule in a comment: local storage is *"a convenience, not a
  backup"*, and the UI must say **"on this device"** and never imply the links
  are recoverable any other way. Honour that phrasing.
- **The link is the product.** Sharing, copying, and previewing a link deserve
  more design attention than settings do.
- **Guests are strangers to the system.** A guest arrives cold, from a message,
  often on a phone. Guest-facing screens must explain themselves with no prior
  context and no onboarding.
- **Occasions, not admin.** This is a birthday dinner, not a project tracker.
  Warm and plain beats clever, and beats corporate.

---

## 2. Foundations

### Colour

All colour lives as HSL custom properties in `src/index.css` and is consumed
through Tailwind semantic names. **Never hardcode a hex in a component**. Use
`bg-background`, `text-muted-foreground`, `border-border`, `text-primary`.

| Token | Light | Role |
| --- | --- | --- |
| `background` | `40 33% 98%` | Warm cream page base, not white |
| `foreground` | `220 20% 14%` | Near-black ink, slightly blue |
| `primary` | `150 45% 38%` | Brand green. Actions and affirmatives |
| `secondary` / `muted` | `40 30% 94%` / `40 20% 95%` | Warm neutral fills |
| `accent` | `30 60% 94%` | Warm highlight wash |
| `destructive` | `0 72% 51%` | Deletion and errors only |
| `border` / `input` | `40 15% 89%` | Hairlines |

Green carries meaning: it marks the primary action, an affirmative state
(going, claimed, confirmed), and the host. It is not decoration. A page with
green in six unrelated places has lost the signal.

Dark tokens exist and are maintained, but no dark-specific design work has been
done. Using semantic tokens keeps pages functional in dark by default; treat
dark as *supported*, not *designed*.

### Type

Loaded in `src/index.css`, mapped in `tailwind.config.ts` so `font-sans` and
`font-serif` resolve to the brand stack.

- **DM Serif Display**: all headings, via a global `h1` to `h6` rule. Display face
  for titles and numbers. **Single weight (400).**
- **DM Sans**: body, labels, buttons, UI text. Weights 400/500/700.

Two rules that follow from the single weight:

1. **Never put `font-bold` or `font-semibold` on a heading.** There is no bold
   cut, so the browser synthesises one: smeared, uneven strokes. Size and
   colour create hierarchy instead.
2. **Non-heading text that should read as UI** (feature titles, field labels)
   needs an explicit `font-sans`, or the global rule will make it serif.

### Space, radius, motion

- Radius scales from `--radius: 0.75rem`. Use `rounded-lg/md/sm`; reach for
  `rounded-xl`/`2xl` only on large surfaces.
- Prefer whitespace over borders and cards. A hairline `border-t` separating
  rows usually beats wrapping each row in a card.
- Motion is restrained and always motivated: entrance, feedback, or state
  change, never ornament. The `rise` keyframe (`tailwind.config.ts`) staggered
  by `[animation-delay:Nms]` is the house entrance. A global
  `prefers-reduced-motion` guard in `index.css` neutralises all of it; don't
  add motion that bypasses that guard.

### Logo

`src/components/Logo.tsx`: guests seated around a table, host in brand green.
Standalone copy for the browser tab at `public/favicon.svg`.

- **The filled centre is structural, not decoration.** Without it the ring of
  dots reads as a loading spinner. This was verified at 16–32px; do not lighten
  or remove the centre disc.
- Seats and centre inherit `foreground`, the host dot is `primary`, so the mark
  adapts to theme automatically.
- Below ~24px the mark is at its legibility floor. Don't render it smaller;
  pair it with the wordmark instead.

---

## 3. Voice

Plain, warm, second person, British spelling. Say what a thing does, not how
advanced it is.

- **Sentence case everywhere**: headings, labels, buttons, card titles. Proper
  nouns keep their capitals (GitHub, Google Calendar, RSVP, Simple Events).
- **Name the consequence, not the mechanism.** "Guests won't need to type it.
  It's in the URL" beats "Embed credential in query fragment".
- **Never over-promise durability.** See the "on this device" rule in §1.
- **Never make a privacy claim the code cannot back.** The landing page briefly
  said "Nothing tracked". There is no analytics, no third-party script and no
  cookie in the app, but event names, guest names, locations and bring list
  items all sit in **plain text** in D1 (only `password_hash` is hashed), and
  Cloudflare keeps its own platform logs regardless. Prefer a specific,
  checkable fact: the copy now says events are auto-deleted 90 days after the
  event date, which matches `RETENTION_DAYS` in `cleanup-worker/src/index.ts`.
  Note that analytics can also be switched on in the Cloudflare dashboard
  without any change in this repo, so "no analytics" is not verifiable from
  code alone.
- Exclamation marks only at genuine moments of success, where the app already
  uses them ("Event created!", "RSVP submitted!", "Link copied!"). Never in
  errors, warnings or neutral notices, and never to manufacture enthusiasm.
  No "Oops!", no emoji in UI chrome.
- Buttons are verbs: *Create event*, *Copy link*, *Claim it*.

---

## 4. Layout

- **Page shell:** `<main className="min-h-[100dvh] bg-background">` wrapping a
  centred container. Use `100dvh`, never `h-screen`: mobile browser chrome
  makes `vh` lie.
- **Container width:** `max-w-2xl` is the house default for task pages
  (create, event, admin, my-events). `max-w-xl` for single-purpose
  confirmations. The landing page is the deliberate exception.
- **One measure per page.** Mixing a narrow hero with a full-width section
  reads as unbalanced rather than intentionally asymmetric.
- **Mobile is the guest's default.** Every guest-facing view must be checked at
  390px before it ships.

### The landing page pattern

The landing page is not a pitch. It is the first step of the flow. It asks
*"What are you planning?"*, takes the event name inline, and hands it to
`/create?name=…`. An empty submit still opens the form rather than blocking on
validation the host hasn't seen.

Extend this idea rather than reverting to a marketing page: the fastest path to
a created event beats any amount of persuasion.

---

## 5. Components

- **shadcn/ui in `src/components/ui/` is vendored.** Compose and pass
  `className`; don't fork a primitive to restyle it. If a variant is needed
  twice, add it to the component's `cva` config.
- **Icons: lucide-react only.** One icon set, no hand-rolled SVG paths. The
  logo is the sole exception, because a brand mark must be bespoke.
- **Forms: react-hook-form + zod.** The zod schema is the single source of
  truth for validation; don't add parallel checks in handlers.
- **Feedback: `useToast` for transient, inline text for field errors.** Never a
  browser `alert()`.

---

## 6. Accessibility baseline

Non-negotiable, and cheaper to keep than to retrofit:

- Every input has a `<Label htmlFor>` or an `aria-label`.
- Visible focus states; never remove the ring without replacing it.
- Icon-only buttons carry an accessible name.
- Body text ≥ 14px; hit targets ≥ 44px on touch.
- Colour is never the only signal. Pair it with text or an icon.
- Decorative SVG gets `aria-hidden`; meaningful SVG gets `role="img"` and a
  label.

---

## 7. Redesign checkpoint (August 2026)

The app-wide review resolved the previous high-priority backlog:

- The create flow now leads with name and date, keeps optional settings behind
  **More options**, and keeps the primary action reachable in a sticky footer.
- Banner upload and the preset gallery share one secondary "Event photo" area,
  preserving the preset-picker work added in `47d5b1d`.
- Guest visibility is a compact select rather than three competing cards.
- The created-event handoff makes the guest link primary and treats the
  one-time admin link as private, important information.
- Headings use the available 400-weight display face; fonts load from document
  links rather than a blocking CSS import.
- Route-level lazy loading replaces the previous single JavaScript bundle.
- Shared controls now carry consistent 44px touch targets, focus treatment,
  and reduced-motion behaviour.

Future work should be added here only after verifying it against the live UI at
320, 768, 1024, and 1440px, rather than inferred from component code alone.

---

## 8. Decision log

Why things are the way they are, so they don't get undone by accident.

| Decision | Reasoning |
| --- | --- |
| Table mark with a **filled** centre | The open ring read as a loading spinner at nav and favicon sizes. Two other logo directions were rejected for similar misreads: an outlined square with a tick read as a to-do checkbox, and a portrait card read as a phone. |
| Landing page is a name field, not a pitch | Fastest path to a created event. Three rounds of conventional marketing-page layouts were tried and rejected first. |
| Optional creation settings use progressive disclosure | Most hosts only need a name and date. Keeping photo, privacy, password and bring-list controls in one clearly labelled section preserves capability without making the default path feel like a form builder. |
| Preset banners and uploads share one event-photo area | They are two ways to make the same choice. Presenting them together avoids competing visual sections and keeps the merged preset gallery intact. |
| Headline serif, everything else sans | Existing brand pairing, retained deliberately. |
| No dark-mode design work | Explicitly out of scope; semantic tokens keep it functional without it being designed. |
| Placeholder stock photography rejected | A live product is not a comp. No image beats a `picsum.photos` filler. |
| Banners are resized in the browser, not on upload | The band is 224–288 px tall, so storing a 4032 px original pays R2 for pixels nobody sees and makes guests download them on a phone. Doing it at pick time rather than at submit also means a host is never told their photo is too big after filling in the whole form. |
| Crop frame fixed at 2:1, and the copy says the edges can be trimmed | The banner band ranges from about 1.7:1 on a phone to over 5:1 on a wide desktop, so no crop is faithful everywhere. Promising WYSIWYG would be the lie; giving the host control of the *subject* is the real need. 2:1 also suits the link-preview card. |
| Banner dimensions and file size sit behind an info button | A host setting up a barbecue does not need a file size in their eyeline, and an always-visible caption made the field read like an upload tool. The detail stays reachable, because it is the only place the resize is visible to someone wondering why their photo looks softer than the original. Same instinct as `TimeZoneNote`: explain only once someone asks. The empty dropzone says nothing about sizes at all, and the wording inside the popover is deliberately light-hearted — both were owner calls, not accidents. |
| The crop shows the whole photo with the discarded part dimmed, and the frame is not resizable | Hiding the overflow, as the first version did, meant choosing a crop blind: you could not see the sky you were cutting off. Dimming instead is what iOS Photos, Instagram and X all do. Resizable corner handles were considered and rejected — the ratio is not the host's to choose, so a locked-ratio marquee is only a zoom control with worse ergonomics, and handles are a poor target for a thumb. Stage and frame stay a fixed size at every zoom level, so nothing in the layout moves; only what sits in the margins changes. |
| A GIF banner is uploaded untouched | A canvas only sees the first frame, so resizing one would quietly drop the animation that was the reason for choosing it. The crop control is hidden for GIFs for the same reason. |
| Copy on the landing page is provisional | Written to fit the layout; not yet owner-approved wording. |
