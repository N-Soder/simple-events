import { UtensilsCrossed, Check, Plus, X, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import MarkdownContent from "@/components/MarkdownContent";

export interface BringItem {
  id: string;
  item_name: string;
  target_quantity: number;
  committed_quantity: number;
  commitments: Array<{ guest_name: string; quantity: number; note: string | null }>;
}

interface BringListSectionProps {
  items: BringItem[];
  message: string | null;
  mode: "signup" | "open";
  selectedCounts: Map<string, number>;
  onUpdateCount: (itemId: string, count: number) => void;
  selectedNotes: Map<string, string>;
  onUpdateNote: (itemId: string, note: string) => void;
  customItems: Array<{ item_name: string; quantity: number }>;
  customItemInput: string;
  onCustomItemInputChange: (value: string) => void;
  onAddCustomItem: () => void;
  onRemoveCustomItem: (index: number) => void;
}

const BringListSection = ({
  items,
  message,
  mode,
  selectedCounts,
  onUpdateCount,
  selectedNotes,
  onUpdateNote,
  customItems,
  customItemInput,
  onCustomItemInputChange,
  onAddCustomItem,
  onRemoveCustomItem,
}: BringListSectionProps) => {
  return (
    <div className="space-y-4">
      <Separator />
      <div className="flex items-center gap-2.5">
        <h3 className="flex items-center gap-2 text-lg leading-none tracking-tight">
          <UtensilsCrossed className="h-5 w-5" />
          Bring List
        </h3>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            mode === "signup"
              ? "bg-accent text-accent-foreground"
              : "bg-secondary text-secondary-foreground"
          )}
        >
          {mode === "signup" ? "Fixed slot list" : "Open list"}
        </span>
      </div>

      <MarkdownContent
        content={message || "If you'd like to contribute, select an item below or add your own."}
      />

      <ul className="space-y-2">
        {items.map((item) => {
          const selected = selectedCounts.get(item.id) ?? 0;
          const isSelected = selected > 0;
          const previewCommitted = item.committed_quantity + selected;
          const isFull = mode === "signup" && item.committed_quantity >= item.target_quantity;
          const covered = mode === "signup"
            ? previewCommitted >= item.target_quantity
            : false;
          const maxAllowed = mode === "signup"
            ? item.target_quantity - item.committed_quantity
            : 20;

          return (
            <li
              key={item.id}
              className={cn(
                "rounded-md border px-3 py-2.5 transition-colors",
                isFull && !isSelected && "opacity-55",
                isSelected
                  ? "border-primary bg-primary/5"
                  : isFull
                    ? "border-border"
                    : "hover:border-foreground/20"
              )}
            >
              {/* Main row */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isFull && !isSelected}
                  aria-pressed={isSelected}
                  onClick={() => onUpdateCount(item.id, isSelected ? 0 : 1)}
                  className="flex min-h-9 min-w-0 flex-1 items-center gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{item.item_name}</span>
                  {item.commitments.length > 0 && (
                    <span className="mt-0.5 block space-y-0.5">
                      {item.commitments.map((c, i) =>
                        c.note ? (
                          <span key={i} className="block text-xs italic text-muted-foreground">
                            {c.guest_name}: &ldquo;{c.note}&rdquo;
                          </span>
                        ) : (
                          <span key={i} className="block text-xs text-muted-foreground">
                            {c.guest_name}
                          </span>
                        )
                      )}
                    </span>
                  )}
                </span>
                </button>

                <div className="flex items-center gap-2 ml-auto shrink-0">
                  {/* Sign-up Sheet: Full badge, always for full+unselected */}
                  {mode === "signup" && isFull && !isSelected && (
                    <span className="text-xs font-medium text-destructive">Full</span>
                  )}
                  {/* Sign-up Sheet: slot counter, only for multi-slot items, hidden when full+unselected */}
                  {mode === "signup" && item.target_quantity > 1 && !(isFull && !isSelected) && (
                    <span className={cn(
                      "text-xs",
                      covered ? "font-medium text-primary" : "text-muted-foreground"
                    )}>
                      {previewCommitted}/{item.target_quantity}
                    </span>
                  )}

                  {/* Sign-up Sheet: quantity controls, only for multi-slot items */}
                  {mode === "signup" && isSelected && item.target_quantity > 1 && (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={selected <= 1}
                        onClick={() => onUpdateCount(item.id, selected - 1)}
                        aria-label={`Bring one fewer ${item.item_name}`}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-5 text-center text-sm font-medium">{selected}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={selected >= maxAllowed}
                        onClick={() => onUpdateCount(item.id, selected + 1)}
                        aria-label={`Bring one more ${item.item_name}`}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Inline note input, shown when selected, both modes */}
              {isSelected && (
                <div className="mt-2 border-t border-border/50 pt-2">
                  <label htmlFor={`bring-note-${item.id}`} className="sr-only">Note for {item.item_name}</label>
                  <Input
                    id={`bring-note-${item.id}`}
                    placeholder="Add a note... (optional)"
                    value={selectedNotes.get(item.id) ?? ""}
                    onChange={(e) => onUpdateNote(item.id, e.target.value)}
                    maxLength={150}
                    className="h-9 text-xs"
                  />
                </div>
              )}
            </li>
          );
        })}

        {customItems.map((ci, i) => (
          <li
            key={`custom-${i}`}
            className="flex items-center gap-3 rounded-md border border-primary bg-primary/5 px-3 py-2.5"
          >
            <Check className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-medium">{ci.item_name}</span>
            {ci.quantity > 1 && (
              <span className="text-xs text-muted-foreground">×{ci.quantity}</span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-6 w-6"
              onClick={() => onRemoveCustomItem(i)}
            >
              <X className="h-3 w-3" />
            </Button>
          </li>
        ))}
      </ul>

      {/* Custom item input, open mode only */}
      {mode === "open" && (
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Bringing something else?</p>
          <div className="flex gap-2">
            <Input
              placeholder="Add your own item..."
              value={customItemInput}
              onChange={(e) => onCustomItemInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddCustomItem();
                }
              }}
            />
            <Button type="button" variant="outline" size="icon" aria-label="Add item" onClick={onAddCustomItem}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BringListSection;
