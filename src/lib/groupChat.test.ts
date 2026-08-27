import { describe, it, expect } from "vitest";
import {
  GENERIC_GROUP_CHAT_ACTION,
  detectGroupChatPlatform,
  groupChatAction,
  groupChatDescription,
} from "./groupChat";

describe("detectGroupChatPlatform", () => {
  it("names a WhatsApp group invite", () => {
    expect(detectGroupChatPlatform("https://chat.whatsapp.com/Fx9abcDEF")?.action).toBe(
      "Join the WhatsApp group"
    );
  });

  it("distinguishes a one-to-one WhatsApp link from a group invite", () => {
    expect(detectGroupChatPlatform("https://wa.me/61400000000")?.action).toBe("Chat on WhatsApp");
  });

  it("recognises the other common platforms", () => {
    expect(detectGroupChatPlatform("https://signal.group/#abc")?.name).toBe("Signal");
    expect(detectGroupChatPlatform("https://t.me/+abc")?.name).toBe("Telegram");
    expect(detectGroupChatPlatform("https://discord.gg/abc")?.name).toBe("Discord");
    expect(detectGroupChatPlatform("https://m.me/someone")?.name).toBe("Messenger");
  });

  it("ignores www and casing", () => {
    expect(detectGroupChatPlatform("https://WWW.Discord.com/invite/abc")?.name).toBe("Discord");
  });

  it("matches subdomains of a known host", () => {
    expect(detectGroupChatPlatform("https://web.groupme.com/join_group/1")?.name).toBe("GroupMe");
  });

  it("does not match a lookalike host that merely contains a known one", () => {
    expect(detectGroupChatPlatform("https://chat.whatsapp.com.example.com/x")).toBeNull();
    expect(detectGroupChatPlatform("https://notdiscord.gg/abc")).toBeNull();
  });

  it("returns null for an unknown host or unparseable value", () => {
    expect(detectGroupChatPlatform("https://example.com/chat")).toBeNull();
    expect(detectGroupChatPlatform("not a url")).toBeNull();
    expect(detectGroupChatPlatform("")).toBeNull();
    expect(detectGroupChatPlatform(null)).toBeNull();
  });
});

describe("groupChatAction", () => {
  it("falls back to neutral wording", () => {
    expect(groupChatAction("https://example.com/chat")).toBe(GENERIC_GROUP_CHAT_ACTION);
    expect(groupChatAction(null)).toBe(GENERIC_GROUP_CHAT_ACTION);
  });
});

describe("groupChatDescription", () => {
  it("uses the platform name when known", () => {
    expect(groupChatDescription("https://chat.whatsapp.com/abc")).toBe("WhatsApp");
  });

  it("uses the bare host when not", () => {
    expect(groupChatDescription("https://www.example.com/chat")).toBe("example.com");
  });

  it("has wording for no link at all", () => {
    expect(groupChatDescription(null)).toBe("the group chat");
  });
});
