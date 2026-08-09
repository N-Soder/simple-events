import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarDays, ChevronDown, Clock, Eye, Image, ListOrdered, ListPlus, LockKeyhole, Plus, Settings2, UtensilsCrossed, X } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { createEvent, uploadBanner } from "@/lib/api";
import MarkdownEditor from "@/components/MarkdownEditor";
import { detectTimeZone } from "@/lib/timezone";
import TimeZoneNote from "@/components/TimeZoneNote";
import TimeField from "@/components/TimeField";
import LocationField from "@/components/LocationField";
import BannerField, { type BannerChoice } from "@/components/BannerField";
import { saveMyEvent } from "@/lib/myEvents";
import { DEFAULT_DURATION_HOURS } from "@/lib/ics";
import { normalizeUrl } from "@/lib/url";

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

const OPEN_LIST_MESSAGE = "Bringing something? Pick an item from the list or add what you're planning to bring, and feel free to leave a comment.";
const FIXED_SLOT_MESSAGE = "Bringing something? Grab an item before it's gone from the selection, and feel free to leave a comment.";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [requirePassword, setRequirePassword] = useState(false);
  const [embedPassword, setEmbedPassword] = useState(true);
  const [bringListEnabled, setBringListEnabled] = useState(false);
  const [bringListMode, setBringListMode] = useState<"signup" | "open">("open");
  const [bringItems, setBringItems] = useState<{ name: string; quantity: number }[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [banner, setBanner] = useState<BannerChoice | null>(null);
  const [bringListMessage, setBringListMessage] = useState(OPEN_LIST_MESSAGE);
  const [timezone, setTimezone] = useState(detectTimeZone);
  const [locationUrl, setLocationUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

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
    if (["password", "guest_visibility"].includes(firstField)) setMoreOptionsOpen(true);
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
            Give guests the essentials now. Photos, privacy, and the bring list can stay out of the way until you need them.
          </p>
          <div className="mt-8 hidden border-t border-border pt-5 text-sm text-muted-foreground lg:block">
            <p className="font-medium text-foreground">What happens next</p>
            <p className="mt-2 leading-6">You’ll get one guest link to share and one private link for managing replies.</p>
          </div>
        </header>

        <form onSubmit={handleSubmit(onSubmit, handleInvalid)} className="min-w-0 space-y-5" noValidate>
          <section className="surface-panel p-5 sm:p-7" aria-labelledby="essentials-heading">
            <div className="mb-7 flex items-start gap-3 border-b border-border pb-5">
              <span className="font-serif text-2xl text-primary/70">01</span>
              <div>
                <h2 id="essentials-heading" className="font-sans text-base font-semibold">The essentials</h2>
                <p className="mt-1 text-sm text-muted-foreground">Only the event name and date are required.</p>
              </div>
            </div>

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
                <Label htmlFor="description">A note for guests <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <MarkdownEditor value={watch("description") || ""} onChange={(value) => setValue("description", value)} placeholder="What should people know?" rows={4} />
              </div>
            </div>
          </section>

          <Collapsible open={moreOptionsOpen} onOpenChange={setMoreOptionsOpen} className="surface-panel overflow-hidden">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center gap-3 px-5 py-5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-7">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-muted-foreground"><Settings2 className="h-4 w-4" /></span>
                <span className="flex-1">
                  <span className="block font-medium">More options</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">Photo, password, guest privacy, and bring list</span>
                </span>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${moreOptionsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-8 border-t border-border px-5 py-6 sm:px-7 sm:py-8">
                <OptionSection icon={Image} title="Event photo" description="A wide banner at the top of the guest page.">
                  <BannerField onChange={setBanner} />
                </OptionSection>

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
                  <RadioGroup value={visibility} onValueChange={(value) => setValue("guest_visibility", value as FormData["guest_visibility"])} className="grid gap-2 sm:grid-cols-3">
                    {[
                      ["full", "Names and totals", "Guests see who is coming"],
                      ["count_only", "Totals only", "No guest names"],
                      ["hidden", "Hidden", "No attendance details"],
                    ].map(([value, label, description]) => (
                      <label key={value} className={`cursor-pointer rounded-md border p-3 transition-colors ${visibility === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/35"}`}>
                        <span className="flex items-center gap-2"><RadioGroupItem value={value} /><span className="text-sm font-medium">{label}</span></span>
                        <span className="mt-1.5 block pl-6 text-xs leading-5 text-muted-foreground">{description}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </OptionSection>

                <OptionSection icon={UtensilsCrossed} title="Bring list" description="Coordinate food, drinks, or anything else guests can contribute.">
                  <div className="flex items-center justify-between rounded-md bg-muted/45 px-4 py-3">
                    <Label htmlFor="bring-list" className="cursor-pointer">Add a bring list</Label>
                    <Switch id="bring-list" checked={bringListEnabled} onCheckedChange={setBringListEnabled} />
                  </div>
                  {bringListEnabled && (
                    <div className="mt-4 space-y-4">
                      <RadioGroup value={bringListMode} onValueChange={(value) => { const mode = value as "signup" | "open"; setBringListMode(mode); if (bringListMessage === OPEN_LIST_MESSAGE || bringListMessage === FIXED_SLOT_MESSAGE) setBringListMessage(mode === "open" ? OPEN_LIST_MESSAGE : FIXED_SLOT_MESSAGE); }} className="grid gap-2 sm:grid-cols-2">
                        {[
                          ["open", ListPlus, "Open list", "Suggestions plus anything guests add"],
                          ["signup", ListOrdered, "Fixed slots", "A limited number of each item"],
                        ].map(([value, Icon, label, description]) => {
                          const ModeIcon = Icon as typeof ListPlus;
                          return (
                            <label key={value as string} className={`cursor-pointer rounded-md border p-3 transition-colors ${bringListMode === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/35"}`}>
                              <span className="flex items-center gap-2"><RadioGroupItem value={value as string} /><ModeIcon className="h-4 w-4" /><span className="text-sm font-medium">{label as string}</span></span>
                              <span className="mt-1.5 block pl-6 text-xs leading-5 text-muted-foreground">{description as string}</span>
                            </label>
                          );
                        })}
                      </RadioGroup>
                      <div>
                        <Label>Message for guests</Label>
                        <MarkdownEditor value={bringListMessage} onChange={setBringListMessage} placeholder="Message shown above the bring list" rows={2} />
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
                  )}
                </OptionSection>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="sticky bottom-3 z-20 rounded-lg border border-border bg-background/90 p-3 shadow-lg backdrop-blur-md sm:flex sm:items-center sm:justify-between sm:gap-6">
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

interface OptionSectionProps {
  icon: typeof Image;
  title: string;
  description: string;
  children: React.ReactNode;
}

const OptionSection = ({ icon: Icon, title, description, children }: OptionSectionProps) => (
  <section className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-7">
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</div>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
    <div className="min-w-0">{children}</div>
  </section>
);

export default Index;
