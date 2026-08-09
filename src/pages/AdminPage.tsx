import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Clock,
  Eye,
  Image,
  Link2,
  MapPin,
  Plus,
  Save,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import AddToCalendarButton from "@/components/AddToCalendarButton";
import BannerField, { type BannerChoice } from "@/components/BannerField";
import { BringItem } from "@/components/BringListSection";
import BringListModeField from "@/components/BringListModeField";
import CopyButton, { CopyableLink } from "@/components/CopyButton";
import { DisclosureSection, FormSection, OptionSection, ToggleSection } from "@/components/FormSections";
import GuestVisibilityField from "@/components/GuestVisibilityField";
import LocationField from "@/components/LocationField";
import Logo from "@/components/Logo";
import MarkdownEditor from "@/components/MarkdownEditor";
import TimeField from "@/components/TimeField";
import TimeZoneNote from "@/components/TimeZoneNote";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  adminAddBringItem,
  adminDeleteBringItem,
  adminDeleteEvent,
  adminDeleteRsvp,
  ApiError,
  getAdminEvent,
  updateEvent,
  uploadBanner,
} from "@/lib/api";
import {
  FIXED_SLOT_MESSAGE,
  messageForMode,
  OPEN_LIST_MESSAGE,
  type BringListMode,
} from "@/lib/bringList";
import { DEFAULT_DURATION_HOURS } from "@/lib/ics";
import { getMyEvent, saveMyEvent } from "@/lib/myEvents";
import { detectTimeZone } from "@/lib/timezone";
import { normalizeUrl } from "@/lib/url";

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
    bring_list_message?: string | null;
    admin_token: string;
  };
  rsvps: Array<{
    id: string;
    guest_name: string;
    adults: number;
    kids: number;
    cancelled?: boolean;
    manage_code: string;
  }>;
  bring_items: BringItem[];
}

function getExpiryDate(eventDate: string): string {
  const date = new Date(`${eventDate}T00:00:00`);
  date.setDate(date.getDate() + 90);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatEventDate(eventDate: string): string {
  return new Date(`${eventDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatEventTime(start: string | null, end: string | null): string | null {
  if (!start) return null;
  return end ? `${start}–${end}` : start;
}

const AdminPage = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const { toast } = useToast();

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
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [bannerChange, setBannerChange] = useState<BannerChoice | null>();
  const [visibility, setVisibility] = useState<"full" | "count_only" | "hidden">("full");
  const [bringListEnabled, setBringListEnabled] = useState(true);
  const [bringListMode, setBringListMode] = useState<BringListMode>("open");
  const [bringListMessage, setBringListMessage] = useState(OPEN_LIST_MESSAGE);
  const [newItem, setNewItem] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<BringListMode | null>(null);
  const [deletingRsvpId, setDeletingRsvpId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);

  const loadData = async () => {
    if (!id || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getAdminEvent(id, token) as EventData;
      setData(result);
      setName(result.event.name);
      setDescription(result.event.description || "");
      setEventDate(result.event.event_date);
      setEventTime(result.event.event_time || "");
      setEventEndTime(result.event.event_end_time || "");
      setTimezone(result.event.timezone || detectTimeZone());
      setLocation(result.event.location || "");
      setLocationUrl(result.event.location_url || "");
      setBannerEnabled(!!result.event.banner_url);
      setBannerChange(undefined);
      setVisibility(result.event.guest_visibility);
      setBringListEnabled(result.event.bring_list_enabled);
      const loadedMode = result.event.bring_list_mode ?? "open";
      setBringListMode(loadedMode);
      setBringListMessage(
        result.event.bring_list_message ||
        (loadedMode === "open" ? OPEN_LIST_MESSAGE : FIXED_SLOT_MESSAGE),
      );
      saveMyEvent({
        id: result.event.id,
        name: result.event.name,
        event_date: result.event.event_date,
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

  useEffect(() => {
    loadData();
    // loadData is intentionally tied to the route credentials.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

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
        name,
        description,
        event_date: eventDate,
        event_time: eventTime || null,
        event_end_time: eventTime ? (eventEndTime || null) : null,
        timezone: eventTime ? timezone : null,
        location,
        location_url: normalizeUrl(locationUrl) || null,
        ...(bannerUrl !== undefined ? { banner_url: bannerUrl } : {}),
        guest_visibility: visibility,
        bring_list_enabled: bringListEnabled,
        bring_list_message: bringListMessage,
        bring_list_mode: bringListMode,
      });
      toast({ title: "Event updated!" });
      await loadData();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Switching the banner off means "this event has no banner": the save that
  // follows clears it, rather than just folding the picker away.
  const handleBannerEnabledChange = (enabled: boolean) => {
    setBannerEnabled(enabled);
    setBannerChange(enabled ? undefined : null);
  };

  const handleModeChange = (newMode: BringListMode) => {
    setBringListMessage((current) => messageForMode(current, newMode));
    const hasOvercommit = newMode === "signup" && data?.bring_items.some(
      (item) => item.committed_quantity > item.target_quantity,
    );
    if (hasOvercommit) {
      setPendingModeSwitch("signup");
      return;
    }
    setBringListMode(newMode);
  };

  const handleAddItem = async () => {
    if (!id || !newItem.trim()) return;
    try {
      const quantity = bringListMode === "signup" ? Math.min(Math.max(newItemQty, 1), 20) : 1;
      await adminAddBringItem(id, token, newItem.trim(), quantity);
      setNewItem("");
      setNewItemQty(1);
      await loadData();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!id) return;
    setDeletingItemId(itemId);
    try {
      await adminDeleteBringItem(id, token, itemId);
      await loadData();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleDeleteRsvp = async (rsvpId: string) => {
    if (!id) return;
    setDeletingRsvpId(rsvpId);
    try {
      await adminDeleteRsvp(id, token, rsvpId);
      await loadData();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
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
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-background" aria-busy="true" aria-label="Loading dashboard">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="mb-12 flex items-center gap-3">
            <Logo className="h-9 w-9" />
            <div className="h-5 w-28 animate-pulse rounded bg-muted" />
          </div>
          <div className="max-w-2xl space-y-4">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-12 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-card" />)}
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <Logo className="mx-auto h-11 w-11" />
          <h1 className="mt-6 text-3xl">This admin link doesn't work</h1>
          <p className="mt-3 text-muted-foreground">
            Check that you copied the whole link, including the private token at the end.
          </p>
          <Button asChild className="mt-6"><Link to="/my-events">Go to my events</Link></Button>
        </div>
      </main>
    );
  }

  const bareGuestLink = `${window.location.origin}/event/${id}`;
  const savedGuestLink = getMyEvent(id ?? "")?.guest_link;
  const guestLink = savedGuestLink?.includes("#") ? savedGuestLink : bareGuestLink;
  const guestLinkHasPassword = guestLink !== bareGuestLink;
  const adminLink = `${window.location.origin}/admin/${id}?token=${token}`;
  const activeRsvps = data.rsvps.filter((rsvp) => !rsvp.cancelled);
  const totalAdults = activeRsvps.reduce((sum, rsvp) => sum + rsvp.adults, 0);
  const totalKids = activeRsvps.reduce((sum, rsvp) => sum + rsvp.kids, 0);
  const totalPeople = totalAdults + totalKids;
  const eventTimeLabel = formatEventTime(data.event.event_time, data.event.event_end_time);
  const committedItems = data.bring_items.reduce((sum, item) => sum + item.committed_quantity, 0);
  const manageLinkFor = (rsvp: EventData["rsvps"][number]) =>
    `${window.location.origin}/event/${id}#manage=${rsvp.id}.${rsvp.manage_code}`;

  return (
    <main className="min-h-[100dvh] bg-background">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Logo className="h-8 w-8" />
            <span>Simple Events</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/my-events">My events</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/event/${id}`}>View guest page <ArrowUpRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </header>

      {data.event.banner_url && (
        <div className="mx-auto mt-6 max-w-5xl px-4 sm:px-6">
          <img src={data.event.banner_url} alt="" className="h-40 w-full rounded-xl object-cover sm:h-56" />
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <section aria-labelledby="event-title" className="animate-rise">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Shield className="h-4 w-4" />
            <span>Host dashboard</span>
          </div>
          <h1 id="event-title" className="mt-3 max-w-3xl text-4xl leading-[1.05] tracking-tight sm:text-5xl">
            {data.event.name}
          </h1>
          <div className="mt-5 flex max-w-3xl flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground sm:text-base">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-foreground/70" />
              {formatEventDate(data.event.event_date)}
            </span>
            {eventTimeLabel && (
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-foreground/70" />
                {eventTimeLabel}
              </span>
            )}
            {data.event.location && (
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-foreground/70" />
                {data.event.location}
              </span>
            )}
          </div>
        </section>

        <section
          aria-label="Event overview"
          className="mt-10 grid overflow-hidden rounded-xl border bg-card shadow-sm sm:grid-cols-3"
        >
          <div className="p-5 sm:p-6">
            <p className="text-sm text-muted-foreground">Attendance</p>
            <p className="mt-1 font-serif text-3xl tabular-nums">{totalPeople}</p>
            <p className="mt-1 text-sm font-medium">
              {totalPeople === 1 ? "1 person coming" : `${totalPeople} people coming`}
            </p>
          </div>
          <div className="border-t p-5 sm:border-l sm:border-t-0 sm:p-6">
            <p className="text-sm text-muted-foreground">Responses</p>
            <p className="mt-1 font-serif text-3xl tabular-nums">{activeRsvps.length}</p>
            <p className="mt-1 text-sm font-medium">
              {totalAdults} {totalAdults === 1 ? "adult" : "adults"} · {totalKids} {totalKids === 1 ? "child" : "children"}
            </p>
          </div>
          <div className="border-t p-5 sm:border-l sm:border-t-0 sm:p-6">
            <p className="text-sm text-muted-foreground">Bring list</p>
            <p className="mt-1 font-serif text-3xl tabular-nums">{committedItems}</p>
            <p className="mt-1 text-sm font-medium">
              {bringListEnabled ? `${data.bring_items.length} ${data.bring_items.length === 1 ? "suggestion" : "suggestions"}` : "Hidden from guests"}
            </p>
          </div>
        </section>

        <nav
          aria-label="Dashboard sections"
          className="sticky top-0 z-10 -mx-4 mt-8 overflow-x-auto border-y bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-3"
        >
          <div className="flex min-w-max gap-1">
            {[
              ["#sharing", "Sharing"],
              ["#guests", "Guests"],
              ["#event-details", "Event details"],
              ["#event-banner", "Banner"],
              ["#bring-list", "Bring list"],
              ["#access", "Access & privacy"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="mt-6 space-y-6">
          <section id="sharing" className="scroll-mt-24 overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="border-b px-5 py-5 sm:px-7">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Link2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-2xl">Share your event</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Everything guests need is in one link.</p>
                </div>
              </div>
            </div>
            <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
              <div className="min-w-0 bg-primary/5 p-5 sm:p-7">
                <p className="text-sm font-medium">Guest link</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {guestLinkHasPassword
                    ? "The password is included, so guests can open it directly."
                    : "Send this to everyone you're inviting."}
                </p>
                <CopyableLink
                  value={guestLink}
                  successMessage="Guest link copied"
                  label="Copy guest link"
                  className="mt-4"
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" asChild>
                    <Link to={`/event/${id}`}>View guest page <ArrowUpRight className="h-4 w-4" /></Link>
                  </Button>
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
              </div>
              <div className="min-w-0 border-t p-5 sm:p-7 lg:border-l lg:border-t-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-primary" />
                  Admin link
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Keep this private. Anyone with it can edit the event and see every RSVP.
                </p>
                <CopyableLink
                  value={adminLink}
                  successMessage="Admin link copied"
                  label="Copy admin link"
                  className="mt-4"
                />
              </div>
            </div>
          </section>

          <section id="guests" className="scroll-mt-24 overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-2xl">Guest responses</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeRsvps.length} active {activeRsvps.length === 1 ? "response" : "responses"} · {totalPeople} people
                  </p>
                </div>
              </div>
              {data.rsvps.length !== activeRsvps.length && (
                <Badge variant="secondary" className="self-start sm:self-auto">
                  {data.rsvps.length - activeRsvps.length} cancelled
                </Badge>
              )}
            </div>
            {data.rsvps.length === 0 ? (
              <div className="px-5 py-12 text-center sm:px-7">
                <Users className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-3 font-medium">No responses yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Share the guest link when you're ready to invite people.
                </p>
              </div>
            ) : (
              <ul>
                {data.rsvps.map((rsvp) => (
                  <li
                    key={rsvp.id}
                    className={`flex flex-col gap-3 border-t px-5 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:px-7 ${rsvp.cancelled ? "bg-muted/30" : ""}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary font-serif text-lg"
                        aria-hidden="true"
                      >
                        {rsvp.guest_name.charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`truncate font-medium ${rsvp.cancelled ? "text-muted-foreground line-through" : ""}`}>
                            {rsvp.guest_name}
                          </p>
                          {rsvp.cancelled && <Badge variant="secondary" className="text-xs">Cancelled</Badge>}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {rsvp.adults} {rsvp.adults === 1 ? "adult" : "adults"}
                          {rsvp.kids > 0 ? ` · ${rsvp.kids} ${rsvp.kids === 1 ? "child" : "children"}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                      <CopyButton
                        variant="ghost"
                        value={manageLinkFor(rsvp)}
                        label={`Copy manage link for ${rsvp.guest_name}`}
                        successMessage={`Manage link copied for ${rsvp.guest_name}`}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            disabled={deletingRsvpId === rsvp.id}
                            aria-label={`Remove RSVP for ${rsvp.guest_name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {rsvp.guest_name}'s RSVP?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently deletes their response and bring list commitments. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteRsvp(rsvp.id)}
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
          </section>

          {/* The editing sections and their save button share a wrapper so the
              sticky bar lets go once the last one is behind you. */}
          <div className="space-y-6 pb-20 sm:pb-0">
            <FormSection
              id="admin-details-heading"
              anchor="event-details"
              number="01"
              icon={CalendarDays}
              title="Event details"
              description="Only the event name and date are required."
            >
              <div className="space-y-6">
                <div>
                  <Label htmlFor="admin-event-name">Event name</Label>
                  <Input
                    id="admin-event-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1.5 h-12 text-base sm:text-base"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-[1.15fr_1fr_1fr]">
                  <div>
                    <Label htmlFor="admin-event-date"><CalendarDays className="mr-1.5 inline h-4 w-4" />Date</Label>
                    <Input
                      id="admin-event-date"
                      type="date"
                      value={eventDate}
                      onChange={(event) => setEventDate(event.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin_event_time"><Clock className="mr-1.5 inline h-4 w-4" />Starts</Label>
                    <TimeField
                      id="admin_event_time"
                      value={eventTime}
                      onChange={(value) => {
                        setEventTime(value);
                        if (!value) setEventEndTime("");
                      }}
                      aria-label="Start time"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin_event_end_time"><Clock className="mr-1.5 inline h-4 w-4" />Ends</Label>
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

                <LocationField
                  idPrefix="admin_"
                  location={location}
                  onLocationChange={setLocation}
                  url={locationUrl}
                  onUrlChange={setLocationUrl}
                />

                <div>
                  <Label htmlFor="admin-description">A note for guests</Label>
                  <MarkdownEditor
                    id="admin-description"
                    ariaLabel="A note for guests"
                    value={description}
                    onChange={setDescription}
                    placeholder="What should people know?"
                    rows={4}
                  />
                </div>
              </div>
            </FormSection>

            <ToggleSection
              id="admin-banner-heading"
              anchor="event-banner"
              number="02"
              icon={Image}
              title="Event banner"
              description="Add a wide photo to the top of the guest page."
              switchId="admin-banner-enabled"
              switchLabel="Add an event banner"
              enabled={bannerEnabled}
              onEnabledChange={handleBannerEnabledChange}
            >
              <BannerField initialUrl={data.event.banner_url} onChange={setBannerChange} label={null} />
            </ToggleSection>

            <ToggleSection
              id="admin-bring-list-heading"
              anchor="bring-list"
              number="03"
              icon={UtensilsCrossed}
              title="Bring list"
              description="Coordinate food, drinks, or anything else guests can contribute."
              switchId="admin-bring-list-enabled"
              switchLabel="Enable bring list"
              enabled={bringListEnabled}
              onEnabledChange={setBringListEnabled}
            >
              <div className="space-y-4">
                <BringListModeField value={bringListMode} onChange={handleModeChange} />
                <div>
                  <Label htmlFor="admin-bring-list-message">Message for guests</Label>
                  <MarkdownEditor
                    id="admin-bring-list-message"
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
                    <Input
                      id="new-bring-item"
                      placeholder={bringListMode === "signup" ? "Dessert, drinks, side dish" : "Salad, drinks, dessert"}
                      value={newItem}
                      onChange={(event) => setNewItem(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddItem();
                        }
                      }}
                      className="flex-1"
                    />
                    {bringListMode === "signup" && (
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={newItemQty}
                        onChange={(event) => setNewItemQty(parseInt(event.target.value) || 1)}
                        className="w-20"
                        aria-label="Number of slots"
                      />
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleAddItem}
                      disabled={!newItem.trim()}
                      aria-label="Add bring-list item"
                    >
                      <Plus />
                    </Button>
                  </div>
                  {data.bring_items.length > 0 && (
                    <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                      {data.bring_items.map((item) => {
                        const covered = bringListMode === "signup" &&
                          item.committed_quantity >= item.target_quantity;
                        const notedCommitments = item.commitments.filter((commitment) => commitment.note);
                        return (
                          <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{item.item_name}</span>
                                {bringListMode === "signup" && (
                                  <Badge variant={covered ? "default" : "secondary"}>
                                    {item.committed_quantity}/{item.target_quantity} claimed
                                  </Badge>
                                )}
                              </div>
                              {item.commitments.length > 0 && (
                                <p className="mt-1 text-muted-foreground">
                                  {item.commitments.map((commitment) =>
                                    bringListMode === "signup" && commitment.quantity > 1
                                      ? `${commitment.guest_name} ×${commitment.quantity}`
                                      : commitment.guest_name,
                                  ).join(", ")}
                                </p>
                              )}
                              {notedCommitments.length > 0 && (
                                <p className="mt-1 italic text-muted-foreground">
                                  {notedCommitments.map((commitment) =>
                                    `${commitment.guest_name}: “${commitment.note}”`,
                                  ).join(" · ")}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                              disabled={deletingItemId === item.id}
                              onClick={() => handleDeleteItem(item.id)}
                              aria-label={`Remove ${item.item_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </ToggleSection>

            <DisclosureSection
              id="admin-access-heading"
              anchor="access"
              number="04"
              icon={ShieldCheck}
              title="Access & privacy"
              description="Control what guests can see about other replies."
              open={accessOpen}
              onOpenChange={setAccessOpen}
            >
              <OptionSection
                icon={Eye}
                title="Guest list privacy"
                description="Names, totals, or nothing at all."
              >
                <GuestVisibilityField value={visibility} onChange={setVisibility} />
              </OptionSection>
            </DisclosureSection>

            <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 rounded-lg border border-border bg-background/90 p-3 shadow-lg backdrop-blur-md sm:static sm:z-auto sm:flex sm:items-center sm:justify-between sm:gap-6 sm:bg-background sm:shadow-sm sm:backdrop-blur-none">
              <p className="hidden text-sm text-muted-foreground sm:block">Guests see your changes as soon as you save.</p>
              <Button onClick={handleSave} size="lg" disabled={saving} className="w-full px-8 sm:w-auto">
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This event and its guest data will be deleted on{" "}
              <strong>{getExpiryDate(data.event.event_date)}</strong>, 90 days after the event.
            </AlertDescription>
          </Alert>

          <section
            aria-labelledby="danger-zone-title"
            className="rounded-xl border border-destructive/30 bg-card p-5 sm:p-7"
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="danger-zone-title" className="font-sans text-base font-medium text-destructive">
                  Delete event
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Permanently delete the event, RSVPs, bring list and banner image. This cannot be undone.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleting}>
                    <Trash2 className="h-4 w-4" />
                    Delete event
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the event, every RSVP, the bring list and the banner image.
                      This cannot be undone.
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
            </div>
          </section>
        </div>
      </div>

      <AlertDialog
        open={pendingModeSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingModeSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some slots are over-committed</AlertDialogTitle>
            <AlertDialogDescription>
              One or more items have more commitments than available slots. Existing commitments stay,
              but no new ones can exceed the cap.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setBringListMode("signup");
                setPendingModeSwitch(null);
              }}
            >
              Switch anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default AdminPage;
