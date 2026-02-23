
-- Make password_hash nullable
ALTER TABLE public.events ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE public.events ALTER COLUMN password_hash SET DEFAULT NULL;
