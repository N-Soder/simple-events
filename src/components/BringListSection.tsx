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
  commitments: Array<{ guest_name: string; quantity: number }>;
}

interface BringListSectionProps {
  items: BringItem[];
  message: string | null;
  selectedCounts: Map<string, number>;
  onUpdateCount: (itemId: string, count: number) => void;
  customItems: Array<{ item_name: string; quantity: number }>;
  customItemInput: string;
  onCustomItemInputChange: (value: string) => void;
  onAddCustomItem: () => void;
  onRemoveCustomItem: (index: number) => void;
}

const BringListSection = ({
  items,
  message,
  selectedCounts,
  onUpdateCount,
  customItems,
  customItemInput,
  onCustomItemInputChange,
  onAddCustomItem,
  onRemoveCustomItem,
}: BringListSectionProps) => {
  return (
    <div className="space-y-4">
      <Separator />
      <div className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
        <UtensilsCrossed className="h-5 w-5" />
        Bring List
      </div>

      <MarkdownContent
        content={message || "If you'd like to contribute, please select items from the list below or add your own!"}
      />

      <ul className="space-y-2">
        {items.map((item) => {
          const selected = selectedCounts.get(item.id) ?? 0;
          const isSelected = selected > 0;
          const previewCommitted = item.committed_quantity + selected;
          const covered = previewCommitted >= item.target_quantity;
          const committerNames = item.commitments.map((c) => c.guest_name);

          return (
            <li
              key={item.id}
              onClick={() => onUpdateCount(item.id, isSelected ? 0 : 1)}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors select-none",
                isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              )}
            >
              <Check
                className={cn(
                  "h-4 w-4 shrink-0 text-primary transition-opacity",
                  isSelected ? "opacity-100" : "opacity-0"
                )}
              />
              <div className="flex-1 min-w-0">
                <span className="font-medium">{item.item_name}</span>
                {committerNames.length > 0 && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {committerNames.join(", ")}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto shrink-0">
                {covered && !isSelected && (
                  <span className="text-xs font-medium text-emerald-600">Covered</span>
                )}
                {item.target_quantity > 1 && (
                  <span className={cn(
                    "text-xs",
                    covered ? "text-emerald-600 font-medium" : "text-muted-foreground"
                  )}>
                    {previewCommitted}/{item.target_quantity}
                  </span>
                )}
                {item.target_quantity === 1 && previewCommitted > 0 && !isSelected && (
                  <span className="text-xs text-muted-foreground">
                    {previewCommitted} bringing
                  </span>
                )}

                {isSelected && (
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={selected <= 1}
                      onClick={() => onUpdateCount(item.id, selected - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-5 text-center text-sm font-medium">{selected}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onUpdateCount(item.id, selected + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
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
    </div>
  );
};

export default BringListSection;
