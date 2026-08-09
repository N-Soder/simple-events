import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

/**
 * Copy to the clipboard, falling back to a hidden textarea + execCommand.
 *
 * navigator.clipboard is undefined on insecure origins and can reject when the
 * document is not focused, both of which are reachable in normal use.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

interface CopyButtonProps {
  value: string;
  /** Toast title on success. Pass null to stay silent and rely on the tick. */
  successMessage?: string | null;
  label?: string;
  className?: string;
  variant?: "outline" | "ghost";
}

const CopyButton = ({
  value,
  successMessage = "Copied to clipboard",
  label = "Copy link",
  className,
  variant = "outline",
}: CopyButtonProps) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = async () => {
    const ok = await writeToClipboard(value);
    if (!ok) {
      toast({
        title: "Couldn't copy",
        description: "Please select the link and copy it manually.",
        variant: "destructive",
      });
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
    if (successMessage) toast({ title: successMessage });
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      className={cn("shrink-0", className)}
      onClick={handleCopy}
      title={label}
      aria-label={label}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
};

interface CopyableLinkProps {
  value: string;
  successMessage?: string | null;
  label?: string;
  className?: string;
}

/** A read-only link in a code box with a copy button beside it. */
export const CopyableLink = ({ value, successMessage, label, className }: CopyableLinkProps) => (
  <div className={cn("flex gap-2", className)}>
    <code className="min-w-0 flex-1 overflow-hidden truncate rounded-md bg-muted px-3 py-2 text-sm" title={value}>
      {value}
    </code>
    <CopyButton value={value} successMessage={successMessage} label={label} />
  </div>
);

export default CopyButton;
