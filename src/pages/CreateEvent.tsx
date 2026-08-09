import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarDays, Clock, Eye, Image, LockKeyhole, Plus, ShieldCheck, UtensilsCrossed, X } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { createEvent, uploadBanner } from "@/lib/api";
import MarkdownEditor from "@/components/MarkdownEditor";
import { detectTimeZone } from "@/lib/timezone";
import TimeZoneNote from "@/components/TimeZoneNote";
import TimeField from "@/components/TimeField";
import LocationField from "@/components/LocationField";
import BannerField, { type BannerChoice } from "@/components/BannerField";
import BringListModeField from "@/components/BringListModeField";
import GuestVisibilityField from "@/components/GuestVisibilityField";
import { DisclosureSection, FormSection, OptionSection, ToggleSection } from "@/components/FormSections";
import { saveMyEvent } from "@/lib/myEvents";
import { DEFAULT_DURATION_HOURS } from "@/lib/ics";
import { normalizeUrl } from "@/lib/url";
import { messageForMode, OPEN_LIST_MESSAGE, type BringListMode } from "@/lib/bringList";

const schema = z.object({
  name: z.string().trim().min(1, "Event name is required").max(200),
  description: z.string().trim().max(2000).optional(),
  event_date: z.string().min(1, "Date is required"),
  event_time: z.string().optional(),
  event_end_time: z.string().optional(),
  location: z.string().trim().max(500).optional(),
  password: z.string().max(100).optional(),
  guest_visibility: z.enum(["full", "count_only", "hidden"]),
}).refine((d) => !d.event_end_time || !!d.event_time, {
  message: "Set a start time first",
  path: ["event_end_time"],
});

type FormData = z.infer<typeof schema>;

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [requirePassword, setRequirePassword] = useState(false);
  const [embedPassword, setEmbedPassword] = useState(true);
  const [bringListEnabled, setBringListEnabled] = useState(false);
  const [bringListMode, setBringListMode] = useState<BringListMode>("open");
  const [bringItems, setBringItems] = useState<{ name: string; quantity: number }[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [banner, setBanner] = useState<BannerChoice | null>(null);
  const [bringListMessage, setBringListMessage] = useState(OPEN_LIST_MESSAGE);
  const [timezone, setTimezone] = useState(detectTimeZone);
  const [locationUrl, setLocationUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  // The landing page hands the event name over in the query string, so a host
  // who typed it there doesn't have to type it again.
  const [searchParams] = useSearchParams();
  const [presetName] = useState(() => (searchParams.get("name") ?? "").trim().slice(0, 200));

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { guest_visibility: "full", name: presetName },
  });

  const visibility = watch("guest_visibility");
  const startTime = watch("event_time");
  const endTime = watch("event_end_time");

  const addItem = () => {
    const trimmed = newItem.trim();
    if (trimmed) {
      setBringItems([...bringItems, { name: trimmed, quantity: Math.min(Math.max(newItemQty, 1), 20) }]);
      setNewItem("");
      setNewItemQty(1);
    }
  };

  const removeItem = (index: number) => {
    setBringItems(bringItems.filter((_, i) => i !== index));
  };

  // Switching the banner off is a decision, not a fold-away: drop whatever was
  // picked so the event is created without one.
  const handleBannerEnabledChange = (enabled: boolean) => {
    setBannerEnabled(enabled);
    if (!enabled) setBanner(null);
  };

  const handleModeChange = (mode: BringListMode) => {
    setBringListMode(mode);
    setBringListMessage((current) => messageForMode(current, mode));
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      // A preset is already a file on our own origin, so it only needs its path
      // writing through. Only a host's own photo has to be uploaded first.
      let banner_url: string | undefined;
      if (banner?.kind === "file") {
        banner_url = await uploadBanner(banner.file);
      } else if (banner?.kind === "preset") {
        banner_url = banner.url;
      }

      const password = requirePassword ? data.password : undefined;

      const result = await createEvent({
        name: data.name,
        description: data.description,
        event_date: data.event_date,
        event_time: data.event_time,
        event_end_time: data.event_time ? data.event_end_time : undefined,
        timezone: data.event_time ? timezone : undefined,
        location: data.location,
        location_url: normalizeUrl(locationUrl) || undefined,
        password,
        guest_visibility: data.guest_visibility,
        bring_list_enabled: bringListEnabled,
        banner_url,
        bring_items: bringListEnabled ? bringItems : [],
        bring_list_message: bringListEnabled ? bringListMessage : undefined,
        bring_list_mode: bringListEnabled ? bringListMode : undefined,
      });

      // Remember the event on this device so the admin link is recoverable if
      // the host closes the tab without copying it.
      const guestLink = `${window.location.origin}/event/${result.id}`;
      saveMyEvent({
        id: result.id,
        name: data.name,
        event_date: data.event_date,
        admin_token: result.admin_token,
        guest_link: password && embedPassword ? `${guestLink}#${password}` : guestLink,
      });

      // Build created page URL with password + embed info
      const createdParams = new URLSearchParams({
        id: result.id,
        token: result.admin_token,
      });
      if (password) {
        createdParams.set("password", password);
        if (embedPassword) createdParams.set("embed", "1");
      }

      navigate(`/created?${createdParams.toString()}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error creating event", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvalid = (formErrors: typeof errors) => {
    const firstField = Object.keys(formErrors)[0];
    if (!firstField) return;
    if (["password", "guest_visibility"].includes(firstField)) setAccessOpen(true);
    window.setTimeout(() => document.getElementById(firstField)?.focus(), 0);
  };

  return (
    <main id="main-content" className="page-texture min-h-[100dvh] bg-background">
      <AppHeader backTo="/" backLabel="Home" showMyEvents />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-16 lg:py-16">
        <header className="lg:sticky lg:top-10 lg:self-start">
          <p className="eyebrow">New event</p>
          <h1 className="mt-4 text-4xl leading-tight tracking-[-0.025em] sm:text-5xl">Start with the plan.</h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            Enter the main details, then add a banner photo, privacy settings, and other useful extras.
          </p>
          <div className="mt-8 hidden border-t border-border pt-5 text-sm text-muted-foreground lg:block">
            <p className="font-medium text-foreground">What happens next</p>
            <p className="mt-2 leading-6">You’ll get one guest link to share and one private link for managing replies.</p>
          </div>
        </header>

        <form onSubmit={handleSubmit(onSubmit, handleInvalid)} className="min-w-0 space-y-5 pb-24 sm:pb-0" noValidate>
          <FormSection
            id="details-heading"
            number="01"
            icon={CalendarDays}
            title="Event details"
            description="Only the event name and date are required."
          >
            <div className="space-y-6">
              <div>
                <Label htmlFor="name">Event name <span aria-hidden="true">*</span></Label>
                <Input id="name" placeholder="Midsommar Party" {...register("name")} className="mt-1.5 h-12 text-base sm:text-base" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} />
                {errors.name && <p id="name-error" className="field-error">{errors.name.message}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-[1.15fr_1fr_1fr]">
                <div>
                  <Label htmlFor="event_date"><CalendarDays className="mr-1.5 inline h-4 w-4" />Date <span aria-hidden="true">*</span></Label>
                  <Input id="event_date" type="date" {...register("event_date")} className="mt-1.5" aria-invalid={!!errors.event_date} aria-describedby={errors.event_date ? "date-error" : undefined} />
                  {errors.event_date && <p id="date-error" className="field-error">{errors.event_date.message}</p>}
                </div>
                <div>
                  <Label htmlFor="event_time"><Clock className="mr-1.5 inline h-4 w-4" />Starts</Label>
                  <TimeField id="event_time" value={startTime || ""} onChange={(value) => { setValue("event_time", value); if (!value) setValue("event_end_time", ""); }} aria-label="Start time" />
                </div>
                <div>
                  <Label htmlFor="event_end_time"><Clock className="mr-1.5 inline h-4 w-4" />Ends</Label>
                  <TimeField id="event_end_time" value={endTime || ""} onChange={(value) => setValue("event_end_time", value)} disabled={!startTime} relativeTo={startTime || undefined} defaultOffsetMinutes={DEFAULT_DURATION_HOURS * 60} placeholderExample="22:30" aria-label="End time" />
                  {errors.event_end_time && <p className="field-error">{errors.event_end_time.message}</p>}
                </div>
              </div>
              {startTime && <TimeZoneNote value={timezone} onChange={setTimezone} showDurationHint={!endTime} />}

              <LocationField location={watch("location") || ""} onLocationChange={(value) => setValue("location", value)} url={locationUrl} onUrlChange={setLocationUrl} />

              <div>
                <Label htmlFor="description">A note for guests</Label>
                <MarkdownEditor
                  id="description"
                  ariaLabel="A note for guests"
                  value={watch("description") || ""}
                  onChange={(value) => setValue("description", value)}
                  placeholder="What should people know?"
                  rows={4}
                />
              </div>
            </div>
          </FormSection>

          <ToggleSection
            id="banner-heading"
            number="02"
            icon={Image}
            title="Event banner"
            description="Add a wide photo to the top of the guest page."
            switchId="banner-enabled"
            switchLabel="Add an event banner"
            enabled={bannerEnabled}
            onEnabledChange={handleBannerEnabledChange}
          >
            <BannerField onChange={setBanner} label={null} />
          </ToggleSection>

          <ToggleSection
            id="bring-list-heading"
            number="03"
            icon={UtensilsCrossed}
            title="Bring list"
            description="Coordinate food, drinks, or anything else guests can contribute."
            switchId="bring-list"
            switchLabel="Enable bring list"
            enabled={bringListEnabled}
            onEnabledChange={setBringListEnabled}
          >
            <div className="space-y-4">
              <BringListModeField value={bringListMode} onChange={handleModeChange} />
              <div>
                <Label htmlFor="bring-list-message">Message for guests</Label>
                <MarkdownEditor
                  id="bring-list-message"
                  ariaLabel="Message for guests"
                  value={bringListMessage}
                  onChange={setBringListMessage}
                  placeholder="Message shown above the bring list..."
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="new-bring-item">Suggestions</Label>
                <div className="mt-1.5 flex gap-2">
                  <Input id="new-bring-item" placeholder={bringListMode === "signup" ? "Dessert, drinks, side dish" : "Salad, drinks, dessert"} value={newItem} onChange={(event) => setNewItem(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } }} className="flex-1" />
                  {bringListMode === "signup" && <Input type="number" min={1} max={20} value={newItemQty} onChange={(event) => setNewItemQty(parseInt(event.target.value) || 1)} className="w-20" aria-label="Number of slots" />}
                  <Button type="button" variant="outline" size="icon" onClick={addItem} aria-label="Add bring-list item"><Plus /></Button>
                </div>
                {bringItems.length > 0 && (
                  <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                    {bringItems.map((item, index) => (
                      <li key={`${item.name}-${index}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="flex-1">{item.name}{bringListMode === "signup" && item.quantity > 1 ? ` ×${item.quantity}` : ""}</span>
                        <button type="button" onClick={() => removeItem(index)} className="rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Remove ${item.name}`}><X className="h-4 w-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </ToggleSection>

          <DisclosureSection
            id="access-heading"
            number="04"
            icon={ShieldCheck}
            title="Access & privacy"
            description="Control passwords and what guests can see about other replies."
            open={accessOpen}
            onOpenChange={setAccessOpen}
          >
            <div className="space-y-8">
              <OptionSection icon={LockKeyhole} title="Guest password" description="The shared link is usually private enough. Add a password for another layer.">
                <div className="flex items-center justify-between rounded-md bg-muted/45 px-4 py-3">
                  <Label htmlFor="require-password" className="cursor-pointer">Require a password</Label>
                  <Switch id="require-password" checked={requirePassword} onCheckedChange={setRequirePassword} />
                </div>
                {requirePassword && (
                  <div className="mt-3 space-y-3">
                    <Input id="password" type="password" placeholder="A simple password for guests" {...register("password")} aria-invalid={!!errors.password} />
                    {errors.password && <p className="field-error">{errors.password.message}</p>}
                    <div className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
                      <div>
                        <Label htmlFor="embed-password" className="cursor-pointer">Put it in the guest link</Label>
                        <p className="mt-0.5 text-xs text-muted-foreground">Guests can open the page without typing it.</p>
                      </div>
                      <Switch id="embed-password" checked={embedPassword} onCheckedChange={setEmbedPassword} />
                    </div>
                  </div>
                )}
              </OptionSection>

              <OptionSection icon={Eye} title="Guest list privacy" description="Choose what guests can see about other replies.">
                <GuestVisibilityField value={visibility} onChange={(value) => setValue("guest_visibility", value)} />
              </OptionSection>
            </div>
          </DisclosureSection>

          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 rounded-lg border border-border bg-background/90 p-3 shadow-lg backdrop-blur-md sm:static sm:z-auto sm:flex sm:items-center sm:justify-between sm:gap-6 sm:bg-background sm:shadow-sm sm:backdrop-blur-none">
            <p className="hidden text-sm text-muted-foreground sm:block">You can change every detail later.</p>
            <Button type="submit" size="lg" disabled={isSubmitting} className="w-full px-8 sm:w-auto">
              {isSubmitting ? "Creating your event…" : "Create event"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
};

export default Index;
