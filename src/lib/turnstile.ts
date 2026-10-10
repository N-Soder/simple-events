// Loader for Cloudflare Turnstile, the bot check that guards the optional
// email fields. The script is third party, so it is only fetched once someone
// actually types an email address.

export interface TurnstileOptions {
  sitekey: string;
  /** Stay invisible unless Cloudflare decides it needs a click. */
  appearance: "interaction-only";
  callback(token: string): void;
  "expired-callback"(): void;
  "error-callback"(): void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    simpleEventsTurnstileLoaded?: () => void;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=simpleEventsTurnstileLoaded";
const LOAD_TIMEOUT_MS = 15_000;

let pending: Promise<TurnstileApi> | undefined;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (pending) return pending;
  if (window.turnstile) return Promise.resolve(window.turnstile);
  pending = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error("Verification could not be loaded."));
    };
    const timeout = window.setTimeout(fail, LOAD_TIMEOUT_MS);
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = fail;
    window.simpleEventsTurnstileLoaded = () => {
      if (!window.turnstile) return fail();
      window.clearTimeout(timeout);
      resolve(window.turnstile);
    };
    document.head.appendChild(script);
  }).catch((error) => {
    // Forget a failed load so a later attempt can try again.
    pending = undefined;
    throw error;
  });
  return pending;
}
