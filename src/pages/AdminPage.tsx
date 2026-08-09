import { useState, useEffect } from "react";

const OPEN_LIST_MESSAGE = "Bringing something? Pick an item from the list or add what you're planning to bring, and feel free to leave a comment.";
const FIXED_SLOT_MESSAGE = "Bringing something? Grab an item before it's gone from the selection, and feel free to leave a comment.";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarDays, Clock, Image, ListOrdered, ListPlus, MapPin, Plus, Save, Shield, Trash2, Users, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  getAdminEvent,
  updateEvent,
  adminAddBringItem,
  adminDeleteBringItem,
  adminDeleteRsvp,
  adminDeleteEvent,
  uploadBanner,
  ApiError,
} from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import MarkdownEditor from "@/components/MarkdownEditor";
import CopyButton, { CopyableLink } from "@/components/CopyButton";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import { detectTimeZone } from "@/lib/timezone";
import TimeZoneNote from "@/components/TimeZoneNote";
import TimeField from "@/components/TimeField";
import LocationField from "@/components/LocationField";
import { normalizeUrl } from "@/lib/url";
import { DEFAULT_DURATION_HOURS } from "@/lib/ics";
import { getMyEvent, saveMyEvent } from "@/lib/myEvents";
import { BringItem } from "@/components/BringListSection";
import AppHeader from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import BannerField, { type BannerChoice } from "@/components/BannerField";

interface EventData {
  event: {
    id: string;
    name: string;
    description: string | null;
    event_date: string;
    event_time: string | null;
    event_end_time: string | null;
    timezone: string | null;
    location: string | null;
    location_url: string | null;
    banner_url: string | null;
    guest_visibility: "full" | "count_only" | "hidden";
    bring_list_enabled: boolean;
    bring_list_mode: "signup" | "open";
    admin_token: string;
  };
  rsvps: Array<{ id: string; guest_name: string; adults: number; kids: number; cancelled?: boolean; manage_code: string }>;
  bring_items: BringItem[];
}

function getExpiryDate(eventDate: string): string {
  const d = new Date(eventDate + "T00:00:00");
  d.setDate(d.getDate() + 90);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const AdminPage = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { toast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [timezone, setTimezone] = useState(detectTimeZone);
  const [location, setLocation] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [bannerChange, setBannerChange] = useState<BannerChoice | null>();
  const [visibility, setVisibility] = useState<"full" | "count_only" | "hidden">("full");
  const [bringListEnabled, setBringListEnabled] = useState(true);
  const [bringListMode, setBringListMode] = useState<"signup" | "open">("open");
  const [bringListMessage, setBringListMessage] = useState(OPEN_LIST_MESSAGE);
  const [newItem, setNewItem] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<"signup" | "open" | null>(null);
  const [deletingRsvpId, setDeletingRsvpId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const loadData = async () => {
    if (!id || !token) return;
    setLoading(true);
    try {
      const result = await getAdminEvent(id, token);
      setData(result as EventData);
      setName(result.event.name as string);
      setDescription((result.event.description as string) || "");
      setEventDate(result.event.event_date as string);
      setEventTime((result.event.event_time as string) || "");
      setEventEndTime((result.event.event_end_time as string) || "");
      setTimezone((result.event.timezone as string) || detectTimeZone());
      setLocation((result.event.location as string) || "");
      setLocationUrl((result.event.location_url as string) || "");
      setBannerChange(undefined);
      setVisibility(result.event.guest_visibility as "full" | "count_only" | "hidden");
      setBringListEnabled(result.event.bring_list_enabled as boolean);
      const loadedMode = (result.event.bring_list_mode as "signup" | "open") ?? "open";
      setBringListMode(loadedMode);
      setBringListMessage(
        (result.event.bring_list_message as string) ||
        (loadedMode === "open" ? OPEN_LIST_MESSAGE : FIXED_SLOT_MESSAGE)
      );
      // Landing here with a working token means this device should remember the
      // event, even if it was created elsewhere. An existing entry keeps its
      // guest link, which may carry a password fragment we cannot rebuild here.
      saveMyEvent({
        id: result.event.id as string,
        name: result.event.name as string,
        event_date: result.event.event_date as string,
        admin_token: token,
        guest_link: `${window.location.origin}/event/${id}`,
      });
    } catch (error) {
      const message = error instanceof ApiError && error.status === 403
        ? "Invalid admin link"
        : error instanceof Error ? error.message : "Failed to load event";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [id, token]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      let bannerUrl: string | null | undefined;
      if (bannerChange?.kind === "file") {
        bannerUrl = await uploadBanner(bannerChange.file);
      } else if (bannerChange?.kind === "preset") {
        bannerUrl = bannerChange.url;
      } else if (bannerChange === null) {
        bannerUrl = null;
      }

      await updateEvent(id, token, {
        name, description, event_date: eventDate, event_time: eventTime || null,
        event_end_time: eventTime ? (eventEndTime || null) : null,
        timezone: eventTime ? timezone : null,
        location,
        location_url: normalizeUrl(locationUrl) || null,
        ...(bannerUrl !== undefined ? { banner_url: bannerUrl } : {}),
        guest_visibility: visibility, bring_list_enabled: bringListEnabled,
        bring_list_message: bringListMessage, bring_list_mode: bringListMode,
      });
      toast({ title: "Event updated" });
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleModeChange = (newMode: "signup" | "open") => {
    // Auto-swap boilerplate if the message is still one of the known defaults
    if (bringListMessage === OPEN_LIST_MESSAGE || bringListMessage === FIXED_SLOT_MESSAGE) {
      setBringListMessage(newMode === "open" ? OPEN_LIST_MESSAGE : FIXED_SLOT_MESSAGE);
    }
    if (newMode === "signup" && data) {
      const hasOvercommit = data.bring_items.some(
        (item) => item.committed_quantity > item.target_quantity
      );
      if (hasOvercommit) {
        setPendingModeSwitch("signup");
        return;
      }
    }
    setBringListMode(newMode);
  };

  const confirmModeSwitch = () => {
    if (pendingModeSwitch) {
      setBringListMode(pendingModeSwitch);
    }
    setPendingModeSwitch(null);
  };

  const handleAddItem = async () => {
    if (!id || !newItem.trim()) return;
    try {
      const qty = bringListMode === "signup" ? Math.min(Math.max(newItemQty, 1), 20) : 1;
      await adminAddBringItem(id, token, newItem.trim(), qty);
      setNewItem("");
      setNewItemQty(1);
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!id) return;
    setDeletingItemId(itemId);
    try {
      await adminDeleteBringItem(id, token, itemId);
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleDeleteRsvp = async (rsvpId: string) => {
    if (!id) return;
    setDeletingRsvpId(rsvpId);
    try {
      await adminDeleteRsvp(id, token, rsvpId);
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setDeletingRsvpId(null);
    }
  };

  const handleDeleteEvent = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await adminDeleteEvent(id, token);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
      setDeleting(false);
    }
  };

  const manageLinkFor = (rsvp: EventData["rsvps"][number]) =>
    `${window.location.origin}/event/${id}#manage=${rsvp.id}.${rsvp.manage_code}`;

  if (loading) {
    return <main id="main-content" className="min-h-[100dvh] bg-background"><AppHeader /><div className="mx-auto max-w-4xl px-4 py-12 sm:px-6" aria-busy="true" aria-label="Loading event dashboard"><Skeleton className="h-4 w-24" /><Skeleton className="mt-5 h-12 w-2/3" /><Skeleton className="mt-10 h-64 w-full rounded-lg" /></div></main>;
  }

  if (!data) {
    return <main id="main-content" className="page-texture min-h-[100dvh] bg-background"><AppHeader /><div className="mx-auto max-w-md px-4 py-20 text-center"><h1 className="text-3xl">This admin link doesn’t work</h1><p className="mt-3 text-muted-foreground">Check that the complete link was copied, including the private token.</p></div></main>;
  }

  // Prefer the link saved when the event was created: for a password-protected
  // event it carries the "#password" fragment, which cannot be rebuilt here
  // because the password is only stored as a hash.
  const bareGuestLink = `${window.location.origin}/event/${id}`;
  const savedGuestLink = getMyEvent(id ?? "")?.guest_link;
  const guestLink = savedGuestLink?.includes("#") ? savedGuestLink : bareGuestLink;
  const guestLinkHasPassword = guestLink !== bareGuestLink;
  const adminLink = `${window.location.origin}/admin/${id}?token=${token}`;
  const activeRsvps = data.rsvps.filter((r) => !r.cancelled);
  const totalAdults = activeRsvps.reduce((s, r) => s + r.adults, 0);
  const totalKids = activeRsvps.reduce((s, r) => s + r.kids, 0);

  return (
    <main id="main-content" className="page-texture min-h-[100dvh] bg-background">
      <AppHeader showCreate showMyEvents />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-9">
          <p className="eyebrow flex items-center gap-2"><Shield className="h-4 w-4" />Private dashboard</p>
          <h1 className="mt-3 text-4xl tracking-[-0.025em] sm:text-5xl">{data.event.name}</h1>
          <p className="mt-3 text-muted-foreground">Share the plan, update the details, and keep track of replies.</p>
        </header>

        {/* Share links */}
        <Card className="surface-panel mb-5 border-0 shadow-none">
          <CardContent className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Guest link
                </p>
                <AddToCalendarButton
                  event={{
                    id: data.event.id,
                    name: data.event.name,
                    description: data.event.description,
                    event_date: data.event.event_date,
                    event_time: data.event.event_time,
                    event_end_time: data.event.event_end_time,
                    timezone: data.event.timezone,
                    location: data.event.location,
                    url: guestLink,
                  }}
                />
              </div>
              <CopyableLink value={guestLink} successMessage="Guest link copied" label="Copy guest link" />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {guestLinkHasPassword
                  ? "Share this with your guests. The password is embedded, so they won't need to type it."
                  : "Share this with your guests."}
              </p>
            </div>

            <div className="min-w-0 border-t border-border pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Shield className="h-4 w-4" />
                Admin link
              </p>
              <CopyableLink value={adminLink} successMessage="Admin link copied" label="Copy admin link" />
              <p className="mt-1.5 text-xs text-muted-foreground">
                This page. Keep it private: anyone with it can edit the event and see every RSVP.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Auto-deletion notice */}
        <Alert className="mb-5 bg-card/70">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This event and all guest data will be automatically deleted on{" "}
            <strong>{getExpiryDate(data.event.event_date)}</strong> (90 days after the event date).
          </AlertDescription>
        </Alert>

        {/* Edit Event Details */}
        <Card className="surface-panel mb-5 border-0 shadow-none">
          <CardHeader className="border-b border-border pb-5">
            <p className="eyebrow flex items-center gap-2"><Image className="h-4 w-4" />Appearance</p>
            <h2 className="mt-1 font-serif text-2xl">Event banner</h2>
            <p className="pt-1 text-sm text-muted-foreground">Replace the photo, choose from the gallery, or remove it entirely.</p>
          </CardHeader>
          <CardContent>
            <BannerField initialUrl={data.event.banner_url} onChange={setBannerChange} />
          </CardContent>
        </Card>

        <Card className="surface-panel mb-5 border-0 shadow-none">
          <CardHeader className="border-b border-border pb-5">
            <p className="eyebrow">The plan</p>
            <h2 className="mt-1 font-serif text-2xl">Event details</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Event name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Description</Label>
              <MarkdownEditor value={description} onChange={setDescription} placeholder="Event description..." rows={3} />
            </div>
            <div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label><CalendarDays className="mr-1 inline h-4 w-4" />Date</Label>
                  <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="admin_event_time"><Clock className="mr-1 inline h-4 w-4" />Start time</Label>
                  <TimeField
                    id="admin_event_time"
                    value={eventTime}
                    onChange={(v) => {
                      setEventTime(v);
                      if (!v) setEventEndTime("");
                    }}
                    aria-label="Start time"
                  />
                </div>
                <div>
                  <Label htmlFor="admin_event_end_time"><Clock className="mr-1 inline h-4 w-4" />End time</Label>
                  <TimeField
                    id="admin_event_end_time"
                    value={eventEndTime}
                    onChange={setEventEndTime}
                    disabled={!eventTime}
                    relativeTo={eventTime || undefined}
                    defaultOffsetMinutes={DEFAULT_DURATION_HOURS * 60}
                    placeholderExample="22:30"
                    aria-label="End time"
                  />
                </div>
              </div>
              {eventTime && (
                <TimeZoneNote value={timezone} onChange={setTimezone} showDurationHint={!eventEndTime} />
              )}
            </div>
            <LocationField
              idPrefix="admin_"
              location={location}
              onLocationChange={setLocation}
              url={locationUrl}
              onUrlChange={setLocationUrl}
            />

            <div>
              <Label className="mb-3 block">Guest list visibility</Label>
              <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)} className="grid gap-2 sm:grid-cols-3">
                {[
                  { value: "full", label: "Full guest list", desc: "Names and counts visible" },
                  { value: "count_only", label: "Total count only", desc: "Aggregate numbers only" },
                  { value: "hidden", label: "Hidden", desc: "No guest info shown" },
                ].map((opt) => (
                  <label key={opt.value} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${visibility === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/35"}`}>
                    <RadioGroupItem value={opt.value} className="mt-0.5" />
                    <div>
                      <p className="font-medium">{opt.label}</p>
                      <p className="text-sm text-muted-foreground">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </CardContent>
        </Card>

        {/* RSVPs */}
        <Card className="surface-panel mb-5 border-0 shadow-none">
          <CardHeader className="border-b border-border pb-5">
            <h2 className="flex flex-wrap items-center gap-2 font-serif text-2xl">
              <Users className="h-5 w-5" />
              RSVPs ({activeRsvps.length}{data.rsvps.length !== activeRsvps.length ? ` of ${data.rsvps.length}` : ""})
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {totalAdults} adults, {totalKids} kids
              </span>
            </h2>
          </CardHeader>
          <CardContent>
            {data.rsvps.length === 0 ? (
              <div className="py-6 text-center"><p className="font-medium">No replies yet</p><p className="mt-1 text-sm text-muted-foreground">Share the guest link above when you’re ready.</p></div>
            ) : (
              <ul className="divide-y divide-border">
                {data.rsvps.map((r) => (
                  <li key={r.id} className={`flex items-center justify-between gap-3 py-3 ${r.cancelled ? "opacity-50" : ""}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-medium truncate ${r.cancelled ? "line-through" : ""}`}>{r.guest_name}</span>
                      {r.cancelled && <Badge variant="secondary" className="text-xs shrink-0">Cancelled</Badge>}
                      <span className="text-sm text-muted-foreground shrink-0">
                        {r.adults} adult{r.adults !== 1 ? "s" : ""}{r.kids > 0 ? `, ${r.kids} kid${r.kids !== 1 ? "s" : ""}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <CopyButton
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground"
                        value={manageLinkFor(r)}
                        label={`Copy manage link for ${r.guest_name}`}
                        successMessage={`Manage link copied for ${r.guest_name}`}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            disabled={deletingRsvpId === r.id}
                            aria-label={`Remove RSVP for ${r.guest_name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {r.guest_name}'s RSVP?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete their RSVP and any bring list commitments. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteRsvp(r.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove RSVP
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Bring List */}
        <Card className={`surface-panel border-0 shadow-none ${!bringListEnabled ? "opacity-70" : ""}`}>
          <CardHeader className="border-b border-border pb-5">
            <h2 className="flex flex-wrap items-center gap-2 font-serif text-2xl">
              <UtensilsCrossed className="h-5 w-5" />
              Bring list
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm font-normal text-muted-foreground">{bringListEnabled ? "Visible to guests" : "Hidden from guests"}</span>
                <Switch checked={bringListEnabled} onCheckedChange={setBringListEnabled} />
              </div>
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mode selector */}
            <div>
              <Label className="mb-2 block">List type</Label>
              <RadioGroup value={bringListMode} onValueChange={(v) => handleModeChange(v as "signup" | "open")} className="space-y-2">
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

            <div>
              <Label>Message for guests</Label>
              <MarkdownEditor
                value={bringListMessage}
                onChange={setBringListMessage}
                placeholder="Message shown above the bring list..."
                rows={2}
              />
            </div>

            {data.bring_items.length > 0 && (
              <ul className="space-y-2">
                {data.bring_items.map((item) => {
                  const covered = bringListMode === "signup" && item.committed_quantity >= item.target_quantity;
                  const notedCommitments = item.commitments.filter((c) => c.note);
                  return (
                    <li key={item.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.item_name}</span>
                          {bringListMode === "signup" && (
                            <span className={`text-xs ${covered ? "font-medium text-primary" : "text-muted-foreground"}`}>
                              {item.committed_quantity}/{item.target_quantity}
                              {covered ? " ✓" : ""}
                            </span>
                          )}
                        </div>
                        {item.commitments.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {item.commitments.map((c) => bringListMode === "signup" && c.quantity > 1 ? `${c.guest_name} ×${c.quantity}` : c.guest_name).join(", ")}
                          </p>
                        )}
                        {notedCommitments.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">
                            {notedCommitments.map((c) => `${c.guest_name}: "${c.note}"`).join(" · ")}
                          </p>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" disabled={deletingItemId === item.id} onClick={() => handleDeleteItem(item.id)} aria-label={`Remove ${item.item_name}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex gap-2">
              <Input
                placeholder={bringListMode === "signup" ? "Add category..." : "Add suggestion..."}
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddItem(); } }}
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
              <Button variant="outline" size="icon" onClick={handleAddItem} aria-label="Add bring-list item">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
        {/* Danger Zone */}
        <Card className="mt-5 border-destructive/35 bg-background/60 shadow-none">
          <CardHeader>
            <h2 className="font-serif text-2xl text-destructive">Danger zone</h2>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Permanently delete this event, all RSVPs, the bring list, and the banner image. This cannot be undone.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete event
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the event, all RSVPs, the bring list, and the banner image. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteEvent}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete event
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

      </div>

      {/* Overcommit warning dialog */}
      <AlertDialog open={pendingModeSwitch !== null} onOpenChange={(open) => { if (!open) setPendingModeSwitch(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some slots are over-committed</AlertDialogTitle>
            <AlertDialogDescription>
              One or more items have more commitments than available slots. Existing commitments will be kept, but no new ones can exceed the cap. You may want to increase slot counts or remove excess commitments after switching.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingModeSwitch(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmModeSwitch}>Switch anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default AdminPage;
