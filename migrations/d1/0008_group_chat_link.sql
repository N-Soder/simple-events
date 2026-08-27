-- Optional group chat link: a WhatsApp/Signal/Telegram invite, or any other
-- place the host wants guests to gather once they have replied.
--
-- Kept separate from `location_url` because it answers a different question.
-- The location link is "where is this"; this one is "where do we talk about
-- it", and it is shown at a different moment in the flow.
--
-- `contact_visibility` defaults to 'after_rsvp' because a group invite link is
-- a capability, not a detail: anyone holding a WhatsApp invite can join the
-- group. Putting it in the page header means it travels with every forward of
-- the event link. Gating it behind a reply is a speed bump rather than a
-- guarantee -- there are no accounts here, so anyone willing to RSVP can see
-- it -- and the guest-facing copy says exactly that.
ALTER TABLE events ADD COLUMN contact_url TEXT;
ALTER TABLE events ADD COLUMN contact_visibility TEXT NOT NULL DEFAULT 'after_rsvp'
  CHECK(contact_visibility IN ('always', 'after_rsvp'));
