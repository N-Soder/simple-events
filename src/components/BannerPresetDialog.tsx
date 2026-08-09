import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BANNER_PRESETS, type BannerPreset } from "@/lib/bannerPresets";

interface BannerPresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The preset already chosen, so reopening shows what is currently set. */
  selectedId: string | null;
  onSelect: (preset: BannerPreset) => void;
}

/**
 * Grid of ready-made banners.
 *
 * Picking closes the dialog immediately rather than requiring a confirm step:
 * the choice is visible in the form the moment it lands, changing it is one more
 * tap, and a Cancel/Apply pair on eight tiles is ceremony this form does not
 * need.
 *
 * The tiles load the 400 px thumbnails, not the banners themselves, so opening
 * this costs a fraction of what the set weighs. The full-size file is fetched
 * only once a host has picked one and the preview renders it.
 */
const BannerPresetDialog = ({
  open,
  onOpenChange,
  selectedId,
  onSelect,
}: BannerPresetDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Choose a banner</DialogTitle>
        <DialogDescription>You can change it any time.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BANNER_PRESETS.map((preset) => {
          const selected = preset.id === selectedId;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                onSelect(preset);
                onOpenChange(false);
              }}
              className={`group rounded-lg text-left transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                selected ? "ring-2 ring-primary ring-offset-2" : ""
              }`}
            >
              <img
                src={preset.thumbUrl}
                alt={preset.label}
                width={400}
                height={200}
                loading="lazy"
                className="aspect-[2/1] w-full rounded-lg object-cover"
              />
            </button>
          );
        })}
      </div>
    </DialogContent>
  </Dialog>
);

export default BannerPresetDialog;
