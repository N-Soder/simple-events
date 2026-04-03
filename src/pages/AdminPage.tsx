import { useState, useEffect } from "react";

const OPEN_LIST_MESSAGE = "Bringing something? Pick an item from the list or add what you're planning to bring, and feel free to leave a comment.";
const FIXED_SLOT_MESSAGE = "Bringing something? Grab an item before it's gone from the selection, and feel free to leave a comment.";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { CalendarDays, Clock, MapPin, Users, UtensilsCrossed, Plus, Trash2, Save, Shield, Link, AlertTriangle, ListOrdered, ListPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  getAdminEvent,
  updateEvent,
  adminAddBringItem,
  adminDeleteBringItem,
  adminDeleteRsvp,
  adminDeleteEvent,
  ApiError,
} from "@/lib/api";
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
import MarkdownEditor from "@/components/MarkdownEditor";
import { BringItem } from "@/components/BringListSection";

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
    bring_list_mode: "signup" | "open";
    admin_token: string;
  };
  rsvps: Array<{ id: string; guest_name: string; adults: number; kids: number; cancelled?: boolean; manage_code: string }>;
  bring_items: BringItem[];
}

function getExpiryDate(eventDate: string): string {
  const d = new Date(eventDate);
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
  const [location, setLocation] = useState("");
  const [visibility, setVisibility] = useState<"full" | "count_only" | "hidden">("full");
  const [bringListEnabled, setBringListEnabled] = useState(true);
  const [bringListMode, setBringListMode] = useState<"signup" | "open">("open");
  const [bringListMessage, setBringListMessage] = useState(OPEN_LIST_MESSAGE);
  const [newItem, setNewItem] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<"signup" | "open" | null>(null);

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
      setLocation((result.event.location as string) || "");
      setVisibility(result.event.guest_visibility as "full" | "count_only" | "hidden");
      setBringListEnabled(result.event.bring_list_enabled as boolean);
      const loadedMode = (result.event.bring_list_mode as "signup" | "open") ?? "open";
      setBringListMode(loadedMode);
      setBringListMessage(
        (result.event.bring_list_message as string) ||
        (loadedMode === "open" ? OPEN_LIST_MESSAGE : FIXED_SLOT_MESSAGE)
      );
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
      await updateEvent(id, token, {
        name, description, event_date: eventDate, event_time: eventTime || null, location,
        guest_visibility: visibility, bring_list_enabled: bringListEnabled,
        bring_list_message: bringListMessage, bring_list_mode: bringListMode,
      });
      toast({ title: "Event updated!" });
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
    try {
      await adminDeleteBringItem(id, token, itemId);
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleDeleteRsvp = async (rsvpId: string) => {
    if (!id) return;
    try {
      await adminDeleteRsvp(id, token, rsvpId);
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
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

  const copyManageLink = (rsvp: EventData["rsvps"][number]) => {
    const url = `${window.location.origin}/event/${id}#manage=${rsvp.id}.${rsvp.manage_code}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: `Manage link copied for ${rsvp.guest_name}` });
    });
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Invalid admin link.</p></div>;
  }

  const guestLink = `${window.location.origin}/event/${id}`;
  const activeRsvps = data.rsvps.filter((r) => !r.cancelled);
  const totalAdults = activeRsvps.reduce((s, r) => s + r.adults, 0);
  const totalKids = activeRsvps.reduce((s, r) => s + r.kids, 0);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>

        {/* Guest Link */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <p className="mb-1 text-sm font-medium text-muted-foreground">Guest Link</p>
            <code className="block truncate rounded bg-muted px-3 py-2 text-sm">{guestLink}</code>
          </CardContent>
        </Card>

        {/* Auto-deletion notice */}
        <Alert className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This event and all guest data will be automatically deleted on{" "}
            <strong>{getExpiryDate(data.event.event_date)}</strong> (90 days after the event date).
          </AlertDescription>
        </Alert>

        {/* Edit Event Details */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Edit Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Event Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Description</Label>
              <MarkdownEditor value={description} onChange={setDescription} placeholder="Event description..." rows={3} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label><CalendarDays className="mr-1 inline h-4 w-4" />Date</Label>
                <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label><Clock className="mr-1 inline h-4 w-4" />Time</Label>
                <Input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label><MapPin className="mr-1 inline h-4 w-4" />Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1.5" />
            </div>

            <div>
              <Label className="mb-3 block">Guest List Visibility</Label>
              <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)} className="space-y-2">
                {[
                  { value: "full", label: "Full guest list", desc: "Names and counts visible" },
                  { value: "count_only", label: "Total count only", desc: "Aggregate numbers only" },
                  { value: "hidden", label: "Hidden", desc: "No guest info shown" },
                ].map((opt) => (
                  <label key={opt.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${visibility === opt.value ? "border-primary bg-primary/5" : "border-border"}`}>
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
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* RSVPs */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              RSVPs ({data.rsvps.length})
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {totalAdults} adults, {totalKids} kids
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.rsvps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.rsvps.map((r) => (
                  <li key={r.id} className={`flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 ${r.cancelled ? "opacity-50" : ""}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-medium truncate ${r.cancelled ? "line-through" : ""}`}>{r.guest_name}</span>
                      {r.cancelled && <Badge variant="secondary" className="text-xs shrink-0">Cancelled</Badge>}
                      <span className="text-sm text-muted-foreground shrink-0">
                        {r.adults} adult{r.adults !== 1 ? "s" : ""}{r.kids > 0 ? `, ${r.kids} kid${r.kids !== 1 ? "s" : ""}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        title="Copy manage link"
                        onClick={() => copyManageLink(r)}
                      >
                        <Link className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteRsvp(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Bring List */}
        <Card className={!bringListEnabled ? "opacity-60" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UtensilsCrossed className="h-5 w-5" />
              Bring List
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm font-normal text-muted-foreground">{bringListEnabled ? "Visible to guests" : "Hidden from guests"}</span>
                <Switch checked={bringListEnabled} onCheckedChange={setBringListEnabled} />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mode selector */}
            <div>
              <Label className="mb-2 block">List type</Label>
              <RadioGroup value={bringListMode} onValueChange={(v) => handleModeChange(v as "signup" | "open")} className="space-y-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${bringListMode === "open" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <RadioGroupItem value="open" className="mt-0.5" />
                  <div>
                    <p className="font-medium flex items-center gap-1.5"><ListPlus className="h-4 w-4" /> Open List</p>
                    <p className="text-sm text-muted-foreground">No limits. Guests can choose from suggestions or add their own items.</p>
                  </div>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${bringListMode === "signup" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <RadioGroupItem value="signup" className="mt-0.5" />
                  <div>
                    <p className="font-medium flex items-center gap-1.5"><ListOrdered className="h-4 w-4" /> Fixed Slot List</p>
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
                            <span className={`text-xs ${covered ? "text-emerald-600 font-medium" : "text-muted-foreground"}`}>
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => handleDeleteItem(item.id)}>
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
              <Button variant="outline" size="icon" onClick={handleAddItem}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
        {/* Danger Zone */}
        <Card className="mt-6 border-destructive/40">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Permanently delete this event, all RSVPs, the bring list, and the banner image. This cannot be undone.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Event
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
                    Delete Event
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
            <AlertDialogAction onClick={confirmModeSwitch}>Switch Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default AdminPage;
