

# Replace Number Inputs with Select Dropdowns

## Change
In `src/pages/EventPage.tsx` (lines 470-478), replace the two `<Input type="number">` fields with `<Select>` dropdowns:
- **Adults**: options 1–10
- **Kids**: options 0–10

Import `Select, SelectTrigger, SelectValue, SelectContent, SelectItem` from `@/components/ui/select`. Use `onValueChange` with `parseInt` to update state, and `String(adults)`/`String(kids)` for the value prop. Same 2-column grid layout.

