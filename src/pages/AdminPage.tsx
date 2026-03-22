import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CalendarDays, Clock, MapPin, Users, UtensilsCrossed, Plus, Trash2, Save, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import {
  getAdminEvent,
  updateEvent,
  adminAddBringItem,
  adminDeleteBringItem,
  adminDeleteRsvp,
} from "@/lib/api";
import MarkdownEditor from "@/components/MarkdownEditor";

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
    admin_token: string;
  };
  rsvps: Array<{ id: string; guest_name: string; adults: number; kids: number; cancelled?: boolean }>;
  bring_items: Array<{ id: string; item_name: string; claimed_by: string | null }>;
}

const AdminPage = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { toast } = useToast();
  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [location, setLocation] = useState("");
  const [visibility, setVisibility] = useState<"full" | "count_only" | "hidden">("full");
  const [bringListEnabled, setBringListEnabled] = useState(true);
  const [bringListMessage, setBringListMessage] = useState("If you'd like to contribute, please bring something from the list below or add what you're planning to bring!");
  const [newItem, setNewItem] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);

  const loadData = async () => {
    if (!id || !token) return;
    setLoading(true);
    try {
      const result = await getAdminEvent(id, token);
      setData(result);
      setName(result.event.name);
      setDescription(result.event.description || "");
      setEventDate(result.event.event_date);
      setEventTime(result.event.event_time || "");
      setLocation(result.event.location || "");
      setVisibility(result.event.guest_visibility);
      setBringListEnabled(result.event.bring_list_enabled);
      setBringListMessage(result.event.bring_list_message || "If you'd like to contribute, please bring something from the list below or add what you're planning to bring!");
    } catch {
      toast({ title: "Invalid admin link", variant: "destructive" });
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
        name, description, event_date: eventDate, event_time: eventTime || null, location, guest_visibility: visibility, bring_list_enabled: bringListEnabled, bring_list_message: bringListMessage,
      });
      toast({ title: "Event updated!" });
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async () => {
    if (!id || !newItem.trim()) return;
    try {
      await adminAddBringItem(id, token, newItem.trim(), Math.min(Math.max(newItemQty, 1), 20));
      setNewItem("");
      setNewItemQty(1);
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!id) return;
    try {
      await adminDeleteBringItem(id, token, itemId);
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteRsvp = async (rsvpId: string) => {
    if (!id) return;
    try {
      await adminDeleteRsvp(id, token, rsvpId);
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
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

            {/* Visibility Setting */}
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
                  <li key={r.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                    <div>
                      <span className="font-medium">{r.guest_name}</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {r.adults} adult{r.adults !== 1 ? "s" : ""}{r.kids > 0 ? `, ${r.kids} kid${r.kids !== 1 ? "s" : ""}` : ""}
                      </span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteRsvp(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
                {data.bring_items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <span className="font-medium">{item.item_name}</span>
                      {item.claimed_by && <span className="ml-2 text-sm text-muted-foreground">— {item.claimed_by}</span>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteItem(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Add item..."
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddItem(); } }}
                className="flex-1"
              />
              <Input
                type="number"
                min={1}
                max={20}
                value={newItemQty}
                onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
                className="w-16"
                title="Quantity"
              />
              <Button variant="outline" size="icon" onClick={handleAddItem}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default AdminPage;
