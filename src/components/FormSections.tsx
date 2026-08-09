import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";

/**
 * The numbered sections that make up the event form.
 *
 * Creating an event and editing one later are the same job at different moments,
 * so both pages are built from these three shells: a plain section for the parts
 * every event needs, a toggled one for the parts that only exist if the host
 * wants them, and a disclosure for settings worth keeping out of the way. Sharing
 * the shells is what keeps the two pages recognisable as the same form.
 */

const HEADER = "flex items-center gap-3 px-5 py-5 sm:px-7";
const NUMBER = "font-serif text-2xl text-primary/70";
const CHIP = "flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground";
const BODY = "border-t border-border px-5 py-6 sm:px-7 sm:py-8";

interface SectionProps {
  /** Id of the section heading, so the panel is labelled by it. */
  id: string;
  /** Anchor for in-page navigation, when a page links to its sections. */
  anchor?: string;
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}

const panelClass = (anchor?: string) =>
  `surface-panel overflow-hidden${anchor ? " scroll-mt-24" : ""}`;

/** A section that is always open, for details the event can't do without. */
export const FormSection = ({ id, anchor, number, icon: Icon, title, description, children }: SectionProps) => (
  <section id={anchor} className={panelClass(anchor)} aria-labelledby={id}>
    <div className={HEADER}>
      <span className={NUMBER} aria-hidden="true">{number}</span>
      <span className={CHIP}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <h2 id={id} className="font-sans text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
    <div className={BODY}>{children}</div>
  </section>
);

interface ToggleSectionProps extends SectionProps {
  /** Id for the switch, so hosts can be pointed straight at it. */
  switchId: string;
  switchLabel: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

/**
 * A section the host opts into. The body is unmounted while the switch is off:
 * a feature that isn't part of the event shouldn't take up room describing
 * itself.
 */
export const ToggleSection = ({
  id,
  anchor,
  number,
  icon: Icon,
  title,
  description,
  switchId,
  switchLabel,
  enabled,
  onEnabledChange,
  children,
}: ToggleSectionProps) => (
  <section id={anchor} className={panelClass(anchor)} aria-labelledby={id}>
    <div className={HEADER}>
      <span className={NUMBER} aria-hidden="true">{number}</span>
      <span className={CHIP}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <h2 id={id} className="font-sans text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={switchId}
        aria-label={switchLabel}
        checked={enabled}
        onCheckedChange={onEnabledChange}
      />
    </div>
    {enabled && <div className={BODY}>{children}</div>}
  </section>
);

interface DisclosureSectionProps extends SectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A section that is always in play but folded away until it's wanted. */
export const DisclosureSection = ({
  id,
  anchor,
  number,
  icon: Icon,
  title,
  description,
  open,
  onOpenChange,
  children,
}: DisclosureSectionProps) => (
  <section id={anchor} className={panelClass(anchor)} aria-labelledby={id}>
    <h2 id={id} className="sr-only">{title}</h2>
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-labelledby={id}
          aria-describedby={`${id}-description`}
          className={`${HEADER} w-full text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
        >
          <span className={NUMBER} aria-hidden="true">{number}</span>
          <span className={CHIP}><Icon className="h-4 w-4" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{title}</span>
            <span id={`${id}-description`} className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
          </span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={BODY}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  </section>
);

interface OptionSectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}

/** A labelled setting inside a section, with its explanation beside it. */
export const OptionSection = ({ icon: Icon, title, description, children }: OptionSectionProps) => (
  <section className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-7">
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</div>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
    <div className="min-w-0">{children}</div>
  </section>
);
