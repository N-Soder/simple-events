
# Landing Page for Simple Events

## Overview
Create a new landing page at `/` that introduces Simple Events with a clean hero section and a call-to-action button. Move the current event creation form to `/create`.

## Changes

### 1. New file: `src/pages/LandingPage.tsx`
A simple, clean page with:
- Hero section with the PartyPopper icon and "Simple Events" branding
- Tagline: a short description of what Simple Events does (create private events, share a link, collect RSVPs, coordinate bring lists)
- A few feature highlights (no accounts needed, bring list coordination, guest privacy controls)
- A prominent "Create an Event" button linking to `/create`

### 2. Move `src/pages/Index.tsx` to `src/pages/CreateEvent.tsx`
Rename the file so the event creation form lives at a dedicated path. No content changes needed.

### 3. Update `src/App.tsx` routing
- `/` renders `LandingPage`
- `/create` renders `CreateEvent` (the current Index)
- All other routes stay the same

### 4. Update any internal links
- `src/pages/EventCreated.tsx` or other pages that link back to `/` for creating events should link to `/create` instead (if any exist)

## Technical Notes
- The landing page is a purely static component with no API calls or state
- Uses existing UI components (Button, Card) and Lucide icons for consistency
- The "Create an Event" button uses `react-router-dom`'s `Link` or `useNavigate` to go to `/create`
