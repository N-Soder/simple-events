import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { CalendarDays, Clock, MapPin, Users, UtensilsCrossed, Plus, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { getEvent, submitRsvp, claimItem, addCustomItem } from "@/lib/api";
import { format } from "date-fns";
import MarkdownContent from "@/components/MarkdownContent";

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
  };
  rsvps: Array<{ id: string; guest_name: string; adults: number; kids: number }>;
  bring_items: Array<{ id: string; item_name: string; claimed_by: string | null }>;
}

const EventPage = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(false);

  // RSVP form
  const [guestName, setGuestName] = useState("");
  const [adults, setAdults] = useState(1);
  const [kids, setKids] = useState(0);
  const [honeypot, setHoneypot] = useState("");
  const [submittingRsvp, setSubmittingRsvp] = useState(false);

  // Bring list (batched)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [customItemInput, setCustomItemInput] = useState("");

  // Check URL hash for password
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setPassword(hash);
      loadEvent(hash);
    } else {
      const saved = localStorage.getItem(`event_pw_${id}`);
      if (saved) loadEvent(saved);
    }
  }, [id]);

  const loadEvent = async (pw: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await getEvent(id, pw);
      setData(result);
      setAuthenticated(true);
      setPassword(pw);
      if (id) localStorage.setItem(`event_pw_${id}`, pw);
    } catch {
      if (id) localStorage.removeItem(`event_pw_${id}`);
      toast({ title: "Invalid password", variant: "destructive" });
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadEvent(passwordInput);
  };

  const handleRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !guestName.trim()) return;
    setSubmittingRsvp(true);
    try {
      await submitRsvp({ event_id: id, password, guest_name: guestName.trim(), adults, kids, honeypot });

      // Batch claim selected items
      const claimPromises = Array.from(selectedItems).map((itemId) =>
        claimItem(id, password, itemId, guestName.trim()).catch(() => null)
      );
      const customPromises = customItems.map((name) =>
        addCustomItem(id, password, name, guestName.trim()).catch(() => null)
      );
      const results = await Promise.all([...claimPromises, ...customPromises]);
      const failures = results.filter((r) => r === null).length;
      if (failures > 0) {
        toast({ title: "RSVP submitted!", description: `${failures} item(s) couldn't be claimed.`, variant: "default" });
      } else {
        toast({ title: "RSVP submitted!" });
      }

      setGuestName("");
      setAdults(1);
      setKids(0);
      setSelectedItems(new Set());
      setCustomItems([]);
      loadEvent(password);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingRsvp(false);
    }
  };

  const toggleItem = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleAddCustom = () => {
    if (!customItemInput.trim()) return;
    setCustomItems((prev) => [...prev, customItemInput.trim()]);
    setCustomItemInput("");
  };

  const removeCustomItem = (index: number) => {
    setCustomItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Password Gate
  if (!authenticated) {
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

  if (!data) return null;
  const { event, rsvps, bring_items } = data;
  const totalAdults = rsvps.reduce((s, r) => s + r.adults, 0);
  const totalKids = rsvps.reduce((s, r) => s + r.kids, 0);

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
        {event.guest_visibility !== "hidden" && rsvps.length > 0 && (
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
                  {rsvps.map((r) => (
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

        {/* RSVP Form */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">RSVP</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRsvp} className="space-y-4">
              {/* Honeypot - hidden from humans */}
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <input tabIndex={-1} value={honeypot} onChange={(e) => setHoneypot(e.target.value)} autoComplete="off" />
              </div>

              <div>
                <Label htmlFor="guest_name">Your Name *</Label>
                <Input id="guest_name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your name" className="mt-1.5" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="adults">Adults</Label>
                  <Input id="adults" type="number" min={1} max={20} value={adults} onChange={(e) => setAdults(parseInt(e.target.value) || 1)} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="kids">Kids</Label>
                  <Input id="kids" type="number" min={0} max={20} value={kids} onChange={(e) => setKids(parseInt(e.target.value) || 0)} className="mt-1.5" />
                </div>
              </div>
              <Button type="submit" disabled={submittingRsvp}>
                {submittingRsvp ? "Submitting..." : "Submit RSVP"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Bring List */}
        {bring_items.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UtensilsCrossed className="h-5 w-5" />
                Bring List
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {bring_items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                    {item.claimed_by ? (
                      <>
                        <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{item.item_name}</span>
                        <span className="ml-auto text-sm text-muted-foreground">— {item.claimed_by}</span>
                      </>
                    ) : (
                      <>
                        <Checkbox
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={() => toggleItem(item.id)}
                        />
                        <span className="font-medium">{item.item_name}</span>
                      </>
                    )}
                  </li>
                ))}
                {customItems.map((name, i) => (
                  <li key={`custom-${i}`} className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span className="font-medium">{name}</span>
                    <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => removeCustomItem(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="Add your own item..."
                  value={customItemInput}
                  onChange={(e) => setCustomItemInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCustom(); } }}
                />
                <Button variant="outline" size="icon" onClick={handleAddCustom}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
};

export default EventPage;
