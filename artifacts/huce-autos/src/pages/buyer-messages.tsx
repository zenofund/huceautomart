import { useLocation, useRoute } from "wouter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Send,
  Paperclip,
  Loader2,
  CheckCheck,
  ChevronRight,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDashboardNav } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OtherParty {
  isOnline?: boolean;
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
}

interface ConversationListItem {
  id: number;
  listingId: number | null;
  subject: string | null;
  updatedAt: string;
  other: OtherParty | null;
  lastMessage: { content: string; createdAt: string; fromMe: boolean } | null;
  unread: number;
}

interface ConversationDetail {
  id: number;
  subject: string | null;
  listingId: number | null;
  listing: { id: number; title: string | null } | null;
  other: OtherParty | null;
  updatedAt: string;
}

interface ChatMessage {
  id: number;
  senderId: number;
  content: string;
  isRead: boolean;
  createdAt: string;
  fromMe: boolean;
}

// ─── Fetch helper ────────────────────────────────────────────────────────────

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(raw: string | Date) {
  return new Date(raw).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(raw: string | Date) {
  return new Date(raw).toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function relativeFromNow(raw: string | Date) {
  const diffMs = Date.now() - new Date(raw).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyMessagesArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 180" fill="none" className={className} aria-hidden>
      <ellipse cx="110" cy="160" rx="80" ry="6" fill="#E8EFE8" />
      <path
        d="M55 50 C55 38 64 30 76 30 H132 C144 30 153 38 153 50 V82 C153 94 144 102 132 102 H92 L74 118 V102 H76 C64 102 55 94 55 82 Z"
        fill="#FFFFFF"
        stroke="#9DB39D"
        strokeWidth="1.5"
      />
      <circle cx="92" cy="62" r="2" fill="#9DB39D" />
      <circle cx="104" cy="62" r="2" fill="#9DB39D" />
      <path d="M86 75 q14 -10 28 0" stroke="#9DB39D" strokeWidth="1.5" fill="none" strokeLinecap="round" transform="translate(0 12) scale(1 -1) translate(0 -75)" />
      <path
        d="M115 70 C115 60 123 52 134 52 H172 C183 52 191 60 191 70 V92 C191 102 183 110 172 110 H160 L150 122 V110 H134 C123 110 115 102 115 92 Z"
        fill="#FFFFFF"
        stroke="#9DB39D"
        strokeWidth="1.5"
      />
      <circle cx="140" cy="82" r="2" fill="#9DB39D" />
      <circle cx="153" cy="82" r="2" fill="#9DB39D" />
      <circle cx="166" cy="82" r="2" fill="#9DB39D" />
      <path d="M40 35 h6 M43 32 v6" stroke="#C8D3C8" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M195 50 h6 M198 47 v6" stroke="#C8D3C8" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M50 110 h6 M53 107 v6" stroke="#C8D3C8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EmptyConversations() {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
      <EmptyMessagesArt className="h-32 sm:h-44 w-auto" />
      <h3 className="mt-6 text-base sm:text-lg font-bold text-gray-900">No Conversation</h3>
      <p className="mt-1 text-sm text-gray-500">There are no chats in your feed</p>
    </div>
  );
}

// ─── Conversation list row ───────────────────────────────────────────────────

function ConversationRow({
  conv,
  onOpen,
}: {
  conv: ConversationListItem;
  onOpen: () => void;
}) {
  const other = conv.other;
  const name = other?.name ?? "Unknown";
  const avatar = other?.avatarUrl ?? null;
  const last = conv.lastMessage;

  return (
    <li className="group" data-testid={`row-conversation-${conv.id}`}>
      <button
        onClick={onOpen}
        className="flex w-full items-center gap-3 sm:gap-4 px-1 sm:px-2 py-3 sm:py-4 text-left hover:bg-gray-50/70 rounded-xl transition-colors"
      >
        <div className="relative shrink-0">
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              className="h-11 w-11 sm:h-12 sm:w-12 rounded-full object-cover"
            />
          ) : (
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
              {initials(name) || "?"}
            </div>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
              other?.isOnline ? "bg-green-500" : "bg-gray-300"
            }`}
            title={other?.isOnline ? "Online" : "Offline"}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm sm:text-base font-bold text-gray-900 truncate">
              {name}
            </span>
            <span className="text-xs text-gray-400 truncate hidden sm:inline">
              {other?.role ?? ""}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs sm:text-sm text-gray-500">
            <span className="truncate">
              {last?.content ?? "No messages yet"}
            </span>
            {last && (
              <span className="text-xs text-gray-400 shrink-0">
                {formatTime(last.createdAt)}
              </span>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1 text-sm font-semibold text-primary underline underline-offset-4">
          See More
          <ChevronRight className="h-4 w-4" />
        </div>
        <ChevronRight className="sm:hidden h-5 w-5 text-gray-400" />
        {conv.unread > 0 && (
          <span
            className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
            data-testid={`badge-unread-${conv.id}`}
          >
            {conv.unread}
          </span>
        )}
      </button>
    </li>
  );
}

// ─── Chat view ───────────────────────────────────────────────────────────────

function ChatView({
  conversationId,
  onBack,
}: {
  conversationId: number;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await jsonFetch<{
        conversation: ConversationDetail;
        messages: ChatMessage[];
      }>(`/api/messages/${conversationId}`);
      setConversation(data.conversation);
      setMessages(data.messages);
    } catch (err) {
      toast({
        title: "Could not load chat",
        description: err instanceof Error ? err.message : "Try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [conversationId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // ── Live updates via SSE ───────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const es = new EventSource(`/api/messages/${conversationId}/stream`, {
      withCredentials: true,
    });
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as {
          id: number;
          senderId: number;
          content: string;
          createdAt: string;
        };
        // Messages we sent are already added via optimistic update — skip them.
        if (msg.senderId === currentUser.id) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, { ...msg, fromMe: false, isRead: false }];
        });
      } catch {
        // Ignore parse errors (e.g. heartbeat comments).
      }
    };
    return () => es.close();
  }, [conversationId, currentUser]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const data = await jsonFetch<{ message: ChatMessage }>(
        `/api/messages/${conversationId}/messages`,
        { method: "POST", body: JSON.stringify({ content: text }) },
      );
      setMessages((prev) => [...prev, data.message]);
      setDraft("");
    } catch (err) {
      toast({
        title: "Message not sent",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  // Group messages by calendar date for the date dividers.
  const grouped = useMemo(() => {
    const groups: { date: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const key = formatDate(m.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.date === key) last.items.push(m);
      else groups.push({ date: key, items: [m] });
    }
    return groups;
  }, [messages]);

  const other = conversation?.other;
  const headerName = other?.name ?? "Conversation";
  const headerSub = conversation?.subject?.trim()
    ? conversation.subject
    : conversation?.listing?.title
      ? conversation.listing.title
      : other?.role
        ? other.role
        : null;

  return (
    <div className="flex h-[calc(100vh-9rem)] sm:h-[calc(100vh-11rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
          data-testid="button-chat-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex-1 text-center min-w-0">
          <div className="text-sm sm:text-base font-bold text-gray-900 truncate">
            {headerName}
            {headerSub ? (
              <span className="font-normal text-gray-500"> ({headerSub})</span>
            ) : null}
          </div>
          <div className="text-xs text-gray-400">
            {conversation
              ? `last seen ${relativeFromNow(conversation.updatedAt)}`
              : ""}
          </div>
        </div>
        <span className="w-10" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 sm:px-2 py-4 sm:py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">
            No messages yet — start the conversation below.
          </div>
        ) : (
          grouped.map((g) => (
            <div key={g.date} className="mb-4">
              <div className="text-center text-xs text-gray-400 my-3">{g.date}</div>
              <div className="space-y-2">
                {g.items.map((m) => (
                  <ChatBubble
                    key={m.id}
                    message={m}
                    senderName={other?.name ?? ""}
                    senderRole={other?.role ?? ""}
                    senderAvatar={other?.avatarUrl ?? null}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-100 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 sm:px-4 py-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Start typing..."
            className="flex-1 bg-transparent text-sm placeholder:text-gray-400 focus:outline-none"
            data-testid="input-chat-draft"
          />
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim() || sending}
            className="text-primary hover:text-primary/80 disabled:text-gray-300 p-1"
            aria-label="Send"
            data-testid="button-chat-send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  senderName,
  senderRole,
  senderAvatar,
}: {
  message: ChatMessage;
  senderName: string;
  senderRole: string;
  senderAvatar: string | null;
}) {
  if (message.fromMe) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] sm:max-w-md rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 sm:px-4 py-2">
          <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
          <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-primary-foreground/80">
            <span>{formatTime(message.createdAt)}</span>
            <CheckCheck className="h-3 w-3" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      {senderAvatar ? (
        <img src={senderAvatar} alt={senderName} className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-semibold text-gray-600">
          {initials(senderName) || "?"}
        </div>
      )}
      <div className="max-w-[80%] sm:max-w-md rounded-2xl rounded-bl-sm bg-gray-100 px-3 sm:px-4 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-bold text-gray-900">{senderName}</span>
          {senderRole && (
            <span className="text-[11px] text-gray-500">{senderRole}</span>
          )}
        </div>
        <div className="mt-1 text-sm whitespace-pre-wrap break-words text-gray-800">
          {message.content}
        </div>
        <div className="mt-1 text-[11px] text-gray-400 text-right">
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BuyerMessages() {
  const { user: authUser, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { navItems, basePath } = useDashboardNav();
  const [, buyerParams] = useRoute<{ id: string }>("/dashboard/messages/:id");
  const [, sellerParams] = useRoute<{ id: string }>("/seller/messages/:id");
  const { toast } = useToast();

  const params = buyerParams ?? sellerParams;
  const conversationId = params?.id ? Number(params.id) : null;
  const messagesPath = `${basePath}/messages`;

  const user: DashboardUser = {
    name: authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : "Buyer",
    email: authUser?.email ?? "",
    verified: authUser?.emailVerified ?? false,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await jsonFetch<{ conversations: ConversationListItem[] }>(
        "/api/messages",
      );
      setConversations(data.conversations);
    } catch (err) {
      toast({
        title: "Could not load messages",
        description: err instanceof Error ? err.message : "Try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!authUser) return;
    void loadList();
  }, [authUser, loadList]);

  // Reload list when returning from chat view (so unread counts refresh).
  useEffect(() => {
    if (conversationId === null && authUser) void loadList();
  }, [conversationId, authUser, loadList]);

  // Poll conversation list every 10 s — keeps unread counts and previews fresh.
  useEffect(() => {
    if (!authUser) return;
    const timer = setInterval(() => void loadList(), 10_000);
    return () => clearInterval(timer);
  }, [authUser, loadList]);

  return (
    <DashboardLayout user={user} navItems={navItems} title="Messages" onLogout={handleLogout}>
      {conversationId !== null ? (
        <ChatView
          conversationId={conversationId}
          onBack={() => setLocation(messagesPath)}
        />
      ) : (
        <>
          <div className="mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">Messages</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : conversations.length === 0 ? (
            <EmptyConversations />
          ) : (
            <ul className="divide-y divide-gray-100">
              {conversations.map((c) => (
                <ConversationRow
                  key={c.id}
                  conv={c}
                  onOpen={() => setLocation(`${messagesPath}/${c.id}`)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
