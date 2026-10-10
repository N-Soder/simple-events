import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadTurnstile, type TurnstileApi } from "@/lib/turnstile";

export interface EmailFieldHandle {
  /** A bot-check token for this submit, waiting for the check if it is still running. */
  getToken(): Promise<string>;
  /** Tokens are single use: call this after any request that carried one and failed. */
  reset(): void;
}

interface EmailFieldProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  siteKey: string;
  error?: string;
}

const UNAVAILABLE = "We can’t send email right now. Clear this field to continue without it.";
const TOKEN_WAIT_MS = 15_000;

interface Waiter {
  resolve(token: string): void;
  reject(error: Error): void;
}

/**
 * An optional email address plus the invisible bot check that has to pass
 * before the server will send to it. The check only loads once something has
 * been typed, so people who skip the field never touch a third-party script.
 */
const EmailField = forwardRef<EmailFieldHandle, EmailFieldProps>(
  ({ id, label, hint, value, onChange, siteKey, error }, ref) => {
    const container = useRef<HTMLDivElement>(null);
    const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
    const token = useRef<string | null>(null);
    const waiter = useRef<Waiter | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const active = value.trim() !== "";

    useEffect(() => {
      if (!active) return;
      let live = true;
      const fail = () => {
        if (!live) return;
        token.current = null;
        setUnavailable(true);
        waiter.current?.reject(new Error(UNAVAILABLE));
        waiter.current = null;
      };
      loadTurnstile()
        .then((api) => {
          if (!live || !container.current) return;
          const widgetId = api.render(container.current, {
            sitekey: siteKey,
            appearance: "interaction-only",
            callback: (issued) => {
              if (!live) return;
              setUnavailable(false);
              if (waiter.current) {
                waiter.current.resolve(issued);
                waiter.current = null;
              } else {
                token.current = issued;
              }
            },
            // Turnstile refreshes an expired token itself and calls back again.
            "expired-callback": () => {
              token.current = null;
            },
            "error-callback": fail,
          });
          if (widgetId === undefined) fail();
          else widget.current = { api, id: widgetId };
        })
        .catch(fail);
      return () => {
        live = false;
        token.current = null;
        // Nothing will answer a submit that is still waiting on this widget.
        waiter.current?.reject(new Error(UNAVAILABLE));
        waiter.current = null;
        setUnavailable(false);
        if (widget.current) {
          widget.current.api.remove(widget.current.id);
          widget.current = null;
        }
      };
    }, [active, siteKey]);

    useImperativeHandle(ref, () => ({
      getToken() {
        if (token.current) {
          const issued = token.current;
          token.current = null;
          return Promise.resolve(issued);
        }
        if (unavailable) return Promise.reject(new Error(UNAVAILABLE));
        // Only one submit can be waiting; a newer one replaces it.
        waiter.current?.reject(new Error(UNAVAILABLE));
        return new Promise<string>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            waiter.current = null;
            reject(new Error(UNAVAILABLE));
          }, TOKEN_WAIT_MS);
          waiter.current = {
            resolve: (issued) => {
              window.clearTimeout(timer);
              resolve(issued);
            },
            reject: (reason) => {
              window.clearTimeout(timer);
              reject(reason);
            },
          };
        });
      },
      reset() {
        token.current = null;
        if (!widget.current) return;
        try {
          widget.current.api.reset(widget.current.id);
        } catch {
          setUnavailable(true);
        }
      },
    }), [unavailable]);

    const message = error ?? (active && unavailable ? UNAVAILABLE : undefined);

    return (
      <div>
        <Label htmlFor={id}>
          {label} <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id={id}
          // Plain text on purpose: a type="email" input makes the browser block the
          // RSVP form with its own bubble before our "Enter a valid email" message can show.
          type="text"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          placeholder="you@example.com"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1.5"
          aria-invalid={!!message}
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-5 text-muted-foreground">
          {hint}{" "}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy</Link>
        </p>
        {message && <p className="field-error" role="alert">{message}</p>}
        <div ref={container} />
      </div>
    );
  },
);
EmailField.displayName = "EmailField";

export default EmailField;
