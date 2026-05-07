import { useLocation } from "wouter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Clock,
  ArrowLeft,
  Paperclip,
  Send,
  Inbox,
  Loader2,
  CheckCheck,
  MessageSquare,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDashboardNav } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

// ─── Types matching the API ──────────────────────────────────────────────────

type ApiTicketStatus = "open" | "in_progress" | "resolved" | "closed";
type ApiTicketPriority = "low" | "medium" | "high" | "urgent";

interface ApiTicket {
  id: number;
  subject: string;
  category: string | null;
  status: ApiTicketStatus;
  priority: ApiTicketPriority;
  assignedTo: number | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiMessage {
  id: number;
  ticketId: number;
  senderId: number;
  content: string;
  isStaffReply: boolean;
  createdAt: string;
}

interface TicketsPayload {
  tickets: ApiTicket[];
  counts: { all: number; open: number; closed: number };
}

interface TicketDetailPayload {
  ticket: ApiTicket;
  messages: ApiMessage[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_REPLIES = [
  "Car Dispute",
  "Payment Issues",
  "Technical Issue",
  "Inspection Issue",
] as const;

type TabKey = "all" | "open" | "closed";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(raw: string | Date) {
  const d = raw instanceof Date ? raw : new Date(raw);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(" ", "")
    .toLowerCase();
  return `${date}, ${time}`;
}

function formatChatDate(raw: string | Date) {
  const d = raw instanceof Date ? raw : new Date(raw);
  return d.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function formatChatTime(raw: string | Date) {
  const d = raw instanceof Date ? raw : new Date(raw);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatTicketId(id: number) {
  return String(id).padStart(2, "0");
}

const STATUS_TONE: Record<ApiTicketStatus, { dot: string; text: string; label: string }> = {
  open: { dot: "bg-indigo-500", text: "text-indigo-700", label: "Open" },
  in_progress: { dot: "bg-amber-400", text: "text-amber-700", label: "Pending" },
  resolved: { dot: "bg-green-500", text: "text-green-700", label: "Resolved" },
  closed: { dot: "bg-gray-400", text: "text-gray-600", label: "Closed" },
};

const PRIORITY_LABEL: Record<ApiTicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_TONE: Record<ApiTicketPriority, string> = {
  low: "text-gray-600",
  medium: "text-amber-600",
  high: "text-red-600",
  urgent: "text-red-700",
};

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: string }).error ?? "Request failed";
    throw new Error(err);
  }
  return data as T;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyTickets({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Inbox className="h-9 w-9" />
      </div>
      <h3 className="mt-5 text-base font-bold text-gray-900">No tickets yet</h3>
      <p className="mt-1 text-sm text-gray-500 max-w-sm">
        When you start a conversation with our team, your chats and tickets will show up here.
      </p>
      <button
        onClick={onStart}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        data-testid="button-start-empty"
      >
        <MessageSquare className="h-4 w-4" />
        Send us a message
      </button>
    </div>
  );
}

function StartConversationCard({
  onStart,
  disabled,
}: {
  onStart: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-900 whitespace-nowrap">
            Start a conversation
          </div>
          <div className="mt-2 flex -space-x-2">
            {[
              "https://i.pravatar.cc/48?img=12",
              "https://i.pravatar.cc/48?img=5",
              "https://i.pravatar.cc/48?img=32",
            ].map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                className="h-9 w-9 rounded-full ring-2 ring-white object-cover"
              />
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
            Our reply time
          </div>
          <div className="mt-1 flex items-center justify-end gap-1.5 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5" />
            Under 5 minutes
          </div>
        </div>
      </div>
      <button
        onClick={onStart}
        disabled={disabled}
        className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
        data-testid="button-send-message"
      >
        {disabled && <Loader2 className="h-4 w-4 animate-spin" />}
        Send us a message
      </button>
    </div>
  );
}

function TicketsTable({
  tickets,
  onOpen,
}: {
  tickets: ApiTicket[];
  onOpen: (t: ApiTicket) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="px-3 py-3 font-semibold">Ticket ID</th>
            <th className="px-3 py-3 font-semibold">Received Date</th>
            <th className="px-3 py-3 font-semibold">Subject</th>
            <th className="px-3 py-3 font-semibold">Priority</th>
            <th className="px-3 py-3 font-semibold">Last Response</th>
            <th className="px-3 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const status = STATUS_TONE[t.status];
            return (
              <tr
                key={t.id}
                onClick={() => onOpen(t)}
                className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                data-testid={`row-ticket-${t.id}`}
              >
                <td className="px-3 py-4 font-mono text-gray-700">{formatTicketId(t.id)}</td>
                <td className="px-3 py-4 text-gray-600">{formatDateTime(t.createdAt)}</td>
                <td className="px-3 py-4 text-gray-700">{t.category ?? t.subject}</td>
                <td className={cn("px-3 py-4 font-medium", PRIORITY_TONE[t.priority])}>
                  {PRIORITY_LABEL[t.priority]}
                </td>
                <td className="px-3 py-4 text-gray-600">{formatDateTime(t.updatedAt)}</td>
                <td className="px-3 py-4">
                  <div className={cn("inline-flex items-center gap-2", status.text)}>
                    <span className={cn("h-2 w-2 rounded-full", status.dot)} />
                    <span className="text-sm font-medium">{status.label}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TicketsCards({
  tickets,
  onOpen,
}: {
  tickets: ApiTicket[];
  onOpen: (t: ApiTicket) => void;
}) {
  return (
    <ul className="divide-y divide-gray-100">
      {tickets.map((t) => {
        const status = STATUS_TONE[t.status];
        return (
          <li
            key={t.id}
            onClick={() => onOpen(t)}
            className="py-3 cursor-pointer active:bg-gray-50"
            data-testid={`card-ticket-${t.id}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-mono">{formatTicketId(t.id)}</span>
                  <span>·</span>
                  <span>{formatDateTime(t.createdAt)}</span>
                </div>
                <div className="mt-1 text-sm font-semibold text-gray-900 truncate">
                  {t.category ?? t.subject}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 truncate">
                  Last response {formatDateTime(t.updatedAt)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={cn("text-xs font-medium", PRIORITY_TONE[t.priority])}>
                  {PRIORITY_LABEL[t.priority]}
                </span>
                <div className={cn("inline-flex items-center gap-1.5", status.text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                  <span className="text-xs font-medium">{status.label}</span>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ChatView({
  ticket,
  messages,
  isLoading,
  sending,
  currentUserId,
  onBack,
  onSend,
}: {
  ticket: ApiTicket;
  messages: ApiMessage[];
  isLoading: boolean;
  sending: boolean;
  currentUserId: number | undefined;
  onBack: () => void;
  onSend: (text: string) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const handleSend = async (text?: string) => {
    const payload = (text ?? input).trim();
    if (!payload || sending) return;
    await onSend(payload);
    if (!text) setInput("");
  };

  const dateLabel = formatChatDate(ticket.createdAt);

  return (
    <div className="flex flex-col min-h-[70vh] sm:min-h-[72vh]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          data-testid="button-back-chat"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex-1 text-center">
          <div className="text-sm sm:text-base font-bold text-gray-900">Team Huce</div>
          <div className="text-xs text-gray-500">last seen 45 minutes ago</div>
        </div>
        <div className="w-14" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        <div className="flex justify-center">
          <span className="text-xs text-gray-500">{dateLabel}</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length > 0 ? (
          <ul className="mt-4 space-y-2.5">
            {messages.map((m) => {
              const mine = m.senderId === currentUserId && !m.isStaffReply;
              // A message is considered "read" if any staff reply exists
              // after it — mirroring WhatsApp's two-tick semantics.
              const read =
                mine &&
                messages.some(
                  (x) =>
                    x.isStaffReply &&
                    new Date(x.createdAt).getTime() > new Date(m.createdAt).getTime(),
                );
              return (
                <li
                  key={m.id}
                  className={cn("flex", mine ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm",
                      mine
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-gray-100 text-gray-900 rounded-bl-md",
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    <div
                      className={cn(
                        "mt-1 flex items-center justify-end gap-1 text-[10px]",
                        mine ? "text-primary-foreground/70" : "text-gray-500",
                      )}
                    >
                      <span>{formatChatTime(m.createdAt)}</span>
                      {mine && (
                        <CheckCheck
                          className={cn(
                            "h-3.5 w-3.5",
                            read ? "text-green-400" : "text-primary-foreground/60",
                          )}
                          aria-label={read ? "Read" : "Delivered"}
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {/* Quick replies shown only when conversation is empty */}
      {!isLoading && messages.length === 0 && (
        <div className="pb-4">
          <div className="text-center text-sm text-gray-500 mb-3">Start a conversation....</div>
          <div className="flex flex-wrap justify-center gap-2">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                onClick={() => handleSend(q)}
                disabled={sending}
                className="rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                data-testid={`chip-quick-${q.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 pt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Start typing..."
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none py-2 max-h-32"
          data-testid="input-chat"
        />
        <button
          className="text-gray-500 hover:text-gray-700 p-2"
          aria-label="Attach file"
          data-testid="button-attach"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || sending}
          className="text-primary hover:text-primary/80 disabled:text-gray-300 p-2"
          aria-label="Send message"
          data-testid="button-send"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyerSupport() {
  const { user: authUser, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { navItems } = useDashboardNav();
  const { toast } = useToast();

  const user: DashboardUser = {
    name: authUser
      ? `${authUser.firstName} ${authUser.lastName}`.trim()
      : "Victor",
    email: authUser?.email ?? "victor@huceautos.com",
    verified: authUser?.emailVerified ?? true,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };
  const firstName = user.name.split(" ")[0] || "there";

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  const [tickets, setTickets] = useState<ApiTicket[]>([]);
  const [counts, setCounts] = useState({ all: 0, open: 0, closed: 0 });
  const [loadingList, setLoadingList] = useState(false);
  const [creating, setCreating] = useState(false);

  const [activeTicket, setActiveTicket] = useState<ApiTicket | null>(null);
  const [activeMessages, setActiveMessages] = useState<ApiMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);

  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");

  const loadTickets = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await jsonFetch<TicketsPayload>("/api/support/tickets");
      setTickets(data.tickets);
      setCounts(data.counts);
    } catch (err) {
      toast({
        title: "Could not load tickets",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setLoadingList(false);
    }
  }, [toast]);

  const loadTicket = useCallback(
    async (id: number) => {
      setLoadingChat(true);
      try {
        const data = await jsonFetch<TicketDetailPayload>(`/api/support/tickets/${id}`);
        setActiveTicket(data.ticket);
        setActiveMessages(data.messages);
      } catch (err) {
        toast({
          title: "Could not open ticket",
          description: err instanceof Error ? err.message : "Something went wrong.",
          variant: "destructive",
        });
        setActiveTicket(null);
      } finally {
        setLoadingChat(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (authUser) void loadTickets();
  }, [authUser, loadTickets]);

  const startNewConversation = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const data = await jsonFetch<{ ticket: ApiTicket }>("/api/support/tickets", {
        method: "POST",
        body: JSON.stringify({ subject: "New Conversation", priority: "medium" }),
      });
      setActiveTicket(data.ticket);
      setActiveMessages([]);
      setTickets((prev) => [data.ticket, ...prev]);
      setCounts((prev) => ({ ...prev, all: prev.all + 1, open: prev.open + 1 }));
    } catch (err) {
      toast({
        title: "Could not start conversation",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!activeTicket) return;
    const isQuick = (QUICK_REPLIES as readonly string[]).includes(text);
    setSending(true);
    try {
      const data = await jsonFetch<{ message: ApiMessage }>(
        `/api/support/tickets/${activeTicket.id}/messages`,
        { method: "POST", body: JSON.stringify({ content: text }) },
      );
      setActiveMessages((prev) => [...prev, data.message]);

      // Bump the ticket in the list & update category if this was the first quick reply
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== activeTicket.id) return t;
          const updated: ApiTicket = {
            ...t,
            updatedAt: data.message.createdAt,
            category:
              !t.category && isQuick && activeMessages.length === 0 ? text : t.category,
          };
          if (t.id === activeTicket.id) {
            setActiveTicket(updated);
          }
          return updated;
        }),
      );
    } catch (err) {
      toast({
        title: "Message failed",
        description: err instanceof Error ? err.message : "Could not send your message.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const filteredTickets = useMemo(() => {
    let list = tickets;
    if (tab === "open")
      list = list.filter((t) => t.status !== "resolved" && t.status !== "closed");
    if (tab === "closed")
      list = list.filter((t) => t.status === "resolved" || t.status === "closed");
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const label = `${formatTicketId(t.id)} ${t.subject} ${t.category ?? ""} ${
          PRIORITY_LABEL[t.priority]
        }`.toLowerCase();
        return label.includes(q);
      });
    }
    return list;
  }, [tickets, tab, query]);

  const renderContent = () => {
    if (activeTicket) {
      return (
        <ChatView
          ticket={activeTicket}
          messages={activeMessages}
          isLoading={loadingChat}
          sending={sending}
          currentUserId={authUser?.id}
          onBack={() => {
            setActiveTicket(null);
            setActiveMessages([]);
            void loadTickets();
          }}
          onSend={sendMessage}
        />
      );
    }

    return (
      <>
        {/* Hero row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900">
              Hi {firstName}!
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Ask us anything or share your review with us!
            </p>
          </div>
          <StartConversationCard onStart={startNewConversation} disabled={creating} />
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-5">
          <div className="flex items-center gap-6">
            {(
              [
                { key: "all", label: "All Ticket" },
                { key: "open", label: "Open Ticket" },
                { key: "closed", label: "Closed Ticket" },
              ] as const
            ).map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "relative whitespace-nowrap py-3 text-sm font-medium transition-colors",
                    active ? "text-primary" : "text-gray-500 hover:text-gray-900",
                  )}
                  data-testid={`tab-${t.key}`}
                >
                  {t.label}
                  {active && (
                    <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : tickets.length === 0 ? (
          <EmptyTickets onStart={startNewConversation} />
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-base sm:text-lg font-bold text-gray-900">
                {tab === "all"
                  ? `All Tickets(${counts.all})`
                  : tab === "open"
                  ? `Open Tickets(${counts.open})`
                  : `Closed Tickets(${counts.closed})`}
              </h2>
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search here..."
                  className="w-full rounded-full border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  data-testid="input-search-tickets"
                />
              </div>
            </div>

            {filteredTickets.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">
                No tickets match your search.
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <TicketsTable
                    tickets={filteredTickets}
                    onOpen={(t) => {
                      setActiveTicket(t);
                      setActiveMessages([]);
                      void loadTicket(t.id);
                    }}
                  />
                </div>
                <div className="md:hidden">
                  <TicketsCards
                    tickets={filteredTickets}
                    onOpen={(t) => {
                      setActiveTicket(t);
                      setActiveMessages([]);
                      void loadTicket(t.id);
                    }}
                  />
                </div>
              </>
            )}
          </>
        )}
      </>
    );
  };

  return (
    <DashboardLayout
      user={user}
      navItems={navItems}
      title="Customer Support"
      onLogout={handleLogout}
    >
      <div className="mb-4 sm:mb-6">
        <h2 className="text-base sm:text-lg font-bold text-gray-900">Customer Support</h2>
      </div>
      {renderContent()}
    </DashboardLayout>
  );
}
