
-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Recreate functions using extensions schema
CREATE OR REPLACE FUNCTION public.__update_event_password(event_uuid UUID, pw TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.events SET password_hash = extensions.crypt(pw, extensions.gen_salt('bf')) WHERE id = event_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.__verify_event_password(event_uuid UUID, pw TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  is_valid BOOLEAN;
BEGIN
  SELECT password_hash = extensions.crypt(pw, password_hash) INTO is_valid
  FROM public.events WHERE id = event_uuid;
  RETURN COALESCE(is_valid, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;
