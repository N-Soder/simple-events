import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getEvent, submitRsvp, claimItem, addCustomItem, getRsvpByManageCode, updateRsvp } from "@/lib/api";
import { format } from "date-fns";
import MarkdownContent from "@/components/MarkdownContent";
import BringListSection from "@/components/BringListSection";
import RsvpSuccessScreen from "@/components/RsvpSuccessScreen";
import RsvpSummaryCard from "@/components/RsvpSummaryCard";

interface EventData {
  event: {
    id: string;
    name: string;
    description: string | null;
    event_date: string;
    event_time: string | null;
    location: string | null;
    banner_url: string | null;
    guest_visibility: "full" | "count_only" | "hidden";
    bring_list_enabled: boolean;
    bring_list_message: string | null;
  };
  rsvps: Array<{ id: string; guest_name: string; adults: number; kids: number; cancelled?: boolean }>;
  bring_items: Array<{ id: string; item_name: string; claimed_by: string | null }>;
}

interface ManagedRsvp {
  rsvp_id: string;
  manage_code: string;
  guest_name: string;
  adults: number;
  kids: number;
  cancelled?: boolean;
  claimed_items: Array<{ id: string; item_name: string }>;
}

const EventPage = () => {
  const { id } = useParams<{ id: string }>();
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

  // Bring list state
  const [selectedCounts, setSelectedCounts] = useState<Map<string, number>>(new Map());
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [customItemInput, setCustomItemInput] = useState("");

  // RSVP management state
  const [managedRsvp, setManagedRsvp] = useState<ManagedRsvp | null>(null);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [successClaimedItems, setSuccessClaimedItems] = useState<string[]>([]);

  // Parse URL hash to detect manage link vs password
  const parseHash = useCallback(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return { type: "none" as const };
    if (hash.startsWith("manage=")) {
      const parts = hash.slice(7).split(".");
      if (parts.length === 2) return { type: "manage" as const, rsvp_id: parts[0], manage_code: parts[1] };
    }
    return { type: "password" as const, value: hash };
  }, []);

  // Try to load an existing RSVP from localStorage or URL hash
  const tryLoadManagedRsvp = useCallback(async (eventId: string) => {
    // Check hash first
    const hashInfo = parseHash();
    if (hashInfo.type === "manage") {
      try {
        const result = await getRsvpByManageCode(eventId, hashInfo.rsvp_id, hashInfo.manage_code);
        setManagedRsvp({
          rsvp_id: result.rsvp.id,
          manage_code: result.rsvp.manage_code,
          guest_name: result.rsvp.guest_name,
          adults: result.rsvp.adults,
          kids: result.rsvp.kids,
          cancelled: result.rsvp.cancelled,
          claimed_items: result.claimed_items,
        });
        // Save to localStorage for future visits
        localStorage.setItem(`rsvp_manage_${eventId}`, JSON.stringify({ rsvp_id: result.rsvp.id, manage_code: result.rsvp.manage_code }));
        return;
      } catch {
        // Invalid manage link, continue
      }
    }

    // Check localStorage
    const saved = localStorage.getItem(`rsvp_manage_${eventId}`);
    if (saved) {
      try {
        const { rsvp_id, manage_code } = JSON.parse(saved);
        const result = await getRsvpByManageCode(eventId, rsvp_id, manage_code);
        setManagedRsvp({
          rsvp_id: result.rsvp.id,
          manage_code: result.rsvp.manage_code,
          guest_name: result.rsvp.guest_name,
          adults: result.rsvp.adults,
          kids: result.rsvp.kids,
          cancelled: result.rsvp.cancelled,
          claimed_items: result.claimed_items,
        });
      } catch {
        localStorage.removeItem(`rsvp_manage_${eventId}`);
      }
    }
  }, [parseHash]);

  // On mount: try loading the event
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
      setData(result);
      setAuthenticated(true);
      setPassword(pw);
      setNeedsPassword(false);
      if (pw) localStorage.setItem(`event_pw_${id}`, pw);
      // Load managed RSVP after event loads
      await tryLoadManagedRsvp(id);
    } catch {
      if (!pw) {
        setNeedsPassword(true);
      } else {
        localStorage.removeItem(`event_pw_${id}`);
        toast({ title: "Invalid password", variant: "destructive" });
        setNeedsPassword(true);
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

  // Build a lookup from item name → available IDs
  const groupedAvailableIds = useMemo(() => {
    if (!data) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const item of data.bring_items) {
      if (!item.claimed_by) {
        const ids = map.get(item.item_name) || [];
        ids.push(item.id);
        map.set(item.item_name, ids);
      }
    }
    return map;
  }, [data]);

  const handleUpdateCount = (itemName: string, count: number) => {
    setSelectedCounts((prev) => {
      const next = new Map(prev);
      if (count <= 0) next.delete(itemName);
      else next.set(itemName, count);
      return next;
    });
  };

  const handleRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !guestName.trim()) return;
    setSubmittingRsvp(true);
    try {
      const rsvpResult = await submitRsvp({ event_id: id, password, guest_name: guestName.trim(), adults, kids, honeypot });

      // Resolve selected counts to actual item IDs
      const claimIds: string[] = [];
      const claimedItemNames: string[] = [];
      selectedCounts.forEach((count, itemName) => {
        const available = groupedAvailableIds.get(itemName) || [];
        const toClaim = available.slice(0, count);
        claimIds.push(...toClaim);
        for (let i = 0; i < Math.min(count, toClaim.length); i++) {
          claimedItemNames.push(itemName);
        }
      });

      const claimPromises = claimIds.map((itemId) =>
        claimItem(id, password, itemId, guestName.trim()).catch(() => null)
      );
      const customPromises = customItems.map((name) =>
        addCustomItem(id, password, name, guestName.trim()).catch(() => null)
      );
      await Promise.all([...claimPromises, ...customPromises]);

      const allClaimed = [...claimedItemNames, ...customItems];

      // Save manage info to localStorage
      if (rsvpResult.id && rsvpResult.manage_code) {
        localStorage.setItem(`rsvp_manage_${id}`, JSON.stringify({ rsvp_id: rsvpResult.id, manage_code: rsvpResult.manage_code }));
        setManagedRsvp({
          rsvp_id: rsvpResult.id,
          manage_code: rsvpResult.manage_code,
          guest_name: guestName.trim(),
          adults,
          kids,
          claimed_items: allClaimed.map((name, i) => ({ id: `new-${i}`, item_name: name })),
        });
      }

      setSuccessClaimedItems(allClaimed);
      setShowSuccessScreen(true);

      // Reload event data in background
      loadEvent(password);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingRsvp(false);
    }
  };

  const handleEditRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !managedRsvp || !guestName.trim()) return;
    setSubmittingRsvp(true);
    try {
      // Determine which items to unclaim (previously claimed but no longer selected)
      const previouslyClaimedIds = managedRsvp.claimed_items.map((i) => i.id);
      
      // Resolve new selections to IDs
      const newClaimIds: string[] = [];
      selectedCounts.forEach((count, itemName) => {
        const available = groupedAvailableIds.get(itemName) || [];
        newClaimIds.push(...available.slice(0, count));
      });

      await updateRsvp({
        rsvp_id: managedRsvp.rsvp_id,
        manage_code: managedRsvp.manage_code,
        event_id: id,
        guest_name: guestName.trim(),
        adults,
        kids,
        unclaim_item_ids: previouslyClaimedIds,
        claim_item_ids: newClaimIds,
        custom_items: customItems,
      });

      toast({ title: "RSVP updated!" });
      setEditMode(false);
      setSelectedCounts(new Map());
      setCustomItems([]);
      setCustomItemInput("");
      // Reload everything
      await loadEvent(password);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingRsvp(false);
    }
  };

  const enterEditMode = () => {
    if (!managedRsvp) return;
    setGuestName(managedRsvp.guest_name);
    setAdults(managedRsvp.adults);
    setKids(managedRsvp.kids);
    // Pre-select currently claimed items
    const counts = new Map<string, number>();
    for (const item of managedRsvp.claimed_items) {
      counts.set(item.item_name, (counts.get(item.item_name) || 0) + 1);
    }
    setSelectedCounts(counts);
    setCustomItems([]);
    setCustomItemInput("");
    setEditMode(true);
  };

  const handleAddCustom = () => {
    if (!customItemInput.trim()) return;
    setCustomItems((prev) => [...prev, customItemInput.trim()]);
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
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const manageUrl = managedRsvp && id
    ? `${window.location.origin}/event/${id}#manage=${managedRsvp.rsvp_id}.${managedRsvp.manage_code}`
    : "";

  // Loading state
  if (loading && !authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  // Password Gate
  if (!authenticated && needsPassword) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>Enter Password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <Input
                type="password"
                placeholder="Event password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying..." : "Enter"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Success Screen
  if (showSuccessScreen && managedRsvp) {
    return (
      <main className="min-h-screen bg-background">
        <RsvpSuccessScreen
          guestName={managedRsvp.guest_name}
          adults={managedRsvp.adults}
          kids={managedRsvp.kids}
          claimedItems={successClaimedItems}
          manageUrl={manageUrl}
          onViewEvent={() => setShowSuccessScreen(false)}
        />
      </main>
    );
  }

  if (!data) return null;
  const { event, rsvps, bring_items } = data;
  const activeRsvps = rsvps.filter((r) => !r.cancelled);
  const totalAdults = activeRsvps.reduce((s, r) => s + r.adults, 0);
  const totalKids = activeRsvps.reduce((s, r) => s + r.kids, 0);
  const showBringList = event.bring_list_enabled && bring_items.length > 0;
  const hasExistingRsvp = !!managedRsvp && !editMode;
  const isEditing = !!managedRsvp && editMode;

  return (
    <main className="min-h-screen bg-background">
      {/* Banner */}
      {event.banner_url && (
        <div className="h-56 w-full overflow-hidden sm:h-72">
          <img src={event.banner_url} alt="Event banner" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <h1 className="text-3xl font-bold sm:text-4xl">{event.name}</h1>

        <div className="mt-4 flex flex-wrap gap-4 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {format(new Date(event.event_date), "EEEE, MMMM d, yyyy")}
          </span>
          {event.event_time && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {event.event_time}
            </span>
          )}
          {event.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {event.location}
            </span>
          )}
        </div>

        {event.description && (
          <div className="mt-4">
            <MarkdownContent content={event.description} />
          </div>
        )}

        {/* Guest Info Section */}
        {event.guest_visibility !== "hidden" && activeRsvps.length > 0 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                {event.guest_visibility === "full" ? "Guest List" : "Attending"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {event.guest_visibility === "full" ? (
                <ul className="space-y-2">
                  {activeRsvps.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
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
            </CardContent>
          </Card>
        )}

        {/* Returning guest: show summary card */}
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

        {/* RSVP + Bring List Form (new submission or edit mode) */}
        {!hasExistingRsvp && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">{isEditing ? "Edit RSVP" : "RSVP"}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={isEditing ? handleEditRsvp : handleRsvp} className="space-y-6">
                {/* Honeypot */}
                {!isEditing && (
                  <div className="absolute -left-[9999px]" aria-hidden="true">
                    <input tabIndex={-1} value={honeypot} onChange={(e) => setHoneypot(e.target.value)} autoComplete="off" />
                  </div>
                )}

                <div>
                  <Label htmlFor="guest_name">Your Name *</Label>
                  <Input id="guest_name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your name" className="mt-1.5" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Adults</Label>
                    <Select value={String(adults)} onValueChange={(val) => setAdults(parseInt(val))}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Kids</Label>
                    <Select value={String(kids)} onValueChange={(val) => setKids(parseInt(val))}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {showBringList && (
                  <BringListSection
                    items={bring_items}
                    message={event.bring_list_message}
                    selectedCounts={selectedCounts}
                    onUpdateCount={handleUpdateCount}
                    customItems={customItems}
                    customItemInput={customItemInput}
                    onCustomItemInputChange={setCustomItemInput}
                    onAddCustomItem={handleAddCustom}
                    onRemoveCustomItem={removeCustomItem}
                  />
                )}

                <div className="flex gap-2">
                  {isEditing && (
                    <Button type="button" variant="outline" className="flex-1" onClick={() => { setEditMode(false); setSelectedCounts(new Map()); setCustomItems([]); }}>
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" className="flex-1" disabled={submittingRsvp}>
                    {submittingRsvp ? "Submitting..." : isEditing ? "Update RSVP" : "Submit RSVP"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
};

export default EventPage;
