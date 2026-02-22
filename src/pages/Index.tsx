import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarDays, MapPin, Clock, Plus, X, Upload, PartyPopper } from "lucide-react";
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

const schema = z.object({
  name: z.string().trim().min(1, "Event name is required").max(200),
  description: z.string().trim().max(2000).optional(),
  event_date: z.string().min(1, "Date is required"),
  event_time: z.string().optional(),
  location: z.string().trim().max(500).optional(),
  password: z.string().min(1, "Password is required").max(100),
  guest_visibility: z.enum(["full", "count_only", "hidden"]),
});

type FormData = z.infer<typeof schema>;

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [bringListEnabled, setBringListEnabled] = useState(true);
  const [bringItems, setBringItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { guest_visibility: "full" },
  });

  const visibility = watch("guest_visibility");

  const addItem = () => {
    const trimmed = newItem.trim();
    if (trimmed && !bringItems.includes(trimmed)) {
      setBringItems([...bringItems, trimmed]);
      setNewItem("");
    }
  };

  const removeItem = (index: number) => {
    setBringItems(bringItems.filter((_, i) => i !== index));
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
    }
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      let banner_url: string | undefined;
      if (bannerFile) {
        banner_url = await uploadBanner(bannerFile);
      }

      const result = await createEvent({
        name: data.name,
        description: data.description,
        event_date: data.event_date,
        event_time: data.event_time,
        location: data.location,
        password: data.password,
        guest_visibility: data.guest_visibility,
        bring_list_enabled: bringListEnabled,
        banner_url,
        bring_items: bringListEnabled ? bringItems : [],
      });

      navigate(`/created?id=${result.id}&token=${result.admin_token}`);
    } catch (err: any) {
      toast({ title: "Error creating event", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <PartyPopper className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Create an Event</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Set up your gathering and share a private link with your guests.
          </p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Banner Upload */}
              <div>
                <Label>Banner Photo (optional)</Label>
                <div className="mt-2">
                  {bannerPreview ? (
                    <div className="relative">
                      <img src={bannerPreview} alt="Banner preview" className="h-48 w-full rounded-lg object-cover" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute right-2 top-2 h-8 w-8"
                        onClick={() => { setBannerFile(null); setBannerPreview(null); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/50 transition-colors hover:bg-muted">
                      <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleBannerChange} />
                    </label>
                  )}
                </div>
              </div>

              {/* Event Name */}
              <div>
                <Label htmlFor="name">Event Name *</Label>
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
                  rows={3}
                />
              </div>

              {/* Date & Time */}
              <div className="grid gap-4 sm:grid-cols-2">
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
                    Time
                  </Label>
                  <Input id="event_time" type="time" {...register("event_time")} className="mt-1.5" />
                </div>
              </div>

              {/* Location */}
              <div>
                <Label htmlFor="location">
                  <MapPin className="mr-1.5 inline h-4 w-4" />
                  Location
                </Label>
                <Input id="location" placeholder="123 Main St or 'John's backyard'" {...register("location")} className="mt-1.5" />
              </div>

              {/* Password */}
              <div>
                <Label htmlFor="password">Guest Password *</Label>
                <Input id="password" type="text" placeholder="A simple password for your guests" {...register("password")} className="mt-1.5" />
                {errors.password && <p className="mt-1 text-sm text-destructive">{errors.password.message}</p>}
                <p className="mt-1 text-xs text-muted-foreground">Guests will need this to view your event.</p>
              </div>

              {/* Guest Visibility */}
              <div>
                <Label className="mb-3 block">Guest List Visibility</Label>
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
                      <p className="text-sm text-muted-foreground">No guest info shown — only the bring list is visible</p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {/* Bring List */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <Label>Bring List</Label>
                  <Switch checked={bringListEnabled} onCheckedChange={setBringListEnabled} />
                </div>
                {!bringListEnabled && (
                  <p className="text-sm text-muted-foreground">Bring list is disabled — guests won't see it.</p>
                )}
                {bringListEnabled && (
                  <>
                <p className="mb-3 text-sm text-muted-foreground">Add items guests can volunteer to bring.</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. Salad, Drinks, Dessert"
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={addItem}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {bringItems.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {bringItems.map((item, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">
                        {item}
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
                {isSubmitting ? "Creating..." : "Create Event"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Index;
