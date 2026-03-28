import { useMemo } from "react";
import { UtensilsCrossed, Check, Plus, X, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import MarkdownContent from "@/components/MarkdownContent";

interface BringItem {
  id: string;
  item_name: string;
  claimed_by: string | null;
}

interface GroupedItem {
  name: string;
  total: number;
  claimed: number;
  claimedBy: string[];
  availableIds: string[];
}

interface BringListSectionProps {
  items: BringItem[];
  message: string | null;
  selectedCounts: Map<string, number>;
  onUpdateCount: (itemName: string, count: number) => void;
  customItems: string[];
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
  const grouped = useMemo<GroupedItem[]>(() => {
    const map = new Map<string, Omit<GroupedItem, "name">>();
    for (const item of items) {
      const entry = map.get(item.item_name) || { total: 0, claimed: 0, claimedBy: [], availableIds: [] };
      entry.total++;
      if (item.claimed_by) {
        entry.claimed++;
        entry.claimedBy.push(item.claimed_by);
      } else {
        entry.availableIds.push(item.id);
      }
      map.set(item.item_name, entry);
    }
    return Array.from(map.entries()).map(([name, data]) => ({ name, ...data }));
  }, [items]);

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
        {grouped.map((group) => {
          const selected = selectedCounts.get(group.name) ?? 0;
          const available = group.availableIds.length;
          const fullyClaimed = available === 0;
          const isSelected = selected > 0;
          const showScarcity = available === 1 && group.total > 1 && !isSelected;

          if (fullyClaimed) {
            return (
              <li
                key={group.name}
                className="flex items-center gap-3 rounded-md border px-3 py-2.5 opacity-50 cursor-not-allowed select-none"
              >
                <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{group.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">Full</span>
              </li>
            );
          }

          return (
            <li
              key={group.name}
              onClick={() => onUpdateCount(group.name, isSelected ? 0 : 1)}
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
              <span className="font-medium">{group.name}</span>
              {showScarcity && (
                <span className="text-xs text-amber-600 font-medium">1 left</span>
              )}
              {isSelected && group.total > 1 && (
                <div
                  className="ml-auto flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={selected <= 1}
                    onClick={() => onUpdateCount(group.name, selected - 1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-5 text-center text-sm font-medium">{selected}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={selected >= available}
                    onClick={() => onUpdateCount(group.name, selected + 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}

        {customItems.map((name, i) => (
          <li
            key={`custom-${i}`}
            className="flex items-center gap-3 rounded-md border border-primary bg-primary/5 px-3 py-2.5"
          >
            <Check className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-medium">{name}</span>
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
