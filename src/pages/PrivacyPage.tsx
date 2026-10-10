import type { ReactNode } from "react";
import AppHeader from "@/components/AppHeader";
import { RETENTION_DAYS } from "@/lib/myEvents";

const CONTACT = "privacy@soderholm.app";

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-10 border-t border-border pt-7">
    <h2 className="text-2xl">{title}</h2>
    <div className="mt-3 space-y-3 leading-7 text-muted-foreground">{children}</div>
  </section>
);

const List = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc space-y-1.5 pl-5">{children}</ul>
);

const PrivacyPage = () => (
  <main id="main-content" className="page-texture min-h-[100dvh] bg-background">
    <AppHeader backTo="/" backLabel="Home" />
    <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="eyebrow">Privacy</p>
      <h1 className="mt-3 text-4xl leading-tight tracking-[-0.025em] sm:text-5xl">How your details are handled</h1>
      <p className="mt-4 text-lg leading-8 text-muted-foreground">
        A plain-English summary of what Simple Events stores, who can see it and when it’s deleted. There are no accounts.
      </p>

      <Section title="What we store">
        <p>When a host creates an event, we store:</p>
        <List>
          <li>the event’s name, date, time, time zone, place, description and banner image</li>
          <li>the bring list, if the host adds one</li>
          <li>a scrambled (hashed) copy of the event password, if one is set</li>
          <li>the private key behind the host’s admin link</li>
        </List>
        <p>When a guest replies, we store:</p>
        <List>
          <li>the name they enter and how many adults and kids are coming</li>
          <li>what they said they would bring, and any note with it</li>
          <li>the private key behind their own edit link</li>
        </List>
        <p>We don’t store email addresses, payment details, or your IP address with an event or a reply.</p>
      </Section>

      <Section title="Email addresses">
        <p>
          Email is optional. If you enter an address to have your links or a confirmation sent to you, it is used once
          to send that email and is not saved with the event or your reply.
        </p>
        <List>
          <li>To limit how many emails can be sent to one address, we keep a scrambled fingerprint of it for up to 48 hours. It can’t be turned back into your address.</li>
          <li>Our email provider, Resend, keeps a delivery log that includes your address and the email itself for up to 30 days.</li>
          <li>We send that one email and nothing after it. There is no mailing list.</li>
        </List>
      </Section>

      <Section title="On your device">
        <p>
          Your browser keeps a few things in its own storage so you don’t lose them: the events you created, with their
          admin links and guest links (a guest link includes the event password if you chose to add it to the link); the
          edit link for a reply you sent; and a token that lets you open a password-protected event again without typing
          its password. This stays on your device, and clearing your browser’s site data removes it.
        </p>
      </Section>

      <Section title="Who can see what">
        <List>
          <li>The host sees every reply: names, head counts and what people are bringing.</li>
          <li>Guests see what the host allows: the full guest list, only the totals, or nothing. Names on the bring list are visible to anyone who can open the event.</li>
          <li>Apart from our email provider (see above), nobody sees an email address you enter. Hosts are never shown their guests’ addresses.</li>
        </List>
        <p>Anyone who has a link can open it (a guest link still needs the event password, if the host set one), so treat links like a key and only share them with the right people.</p>
      </Section>

      <Section title="Services we use">
        <List>
          <li><strong className="font-medium text-foreground">Cloudflare</strong> hosts the site, the database and banner images. If you enter an email address, it also runs a bot check (Turnstile), which looks at technical details such as your IP address and browser to tell people from bots.</li>
          <li><strong className="font-medium text-foreground">Resend</strong> delivers email. It’s only involved if you ask for one.</li>
          <li><strong className="font-medium text-foreground">Google Fonts</strong> serves the typefaces, so your browser contacts Google when a page loads.</li>
        </List>
        <p>There are no analytics, ads or trackers on this site.</p>
      </Section>

      <Section title="Never sold or used for marketing">
        <p>Your details are never sold, rented or shared for marketing. Any email we send is the one you asked for.</p>
      </Section>

      <Section title="When it’s deleted">
        <List>
          <li>Automatically, {RETENTION_DAYS} days after the event date: the event, every reply, the bring list and the banner.</li>
          <li>Straight away, if the host deletes the event from its dashboard.</li>
          <li>A guest can cancel their reply from their edit link. The reply is kept, marked as cancelled, until the event is deleted, and their bring-list items are released. A host can remove any reply.</li>
        </List>
        <p>Cloudflare’s database recovery backups may still hold deleted data for up to 30 days before it’s gone for good.</p>
      </Section>

      <Section title="Removal requests and questions">
        <p>
          If you’re on a guest list and want your details removed, ask the host, who can remove any reply, or email{" "}
          <a className="font-medium text-foreground underline underline-offset-2" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          Questions about this notice go to the same address.
        </p>
      </Section>

      <p className="mt-12 text-sm text-muted-foreground">
        Last updated 10 October 2026. This is a plain-language notice, not legal advice.
      </p>
    </article>
  </main>
);

export default PrivacyPage;
