import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarDays, Clock, Plus, X, ListOrdered, ListPlus } from "lucide-react";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { createEvent, uploadBanner } from "@/lib/api";
import MarkdownEditor from "@/components/MarkdownEditor";
import { detectTimeZone } from "@/lib/timezone";
import TimeZoneNote from "@/components/TimeZoneNote";
import TimeField from "@/components/TimeField";
import LocationField from "@/components/LocationField";
import BannerField from "@/components/BannerField";
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
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bringListMessage, setBringListMessage] = useState(OPEN_LIST_MESSAGE);
  const [timezone, setTimezone] = useState(detectTimeZone);
  const [locationUrl, setLocationUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      let banner_url: string | undefined;
      if (bannerFile) {
        banner_url = await uploadBanner(bannerFile);
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

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
        <div className="mb-10 text-center">
          <Logo className="mx-auto mb-4 h-11 w-11" />
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Create an event</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Set up your gathering and share a private link with your guests.
          </p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Banner Upload */}
              <BannerField onChange={setBannerFile} />

              {/* Event Name */}
              <div>
                <Label htmlFor="name">Event name *</Label>
                <Input id="name" placeholder="Summer BBQ, Birthday Party..." {...register("name")} className="mt-1.5" />
                {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name.message}</p>}
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="description">Description</Label>
                <MarkdownEditor
                  value={watch("description") || ""}
                  onChange={(v) => setValue("description", v)}
                  placeholder="Tell your guests what to expect..."
                  rows={6}
                />
              </div>

              {/* Date & Time */}
              <div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="event_date">
                      <CalendarDays className="mr-1.5 inline h-4 w-4" />
                      Date *
                    </Label>
                    <Input id="event_date" type="date" {...register("event_date")} className="mt-1.5" />
                    {errors.event_date && <p className="mt-1 text-sm text-destructive">{errors.event_date.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="event_time">
                      <Clock className="mr-1.5 inline h-4 w-4" />
                      Start time
                    </Label>
                    <TimeField
                      id="event_time"
                      value={startTime || ""}
                      onChange={(v) => {
                        setValue("event_time", v);
                        // An end time without a start is meaningless.
                        if (!v) setValue("event_end_time", "");
                      }}
                      aria-label="Start time"
                    />
                  </div>
                  <div>
                    <Label htmlFor="event_end_time">
                      <Clock className="mr-1.5 inline h-4 w-4" />
                      End time
                    </Label>
                    <TimeField
                      id="event_end_time"
                      value={endTime || ""}
                      onChange={(v) => setValue("event_end_time", v)}
                      disabled={!startTime}
                      relativeTo={startTime || undefined}
                      defaultOffsetMinutes={DEFAULT_DURATION_HOURS * 60}
                      placeholderExample="22:30"
                      aria-label="End time"
                    />
                    {errors.event_end_time && <p className="mt-1 text-sm text-destructive">{errors.event_end_time.message}</p>}
                  </div>
                </div>
                {startTime && (
                  <TimeZoneNote value={timezone} onChange={setTimezone} showDurationHint={!endTime} />
                )}
              </div>

              {/* Location */}
              <LocationField
                location={watch("location") || ""}
                onLocationChange={(v) => setValue("location", v)}
                url={locationUrl}
                onUrlChange={setLocationUrl}
              />

              {/* Password */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <Label>Require guest password</Label>
                  <Switch checked={requirePassword} onCheckedChange={setRequirePassword} />
                </div>
                {!requirePassword && (
                  <p className="text-sm text-muted-foreground">Anyone with the link can view your event.</p>
                )}
                {requirePassword && (
                  <div className="space-y-3">
                    <div>
                      <Input
                        id="password"
                        type="password"
                        placeholder="A simple password for your guests"
                        {...register("password")}
                        className="mt-1.5"
                      />
                      {errors.password && <p className="mt-1 text-sm text-destructive">{errors.password.message}</p>}
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">Embed password in guest link</p>
                        <p className="text-xs text-muted-foreground">Guests won't need to type it. It's in the URL</p>
                      </div>
                      <Switch checked={embedPassword} onCheckedChange={setEmbedPassword} />
                    </div>
                  </div>
                )}
              </div>

              {/* Guest Visibility */}
              <div>
                <Label className="mb-3 block">Guest list visibility</Label>
                <RadioGroup
                  value={visibility}
                  onValueChange={(v) => setValue("guest_visibility", v as FormData["guest_visibility"])}
                  className="space-y-2"
                >
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${visibility === "full" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value="full" className="mt-0.5" />
                    <div>
                      <p className="font-medium">Full guest list</p>
                      <p className="text-sm text-muted-foreground">Names and attendance counts visible to all guests</p>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${visibility === "count_only" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value="count_only" className="mt-0.5" />
                    <div>
                      <p className="font-medium">Total count only</p>
                      <p className="text-sm text-muted-foreground">Guests see "12 adults, 3 kids attending" but no names</p>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${visibility === "hidden" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value="hidden" className="mt-0.5" />
                    <div>
                      <p className="font-medium">Hidden</p>
                      <p className="text-sm text-muted-foreground">No guest info shown. Only the bring list is visible</p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {/* Bring List */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <Label>Bring list</Label>
                  <Switch checked={bringListEnabled} onCheckedChange={setBringListEnabled} />
                </div>
                {!bringListEnabled && (
                  <p className="text-sm text-muted-foreground">Bring list is disabled. Guests won't see it.</p>
                )}
                {bringListEnabled && (
                  <>
                {/* Mode selector */}
                <div className="mb-4 space-y-2">
                  <Label>List type</Label>
                  <RadioGroup
                    value={bringListMode}
                    onValueChange={(v) => {
                      const newMode = v as "signup" | "open";
                      setBringListMode(newMode);
                      if (bringListMessage === OPEN_LIST_MESSAGE || bringListMessage === FIXED_SLOT_MESSAGE) {
                        setBringListMessage(newMode === "open" ? OPEN_LIST_MESSAGE : FIXED_SLOT_MESSAGE);
                      }
                    }}
                    className="space-y-2"
                  >
                    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${bringListMode === "open" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="open" className="mt-0.5" />
                      <div>
                        <p className="font-medium flex items-center gap-1.5"><ListPlus className="h-4 w-4" /> Open list</p>
                        <p className="text-sm text-muted-foreground">No limits. Guests can choose from suggestions or add their own items.</p>
                      </div>
                    </label>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${bringListMode === "signup" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="signup" className="mt-0.5" />
                      <div>
                        <p className="font-medium flex items-center gap-1.5"><ListOrdered className="h-4 w-4" /> Fixed slot list</p>
                        <p className="text-sm text-muted-foreground">Each category has a limited number of slots. Once full, no more items can be added. Custom items are not allowed.</p>
                      </div>
                    </label>
                  </RadioGroup>
                </div>

                <div className="mb-4">
                  <Label>Message for guests</Label>
                  <MarkdownEditor
                    value={bringListMessage}
                    onChange={setBringListMessage}
                    placeholder="Message shown above the bring list..."
                    rows={2}
                  />
                </div>
                <p className="mb-3 text-sm text-muted-foreground">
                  {bringListMode === "signup"
                    ? "Add categories and how many slots are available for each."
                    : "Add suggestions guests can volunteer to bring."}
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder={bringListMode === "signup" ? "e.g. Dessert, Drinks, Side Dish" : "e.g. Salad, Drinks, Dessert"}
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                    className="flex-1"
                  />
                  {bringListMode === "signup" && (
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={newItemQty}
                      onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
                      className="w-20"
                      title="Slots"
                      placeholder="Slots"
                    />
                  )}
                  <Button type="button" variant="outline" size="icon" onClick={addItem}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {bringItems.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {bringItems.map((item, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">
                        {item.name}{bringListMode === "signup" && item.quantity > 1 ? ` ×${item.quantity}` : ""}
                        <button type="button" onClick={() => removeItem(i)} className="ml-1 text-muted-foreground hover:text-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                  </>
                )}
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create event"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Index;
