/**
 * Naming for the optional group chat link.
 *
 * A host pastes an invite URL and nothing else; the label under it is derived
 * from the address rather than typed. "Join the WhatsApp group" tells a guest
 * what tapping does, where a bare `chat.whatsapp.com/Fx9…` does not, and it
 * saves the host a second field they would have to keep in step with the link.
 *
 * Anything unrecognised falls back to neutral wording plus the host name, so
 * an invite to something this list has never heard of still reads sensibly.
 */

import { displayHost } from "./url";

export interface GroupChatPlatform {
  /** Product name, for prose. */
  name: string;
  /** Button wording. Sentence case, verb first, per docs/DESIGN.md §3. */
  action: string;
}

/**
 * Host suffix → platform. Order matters only in that the first match wins, and
 * the entries are exact hosts or dot-suffixes, never substrings: a substring
 * test would let `chat.whatsapp.com.example.com` borrow the WhatsApp label.
 *
 * WhatsApp appears twice on purpose. `chat.whatsapp.com` is a group invite;
 * `wa.me` and `api.whatsapp.com` open a chat with one person, which is what a
 * host pastes when they want "text me" rather than "join the group". Calling
 * both of them a group would be wrong half the time.
 */
const PLATFORMS: Array<{ hosts: string[]; platform: GroupChatPlatform }> = [
  { hosts: ["chat.whatsapp.com"], platform: { name: "WhatsApp", action: "Join the WhatsApp group" } },
  { hosts: ["wa.me", "api.whatsapp.com"], platform: { name: "WhatsApp", action: "Chat on WhatsApp" } },
  { hosts: ["signal.group"], platform: { name: "Signal", action: "Join the Signal group" } },
  { hosts: ["t.me", "telegram.me"], platform: { name: "Telegram", action: "Open the Telegram chat" } },
  { hosts: ["discord.gg", "discord.com"], platform: { name: "Discord", action: "Join the Discord server" } },
  { hosts: ["m.me", "messenger.com"], platform: { name: "Messenger", action: "Chat on Messenger" } },
  { hosts: ["groupme.com"], platform: { name: "GroupMe", action: "Join the GroupMe group" } },
];

/** Wording used when the link is not one of the known platforms. */
export const GENERIC_GROUP_CHAT_ACTION = "Open the group chat";

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** The platform an invite URL points at, or null if it isn't a known one. */
export function detectGroupChatPlatform(value: string | null | undefined): GroupChatPlatform | null {
  if (!value) return null;
  const host = hostOf(value);
  if (!host) return null;
  for (const { hosts, platform } of PLATFORMS) {
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return platform;
  }
  return null;
}

/** Button wording for a link: platform-specific when known, neutral when not. */
export function groupChatAction(value: string | null | undefined): string {
  return detectGroupChatPlatform(value)?.action ?? GENERIC_GROUP_CHAT_ACTION;
}

/**
 * Short description of where a link goes, for supporting copy and for the
 * calendar entry: "the WhatsApp group", or the bare host when unrecognised.
 */
export function groupChatDescription(value: string | null | undefined): string {
  const platform = detectGroupChatPlatform(value);
  if (platform) return platform.name;
  return value ? displayHost(value) : "the group chat";
}
