import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CalendarDays, Clock, ExternalLink, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getEvent, submitRsvp, claimItem, addCustomItem, getRsvpByManageCode, updateRsvp, ApiError } from "@/lib/api";
import { format } from "date-fns";
import { formatEventTime, prefers12Hour } from "@/lib/time";
import { displayHost, isSafeHttpUrl } from "@/lib/url";
import MarkdownContent from "@/components/MarkdownContent";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import BringListSection, { BringItem } from "@/components/BringListSection";
import RsvpSuccessScreen from "@/components/RsvpSuccessScreen";
import RsvpSummaryCard from "@/components/RsvpSummaryCard";
import AppHeader from "@/components/AppHeader";
import GuestCountFields from "@/components/GuestCountFields";
import { Skeleton } from "@/components/ui/skeleton";

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
    bring_list_message: string | null;
  };
  // Names are only present when guest_visibility === "full" (enforced server-side).
  rsvps?: Array<{ id: string; guest_name: string; adults: number; kids: number }>;
  // Aggregate counts are present for "full" and "count_only", absent for "hidden".
  rsvp_counts?: { count: number; adults: number; kids: number };
  bring_items: BringItem[];
}

interface ClaimedItem {
  id: string;       // commitment ID
  item_id: string;
  item_name: string;
  quantity: number;
  note?: string | null;
}

interface ManagedRsvp {
  rsvp_id: string;
  manage_code: string;
  guest_name: string;
  adults: number;
  kids: number;
  cancelled?: boolean;
  claimed_items: ClaimedItem[];
}

const EventPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState<boolean | null>(null);

  // RSVP form
  const [guestName, setGuestName] = useState("");
  const [adults, setAdults] = useState(1);
  const [kids, setKids] = useState(0);
  const [honeypot, setHoneypot] = useState("");
  const [submittingRsvp, setSubmittingRsvp] = useState(false);

  // Bring list: keyed by item ID
  const [selectedCounts, setSelectedCounts] = useState<Map<string, number>>(new Map());
  const [selectedNotes, setSelectedNotes] = useState<Map<string, string>>(new Map());
  const [customItems, setCustomItems] = useState<Array<{ item_name: string; quantity: number }>>([]);
  const [customItemInput, setCustomItemInput] = useState("");

  // RSVP management state
  const [managedRsvp, setManagedRsvp] = useState<ManagedRsvp | null>(null);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [successClaimedItems, setSuccessClaimedItems] = useState<string[]>([]);

  // Time format: detect browser locale preference, allow toggle
  const [use12Hour, setUse12Hour] = useState<boolean>(prefers12Hour);

  const parseHash = useCallback(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return { type: "none" as const };
    if (hash.startsWith("manage=")) {
      const parts = hash.slice(7).split(".");
      if (parts.length === 2) return { type: "manage" as const, rsvp_id: parts[0], manage_code: parts[1] };
    }
    return { type: "password" as const, value: hash };
  }, []);

  const tryLoadManagedRsvp = useCallback(async (eventId: string) => {
    const hashInfo = parseHash();
    if (hashInfo.type === "manage") {
      try {
        const result = await getRsvpByManageCode(eventId, hashInfo.rsvp_id, hashInfo.manage_code);
        setManagedRsvp({
          rsvp_id: result.rsvp.id as string,
          manage_code: result.rsvp.manage_code as string,
          guest_name: result.rsvp.guest_name as string,
          adults: result.rsvp.adults as number,
          kids: result.rsvp.kids as number,
          cancelled: result.rsvp.cancelled as boolean,
          claimed_items: result.claimed_items as ClaimedItem[],
        });
        localStorage.setItem(`rsvp_manage_${eventId}`, JSON.stringify({ rsvp_id: result.rsvp.id, manage_code: result.rsvp.manage_code }));
        return;
      } catch {
        // Invalid manage link, continue
      }
    }

    const saved = localStorage.getItem(`rsvp_manage_${eventId}`);
    if (saved) {
      try {
        const { rsvp_id, manage_code } = JSON.parse(saved);
        const result = await getRsvpByManageCode(eventId, rsvp_id, manage_code);
        setManagedRsvp({
          rsvp_id: result.rsvp.id as string,
          manage_code: result.rsvp.manage_code as string,
          guest_name: result.rsvp.guest_name as string,
          adults: result.rsvp.adults as number,
          kids: result.rsvp.kids as number,
          cancelled: result.rsvp.cancelled as boolean,
          claimed_items: result.claimed_items as ClaimedItem[],
        });
      } catch {
        localStorage.removeItem(`rsvp_manage_${eventId}`);
      }
    }
  }, [parseHash]);

  useEffect(() => {
    if (!id) return;
    const hashInfo = parseHash();
    const saved = localStorage.getItem(`event_pw_${id}`);
    const pw = hashInfo.type === "password" ? hashInfo.value : saved || undefined;
    loadEvent(pw);
  }, [id]);

  const loadEvent = async (pw: string | undefined) => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await getEvent(id, pw);
      setData(result as EventData);
      setAuthenticated(true);
      setPassword(pw);
      setNeedsPassword(false);
      if (pw) localStorage.setItem(`event_pw_${id}`, pw);
      await tryLoadManagedRsvp(id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        navigate("/not-found", { state: { type: "event" }, replace: true });
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        if (pw) {
          localStorage.removeItem(`event_pw_${id}`);
          toast({ title: "Invalid password", variant: "destructive" });
        }
        setNeedsPassword(true);
      } else {
        const message = error instanceof Error ? error.message : "Failed to load event";
        toast({ title: "Error", description: message, variant: "destructive" });
      }
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadEvent(passwordInput);
  };

  const handleUpdateCount = (itemId: string, count: number) => {
    setSelectedCounts((prev) => {
      const next = new Map(prev);
      // Enforce slot cap client-side for signup mode
      if (data?.event.bring_list_mode === "signup") {
        const item = data.bring_items.find((i) => i.id === itemId);
        if (item) {
          const maxAllowed = item.target_quantity - item.committed_quantity;
          count = Math.min(count, maxAllowed);
        }
      }
      if (count <= 0) next.delete(itemId);
      else next.set(itemId, count);
      return next;
    });
  };

  const handleUpdateNote = (itemId: string, note: string) => {
    setSelectedNotes((prev) => {
      const next = new Map(prev);
      if (note) next.set(itemId, note);
      else next.delete(itemId);
      return next;
    });
  };

  const handleRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !guestName.trim()) return;
    setSubmittingRsvp(true);
    try {
      const rsvpResult = await submitRsvp({ event_id: id, password, guest_name: guestName.trim(), adults, kids, honeypot });
      const rsvpId = rsvpResult.id as string;
      const manageCode = rsvpResult.manage_code as string;

      const claimPromises: Promise<unknown>[] = [];
      const claimedItemNames: string[] = [];

      selectedCounts.forEach((quantity, itemId) => {
        const item = data?.bring_items.find((i) => i.id === itemId);
        if (!item) return;
        const note = selectedNotes.get(itemId);
        claimPromises.push(
          claimItem({ event_id: id, password, item_id: itemId, rsvp_id: rsvpId, manage_code: manageCode, quantity, note }).catch(() => null)
        );
        for (let i = 0; i < quantity; i++) claimedItemNames.push(item.item_name);
      });

      for (const ci of customItems) {
        claimPromises.push(
          addCustomItem({ event_id: id, password, item_name: ci.item_name, rsvp_id: rsvpId, manage_code: manageCode, quantity: ci.quantity }).catch(() => null)
        );
        for (let i = 0; i < ci.quantity; i++) claimedItemNames.push(ci.item_name);
      }

      await Promise.all(claimPromises);

      if (rsvpId && manageCode) {
        localStorage.setItem(`rsvp_manage_${id}`, JSON.stringify({ rsvp_id: rsvpId, manage_code: manageCode }));
        setManagedRsvp({
          rsvp_id: rsvpId,
          manage_code: manageCode,
          guest_name: guestName.trim(),
          adults,
          kids,
          claimed_items: [],
        });
      }

      setSuccessClaimedItems(claimedItemNames);
      setShowSuccessScreen(true);
      loadEvent(password);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSubmittingRsvp(false);
    }
  };

  const handleEditRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !managedRsvp || !guestName.trim()) return;
    setSubmittingRsvp(true);
    try {
      // All existing commitment IDs to remove
      const unclaim_item_ids = managedRsvp.claimed_items.map((i) => i.id);

      // New selections
      const claim_items: Array<{ item_id: string; quantity: number; note?: string }> = [];
      selectedCounts.forEach((quantity, itemId) => {
        claim_items.push({ item_id: itemId, quantity, note: selectedNotes.get(itemId) });
      });

      await updateRsvp({
        rsvp_id: managedRsvp.rsvp_id,
        manage_code: managedRsvp.manage_code,
        event_id: id,
        guest_name: guestName.trim(),
        adults,
        kids,
        unclaim_item_ids,
        claim_items,
        custom_items: customItems,
      });

      toast({ title: "RSVP updated" });
      setEditMode(false);
      setSelectedCounts(new Map());
      setSelectedNotes(new Map());
      setCustomItems([]);
      setCustomItemInput("");
      await loadEvent(password);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSubmittingRsvp(false);
    }
  };

  const enterEditMode = () => {
    if (!managedRsvp) return;
    setGuestName(managedRsvp.guest_name);
    setAdults(managedRsvp.adults);
    setKids(managedRsvp.kids);
    // Pre-select currently committed items by item ID
    const counts = new Map<string, number>();
    for (const item of managedRsvp.claimed_items) {
      counts.set(item.item_id, (counts.get(item.item_id) || 0) + item.quantity);
    }
    setSelectedCounts(counts);
    const notes = new Map<string, string>();
    for (const item of managedRsvp.claimed_items) {
      if (item.note) notes.set(item.item_id, item.note);
    }
    setSelectedNotes(notes);
    setCustomItems([]);
    setCustomItemInput("");
    setEditMode(true);
  };

  const handleAddCustom = () => {
    if (!customItemInput.trim()) return;
    setCustomItems((prev) => [...prev, { item_name: customItemInput.trim(), quantity: 1 }]);
    setCustomItemInput("");
  };

  const removeCustomItem = (index: number) => {
    setCustomItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCancelRsvp = async () => {
    if (!id || !managedRsvp) return;
    try {
      await updateRsvp({
        rsvp_id: managedRsvp.rsvp_id,
        manage_code: managedRsvp.manage_code,
        event_id: id,
        cancelled: true,
        unclaim_item_ids: managedRsvp.claimed_items.map((i) => i.id),
      });
      toast({ title: "RSVP cancelled" });
      await loadEvent(password);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleReRsvp = async () => {
    if (!id || !managedRsvp) return;
    try {
      await updateRsvp({
        rsvp_id: managedRsvp.rsvp_id,
        manage_code: managedRsvp.manage_code,
        event_id: id,
        cancelled: false,
      });
      toast({ title: "Welcome back! Your RSVP is active again." });
      await loadEvent(password);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const manageUrl = managedRsvp && id
    ? `${window.location.origin}/event/${id}#manage=${managedRsvp.rsvp_id}.${managedRsvp.manage_code}`
    : "";

  // Link to put in calendar entries. The password fragment is carried over only
  // when the guest arrived with one already in the URL, so a calendar entry is
  // never a wider disclosure than the link they were sent.
  const arrivedWithPassword = !!password && window.location.hash.slice(1) === password;
  const shareUrl = id
    ? `${window.location.origin}/event/${id}${arrivedWithPassword ? `#${password}` : ""}`
    : "";

  if (loading && !authenticated) {
    return (
      <main id="main-content" className="min-h-[100dvh] bg-background">
        <AppHeader />
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6" aria-busy="true" aria-label="Loading event">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-5 h-12 w-3/4" />
          <Skeleton className="mt-4 h-5 w-1/2" />
          <Skeleton className="mt-10 h-80 w-full rounded-lg" />
        </div>
      </main>
    );
  }

  if (!authenticated && needsPassword) {
    return (
      <main id="main-content" className="page-texture min-h-[100dvh] bg-background">
        <AppHeader />
        <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-12">
        <Card className="surface-panel w-full max-w-sm border-0 shadow-none">
          <CardHeader>
            <p className="eyebrow">Private event</p>
            <h1 className="mt-2 text-3xl">Enter the event password</h1>
            <p className="pt-2 text-sm leading-6 text-muted-foreground">The host protected this page. Ask them for the password if it wasn’t shared with you.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <Label htmlFor="event-password">Password</Label>
              <Input
                id="event-password"
                type="password"
                placeholder="Event password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Checking…" : "Open event"}
              </Button>
            </form>
          </CardContent>
        </Card>
        </div>
      </main>
    );
  }

  if (showSuccessScreen && managedRsvp && data) {
    return (
      <main id="main-content" className="min-h-[100dvh] bg-background">
        <RsvpSuccessScreen
          guestName={managedRsvp.guest_name}
          adults={managedRsvp.adults}
          kids={managedRsvp.kids}
          claimedItems={successClaimedItems}
          manageUrl={manageUrl}
          calendarEvent={{ ...data.event, url: shareUrl }}
          onViewEvent={() => setShowSuccessScreen(false)}
        />
      </main>
    );
  }

  if (!data) return null;
  const { event, bring_items } = data;
  const guestList = data.rsvps ?? [];
  const totalAttending = data.rsvp_counts?.count ?? 0;
  const totalAdults = data.rsvp_counts?.adults ?? 0;
  const totalKids = data.rsvp_counts?.kids ?? 0;
  const showBringList = event.bring_list_enabled && bring_items.length > 0;
  const hasExistingRsvp = !!managedRsvp && !editMode;
  const isEditing = !!managedRsvp && editMode;

  return (
    <main id="main-content" className="page-texture min-h-[100dvh] bg-background">
      <AppHeader />
      {event.banner_url && (
        <div className="h-52 w-full overflow-hidden border-b border-border sm:h-72 lg:h-80">
          <img src={event.banner_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <article className="mx-auto max-w-3xl px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-14">
        <header>
          <p className="eyebrow">You’re invited</p>
          <h1 className="mt-3 text-4xl leading-tight tracking-[-0.03em] sm:text-6xl">{event.name}</h1>

          <div className="mt-6 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <span className="flex min-h-11 items-center gap-2.5 rounded-md bg-muted/55 px-3.5">
              <CalendarDays className="h-4 w-4" />
              {format(new Date(event.event_date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
            </span>
            {event.event_time && (
              <button
                type="button"
                className="flex min-h-11 items-center gap-2.5 rounded-md bg-muted/55 px-3.5 text-left underline decoration-dotted underline-offset-2 transition-colors hover:bg-muted"
                title={use12Hour ? "Switch to 24-hour" : "Switch to AM/PM"}
                aria-label={use12Hour ? "Switch to 24-hour time" : "Switch to AM/PM time"}
                onClick={() => setUse12Hour((v) => !v)}
              >
                <Clock className="h-4 w-4" />
                {formatEventTime(event.event_time, use12Hour)}
                {event.event_end_time && ` – ${formatEventTime(event.event_end_time, use12Hour)}`}
              </button>
            )}
            {event.location && (
              // Only ever linked when the stored URL is a plain http(s) address.
              isSafeHttpUrl(event.location_url) ? (
                <a
                  href={event.location_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-2.5 rounded-md bg-muted/55 px-3.5 underline decoration-dotted underline-offset-2 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <MapPin className="h-4 w-4" />
                  {event.location}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="flex min-h-11 items-center gap-2.5 rounded-md bg-muted/55 px-3.5">
                  <MapPin className="h-4 w-4" />
                  {event.location}
                </span>
              )
            )}
            {!event.location && isSafeHttpUrl(event.location_url) && (
              <a
                href={event.location_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2.5 rounded-md bg-muted/55 px-3.5 underline decoration-dotted underline-offset-2 transition-colors hover:bg-muted hover:text-foreground"
              >
                <MapPin className="h-4 w-4" />
                {displayHost(event.location_url)}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="mt-5">
            <AddToCalendarButton event={{ ...event, url: shareUrl }} />
          </div>

          {event.description && (
            <div className="mt-6 max-w-2xl border-t border-border pt-5 leading-7">
              <MarkdownContent content={event.description} />
            </div>
          )}
        </header>

        {!hasExistingRsvp && (
          <Card className="surface-panel mt-6 border-0 shadow-none sm:mt-8">
            <CardHeader className="border-b border-border pb-5">
              <p className="eyebrow">Your reply</p>
              <h2 className="mt-1 font-serif text-3xl">{isEditing ? "Update your RSVP" : "Can you make it?"}</h2>
              {!isEditing && <p className="pt-1 text-sm text-muted-foreground">Add everyone included in your reply.</p>}
            </CardHeader>
            <CardContent>
              <form onSubmit={isEditing ? handleEditRsvp : handleRsvp} className="space-y-6">
                {!isEditing && (
                  <div className="absolute -left-[9999px]" aria-hidden="true">
                    <input tabIndex={-1} value={honeypot} onChange={(e) => setHoneypot(e.target.value)} autoComplete="off" />
                  </div>
                )}

                <div>
                  <Label htmlFor="guest_name">Your name *</Label>
                  <Input id="guest_name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your name" className="mt-1.5" required />
                </div>
                <GuestCountFields
                  adults={adults}
                  kids={kids}
                  onAdultsChange={setAdults}
                  onKidsChange={setKids}
                />

                {showBringList && (
                  <BringListSection
                    items={bring_items}
                    message={event.bring_list_message}
                    mode={event.bring_list_mode ?? "open"}
                    selectedCounts={selectedCounts}
                    onUpdateCount={handleUpdateCount}
                    selectedNotes={selectedNotes}
                    onUpdateNote={handleUpdateNote}
                    customItems={customItems}
                    customItemInput={customItemInput}
                    onCustomItemInputChange={setCustomItemInput}
                    onAddCustomItem={handleAddCustom}
                    onRemoveCustomItem={removeCustomItem}
                  />
                )}

                <div className="flex gap-2">
                  {isEditing && (
                    <Button type="button" variant="outline" className="flex-1" onClick={() => { setEditMode(false); setSelectedCounts(new Map()); setSelectedNotes(new Map()); setCustomItems([]); }}>
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" className="flex-1" disabled={submittingRsvp}>
                    {submittingRsvp ? "Saving…" : isEditing ? "Update RSVP" : "Send RSVP"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {event.guest_visibility !== "hidden" && totalAttending > 0 && (
          <section className="mt-10 border-t border-border pt-7" aria-labelledby="guest-list-heading">
            <div>
              <h2 className="flex items-center gap-2 font-serif text-2xl">
                <Users className="h-5 w-5" />
                <span id="guest-list-heading">{event.guest_visibility === "full" ? "Who’s coming" : "Attending"}</span>
              </h2>
            </div>
            <div className="mt-4">
              {event.guest_visibility === "full" ? (
                <ul className="space-y-2">
                  {guestList.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
                      <span className="font-medium">{r.guest_name}</span>
                      <span className="text-sm text-muted-foreground">
                        {r.adults} adult{r.adults !== 1 ? "s" : ""}{r.kids > 0 ? `, ${r.kids} kid${r.kids !== 1 ? "s" : ""}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  {totalAdults} adult{totalAdults !== 1 ? "s" : ""}{totalKids > 0 ? ` and ${totalKids} kid${totalKids !== 1 ? "s" : ""}` : ""} attending
                </p>
              )}
            </div>
          </section>
        )}

        {hasExistingRsvp && (
          <RsvpSummaryCard
            guestName={managedRsvp.guest_name}
            adults={managedRsvp.adults}
            kids={managedRsvp.kids}
            claimedItems={managedRsvp.claimed_items}
            cancelled={managedRsvp.cancelled}
            onEdit={enterEditMode}
            onCancel={handleCancelRsvp}
            onReRsvp={handleReRsvp}
          />
        )}
      </article>
    </main>
  );
};

export default EventPage;
