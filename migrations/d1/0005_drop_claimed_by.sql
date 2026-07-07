-- Remove the unused bring_list_items.claimed_by column. It predates the
-- bring_commitments table (migration 0002), which now tracks who is bringing
-- what, and has been unused since.
ALTER TABLE bring_list_items DROP COLUMN claimed_by;
