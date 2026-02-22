

# 🎉 Private Event Planner

A clean, minimal event planning app where anyone can create events and share them via password-protected links — no accounts needed.

## Core Flow
1. **Anyone visits the site** → sees a simple "Create Event" page
2. **Host fills in event details** → gets two links: a **guest link** (with optional embedded password) and an **admin edit link**
3. **Guests open the link** → enter password (or it's auto-filled from URL) → see event details, RSVP, and sign up to bring items

---

## Pages & Features

### 1. Landing / Create Event Page
- Clean form to create an event:
  - Event name, description, date & time, location (text field), optional banner photo upload
  - Set a guest password
  - **Guest visibility setting** — host chooses one of three options:
    - **Full guest list** — names and attendance counts visible to all guests
    - **Total count only** — guests see "12 adults, 3 kids attending" but no names
    - **Hidden** — no guest data shown (only the bring-list items remain visible)
  - Add a "bring list" — host types items guests can volunteer for (e.g., Salad, Drinks, Dessert)
- On submit → generates the event and shows the **guest share link** and **admin edit link**

### 2. Event Page (Guest View)
- Banner photo (if set), event name, date/time, location, description
- **RSVP Section**: Guest enters their name, number of adults attending, number of kids attending
- **Guest Info Section** (varies by host setting):
  - Full list: shows each RSVP with name + counts
  - Total only: shows aggregate "X adults, Y kids attending"
  - Hidden: section not shown at all
- **Bring List Section**: Shows host's suggested items with who's signed up. Guests can pick from the list OR add their own custom item. All selections visible to everyone to avoid duplicates (always visible regardless of guest visibility setting).
- Simple honeypot field for basic bot protection
- Password gate — if password not in URL, show a simple password prompt first

### 3. Admin Edit Page
- Accessed via separate secret admin link (UUID-based token)
- Edit all event details including **guest visibility setting** (changeable anytime)
- Update the bring list
- Always see the full guest/RSVP list regardless of visibility setting
- No login required — the link IS the authentication

---

## Privacy & Security
- **Unguessable UUIDs** for both event and admin URLs
- **Password protection** on guest access (embeddable in URL hash fragment)
- **Configurable guest visibility** — host controls what attendees see about each other
- **No public event listing** — events only accessible via direct link
- **`noindex` / `robots.txt`** to prevent search engine indexing
- **Honeypot anti-spam** field on RSVP form

## Design
- Clean & minimal, lots of white space
- Mobile-friendly responsive layout
- Light, friendly typography

## Backend (Supabase / Lovable Cloud)
- Database tables for events (including guest_visibility setting), RSVPs, and bring-list items
- Storage bucket for banner photos
- Row-level security policies scoped by event password/token

