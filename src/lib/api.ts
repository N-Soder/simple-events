const FUNCTION_URL = "/api";

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${FUNCTION_URL}/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API error");
  return data;
}

export async function createEvent(params: {
  name: string;
  description?: string;
  event_date: string;
  event_time?: string;
  location?: string;
  banner_url?: string;
  password?: string;
  guest_visibility: "full" | "count_only" | "hidden";
  bring_list_enabled?: boolean;
  bring_items: Array<{ name: string; quantity: number }>;
  bring_list_message?: string;
}) {
  return apiFetch("create", { method: "POST", body: JSON.stringify(params) });
}

export async function verifyPassword(event_id: string, password: string) {
  return apiFetch("verify", { method: "POST", body: JSON.stringify({ event_id, password }) });
}

export async function getEvent(id: string, password?: string) {
  const params = new URLSearchParams({ id });
  if (password) params.set("password", password);
  return apiFetch(`event?${params.toString()}`);
}

export async function getAdminEvent(id: string, token: string) {
  return apiFetch(`admin?id=${id}&token=${token}`);
}

export async function submitRsvp(params: {
  event_id: string;
  password?: string;
  guest_name: string;
  adults: number;
  kids: number;
  honeypot?: string;
}) {
  return apiFetch("rsvp", { method: "POST", body: JSON.stringify(params) });
}

export async function claimItem(event_id: string, password: string | undefined, item_id: string, claimed_by: string) {
  return apiFetch("claim-item", {
    method: "POST",
    body: JSON.stringify({ event_id, password, item_id, claimed_by }),
  });
}

export async function addCustomItem(event_id: string, password: string | undefined, item_name: string, claimed_by?: string) {
  return apiFetch("add-item", {
    method: "POST",
    body: JSON.stringify({ event_id, password, item_name, claimed_by }),
  });
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
  claim_item_ids?: string[];
  custom_items?: string[];
  cancelled?: boolean;
}) {
  return apiFetch("rsvp/update", { method: "PUT", body: JSON.stringify(params) });
}

export async function uploadBanner(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${FUNCTION_URL}/upload`, { method: "POST", body: formData });
  const data = await res.json() as { url?: string; error?: string };
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url!;
}
