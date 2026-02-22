

# Store Event Password Locally

After a guest successfully enters the event password, save it in `localStorage` so they don't need to re-enter it when revisiting the same event on the same device.

## How It Works

1. On page load, check `localStorage` for a saved password for this event ID (key: `event_pw_{eventId}`)
2. If found, attempt to load the event with that password automatically
3. If the stored password fails (e.g., event creator changed it), clear it and show the password gate as usual
4. After successful authentication (either from localStorage, URL hash, or manual input), save the password to `localStorage`

## Changes

**`src/pages/EventPage.tsx`**

- In the `useEffect` that runs on mount, add a fallback: if no URL hash is present, check `localStorage.getItem(\`event_pw_\${id}\`)` and call `loadEvent()` with that value
- In `loadEvent()`, after successful authentication (`setAuthenticated(true)`), add `localStorage.setItem(\`event_pw_\${id}\`, pw)`
- In the `catch` block of `loadEvent()`, add `localStorage.removeItem(\`event_pw_\${id}\`)` to clear stale passwords

No other files need changes.

