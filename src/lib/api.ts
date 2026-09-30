const FUNCTION_URL = "/api";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// The JSON response boundary is intentionally untyped (`any`); callers cast the
// result to the typed interface they expect. This keeps the fetch helper simple
// while letting the rest of the app be type-checked.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${FUNCTION_URL}/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  let data: { error?: string; [key: string]: unknown };
  try {
    data = await res.json();
  } catch {
    data = { error: res.statusText || "Unexpected server response" };
  }
  if (!res.ok) throw new ApiError(data.error || "API error", res.status);
  return data;
}

export async function createEvent(params: {
  name: string;
  description?: string;
  event_date: string;
  event_time?: string;
  event_end_time?: string;
  timezone?: string;
  location?: string;
  location_url?: string;
  banner_url?: string;
  password?: string;
  guest_visibility: "full" | "count_only" | "hidden";
  bring_list_enabled?: boolean;
  bring_items: Array<{ name: string; quantity: number }>;
  bring_list_message?: string;
  bring_list_mode?: "signup" | "open";
}) {
  return apiFetch("create", { method: "POST", body: JSON.stringify(params) });
}

/**
 * Exchange an event password for an access token. The password is sent here and
 * nowhere else; later requests carry the token. `access_token` is null for an
 * event without a password.
 */
export async function verifyPassword(event_id: string, password: string): Promise<{ valid: boolean; access_token?: string | null }> {
  return apiFetch("verify", { method: "POST", body: JSON.stringify({ event_id, password }) });
}

export async function getEvent(id: string, accessToken?: string) {
  const params = new URLSearchParams({ id });
  return apiFetch(`event?${params.toString()}`, {
    headers: accessToken ? { "X-Event-Access": accessToken } : {},
  });
}

export async function getAdminEvent(id: string, token: string) {
  const params = new URLSearchParams({ id, token });
  return apiFetch(`admin?${params.toString()}`);
}

/** What the server actually recorded against a guest's bring list claims. */
export type ReservedItem = { item_name: string; quantity: number };

export interface RsvpClaims {
  claim_items?: Array<{ item_id: string; quantity: number; note?: string }>;
  custom_items?: Array<{ item_name: string; quantity: number; note?: string }>;
}

/** Creates the RSVP and its bring list claims together: all of it or none. */
export async function submitRsvp(params: {
  event_id: string;
  access_token?: string;
  guest_name: string;
  adults: number;
  kids: number;
  honeypot?: string;
} & RsvpClaims): Promise<{ id: string; manage_code: string; reserved?: ReservedItem[] }> {
  return apiFetch("rsvp", { method: "POST", body: JSON.stringify(params) });
}

export async function updateEvent(event_id: string, admin_token: string, updates: Record<string, unknown>) {
  return apiFetch("admin/update", {
    method: "PUT",
    body: JSON.stringify({ event_id, admin_token, ...updates }),
  });
}

export async function adminAddBringItem(event_id: string, admin_token: string, item_name: string, quantity = 1) {
  return apiFetch("admin/add-bring-item", {
    method: "POST",
    body: JSON.stringify({ event_id, admin_token, item_name, quantity }),
  });
}

export async function adminDeleteBringItem(event_id: string, admin_token: string, item_id: string) {
  return apiFetch("admin/delete-bring-item", {
    method: "DELETE",
    body: JSON.stringify({ event_id, admin_token, item_id }),
  });
}

export async function adminDeleteRsvp(event_id: string, admin_token: string, rsvp_id: string) {
  return apiFetch("admin/delete-rsvp", {
    method: "DELETE",
    body: JSON.stringify({ event_id, admin_token, rsvp_id }),
  });
}

export async function getRsvpByManageCode(event_id: string, rsvp_id: string, manage_code: string) {
  const params = new URLSearchParams({ event_id, rsvp_id, code: manage_code });
  return apiFetch(`rsvp/manage?${params.toString()}`);
}

export async function updateRsvp(params: {
  rsvp_id: string;
  manage_code: string;
  event_id: string;
  guest_name?: string;
  adults?: number;
  kids?: number;
  unclaim_item_ids?: string[];
  cancelled?: boolean;
} & RsvpClaims): Promise<{ success: boolean; reserved?: ReservedItem[] }> {
  return apiFetch("rsvp/update", { method: "PUT", body: JSON.stringify(params) });
}

export async function adminDeleteEvent(event_id: string, admin_token: string) {
  return apiFetch("admin/delete-event", {
    method: "DELETE",
    body: JSON.stringify({ event_id, admin_token }),
  });
}

export async function uploadBanner(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${FUNCTION_URL}/upload`, { method: "POST", body: formData });
  let data: { url?: string; error?: string };
  try {
    data = await res.json() as { url?: string; error?: string };
  } catch {
    data = { error: res.statusText || "Unexpected server response" };
  }
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url!;
}
