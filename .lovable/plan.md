
# Add Editable Bring List Message

When the bring list toggle is enabled, show an editable text field with default copy that guests will see above the bring list on the event page.

## What Changes

### Database
- Add a `bring_list_message` text column to the `events` table, defaulting to `NULL` (the app will use boilerplate text when null)

### Default Message
When no custom message has been set, the following boilerplate will display:

> "If you'd like to contribute, please bring something from the list below or add what you're planning to bring!"

### Edge Function
- `POST /create`: Accept optional `bring_list_message` and store it
- `GET /event` and `GET /admin`: Include `bring_list_message` in the response
- `PUT /admin/update`: Allow updating `bring_list_message`

### Create Event Page (`Index.tsx`)
- When bring list is enabled, show a small text area below the toggle pre-filled with the default boilerplate
- The host can edit it or leave the default
- Pass `bring_list_message` in the create payload

### Admin Page (`AdminPage.tsx`)
- Add a `bringListMessage` state field, initialized from event data (or the default boilerplate if null)
- Show the editable text area in the Bring List card when the toggle is on
- Include `bring_list_message` in the save payload

### Guest Event Page (`EventPage.tsx`)
- Display the message (or the default boilerplate) as a paragraph above the bring list items
- Uses the `MarkdownContent` component so hosts can use bold, links, etc.

### API (`api.ts`)
- Add `bring_list_message` to the create and update payload types

## Technical Details

- Column: `bring_list_message text DEFAULT NULL` on `public.events`
- Frontend default constant: `DEFAULT_BRING_LIST_MESSAGE` defined in a shared location or inline
- The `MarkdownEditor` component (already used for event description) will be used for editing the message on create and admin pages
- The `MarkdownContent` component (already used on EventPage) will render the message for guests
