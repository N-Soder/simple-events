
-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Guest visibility enum
CREATE TYPE public.guest_visibility AS ENUM ('full', 'count_only', 'hidden');

-- Events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  event_time TIME,
  location TEXT,
  banner_url TEXT,
  password_hash TEXT NOT NULL,
  guest_visibility public.guest_visibility NOT NULL DEFAULT 'full',
  admin_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RSVPs table
CREATE TABLE public.rsvps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  kids INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bring list items table
CREATE TABLE public.bring_list_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  claimed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables (deny all by default, edge functions use service_role)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bring_list_items ENABLE ROW LEVEL SECURITY;

-- No public policies - all access through edge functions with service_role key

-- Storage bucket for banner photos
INSERT INTO storage.buckets (id, name, public) VALUES ('banners', 'banners', true);

-- Allow public read access to banners
CREATE POLICY "Banners are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'banners');

-- Allow anonymous uploads to banners (no auth required)
CREATE POLICY "Anyone can upload banners" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'banners');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
