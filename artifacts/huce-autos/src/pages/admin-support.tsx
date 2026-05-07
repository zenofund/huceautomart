import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  ArrowLeft,
  Paperclip,
  Send,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  CheckCheck,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminLocalTabs } from "@/components/admin-local-tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── API Types ────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "urgent";

interface TicketRow {
  id: number;
  subject: string;
  category: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  customerFirstName: string;
  customerLastName: string;
  assignedRepFirstName: string | null;
  assignedRepLastName: string | null;
  lastResponseAt: string | null;
}

interface TicketDetail {
  id: number;
  subject: string;
  category: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  userId: number;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
}

interface TicketMessage {
  id: number;
  ticketId: number;
  senderId: number;
  content: string;
  isStaffReply: boolean;
  createdAt: string;
}

interface ListPayload {
  items: TicketRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface DetailPayload {
  ticket: TicketDetail;
  messages: TicketMessage[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

type TabKey = "all" | "open" | "closed";

const STATUS_TONE: Record<TicketStatus, { dot: string; text: string; label: string }> = {
  open: { dot: "bg-indigo-500", text: "text-indigo-700", label: "Open" },
  in_progress: { dot: "bg-green-500", text: "text-green-700", label: "Active" },
  resolved: { dot: "bg-amber-400", text: "text-amber-700", label: "Pending" },
  closed: { dot: "bg-gray-400", text: "text-gray-500", label: "Closed" },
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_TONE: Record<TicketPriority, string> = {
  low: "text-gray-500",
  medium: "text-amber-600",
  high: "text-red-600",
  urgent: "text-red-700 font-semibold",
};

const PAGE_SIZE = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(raw: string | Date | null) {
  if (!raw) return "—";
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
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function formatChatTime(raw: string | Date) {
  return new Date(raw).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
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

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between border-t border-gray-100 pt-5 mt-2">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>
      <div className="flex items-center gap-1">
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm select-none">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className={cn(
                "h-8 w-8 rounded-lg text-sm font-medium",
                p === page
                  ? "bg-primary text-primary-foreground"
                  : "text-gray-600 hover:bg-gray-100",
              )}
            >
              {p}
            </button>
          ),
        )}
      </div>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Ticket Table ─────────────────────────────────────────────────────────────

function TicketTable({
  rows,
  loading,
  onOpen,
}: {
  rows: TicketRow[];
  loading: boolean;
  onOpen: (r: TicketRow) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-gray-500">No support tickets found.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Received Date</th>
            <th className="px-4 py-3">Customer Name</th>
            <th className="px-4 py-3">Issue Type</th>
            <th className="px-4 py-3">Priority</th>
            <th className="px-4 py-3">Assigned Customer Rep</th>
            <th className="px-4 py-3">Created Date</th>
            <th className="px-4 py-3">Last Response Date</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tone = STATUS_TONE[row.status];
            const repName =
              row.assignedRepFirstName && row.assignedRepLastName
                ? `${row.assignedRepFirstName} ${row.assignedRepLastName}`
                : "—";
            return (
              <tr
                key={row.id}
                onClick={() => onOpen(row)}
                className="border-t border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-4 font-mono text-gray-700 font-semibold">{row.id}</td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="px-4 py-4 font-semibold text-gray-800 whitespace-nowrap">
                  {row.customerFirstName} {row.customerLastName}
                </td>
                <td className="px-4 py-4 text-gray-700">
                  {row.category ?? row.subject}
                </td>
                <td className={cn("px-4 py-4 font-semibold", PRIORITY_TONE[row.priority])}>
                  {PRIORITY_LABEL[row.priority]}
                </td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{repName}</td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                  {formatDateTime(row.lastResponseAt)}
                </td>
                <td className="px-4 py-4">
                  <div className={cn("inline-flex items-center gap-2", tone.text)}>
                    <span className={cn("h-2 w-2 rounded-full shrink-0", tone.dot)} />
                    <span className="font-medium">{tone.label}</span>
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

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView({
  ticket,
  messages,
  loadingMessages,
  sending,
  closing,
  onBack,
  onSend,
  onClose,
}: {
  ticket: TicketDetail;
  messages: TicketMessage[];
  loadingMessages: boolean;
  sending: boolean;
  closing: boolean;
  onBack: () => void;
  onSend: (text: string) => Promise<void>;
  onClose: () => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    await onSend(text);
  };

  const isClosed = ticket.status === "closed" || ticket.status === "resolved";
  const dateLabel = formatChatDate(ticket.createdAt);
  const customerName = `${ticket.customerFirstName} ${ticket.customerLastName}`;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="text-center">
          <div className="text-sm font-bold text-gray-900">Team Huce</div>
          <div className="text-xs text-gray-500">last seen 45 minutes ago</div>
        </div>

        <button
          onClick={onClose}
          disabled={closing || isClosed}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {closing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isClosed ? "Ticket Closed" : "Close Ticket"}
        </button>
      </div>

      {/* Date label */}
      <div className="flex justify-center mb-2">
        <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
          {dateLabel}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2 space-y-3 px-1">
        {loadingMessages ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">
            No messages yet. Start the conversation.
          </div>
        ) : (
          messages.map((m) => {
            const isAdminMsg = m.isStaffReply;
            return (
              <div
                key={m.id}
                className={cn("flex items-end gap-2", isAdminMsg ? "justify-end" : "justify-start")}
              >
                {!isAdminMsg && (
                  <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
                    <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600">
                      {initials(ticket.customerFirstName, ticket.customerLastName)}
                    </div>
                  </div>
                )}
                <div className={cn("max-w-[60%]", !isAdminMsg && "")}>
                  {!isAdminMsg && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-700">{customerName}</span>
                      <span className="text-xs text-gray-400">Customer Support</span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm",
                      isAdminMsg
                        ? "bg-[#1a4731] text-white rounded-br-md"
                        : "bg-gray-100 text-gray-900 rounded-bl-md",
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    <div
                      className={cn(
                        "mt-1 flex items-center justify-end gap-1 text-[10px]",
                        isAdminMsg ? "text-white/60" : "text-gray-400",
                      )}
                    >
                      <span>{formatChatTime(m.createdAt)}</span>
                      {isAdminMsg && <CheckCheck className="h-3.5 w-3.5" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 pt-3 mt-2 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={isClosed ? "Ticket is closed" : "Start typing..."}
          disabled={isClosed || sending}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none py-2 max-h-32 disabled:opacity-50"
        />
        <button className="text-gray-400 hover:text-gray-600 p-2" aria-label="Attach file">
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim() || sending || isClosed}
          className="text-primary hover:text-primary/80 disabled:text-gray-300 p-2 transition-colors"
          aria-label="Send message"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AdminSupportPage() {
  const { toast } = useToast();

  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [listData, setListData] = useState<ListPayload | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  const [activeTicket, setActiveTicket] = useState<TicketDetail | null>(null);
  const [activeMessages, setActiveMessages] = useState<TicketMessage[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const statusParam = tab === "all" ? "all" : tab === "open" ? "open" : "closed";

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({
        status: statusParam,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const data = await apiFetch<ListPayload>(`/admin/support/tickets?${params}`);
      setListData(data);
    } catch (err) {
      toast({
        title: "Failed to load tickets",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setLoadingList(false);
    }
  }, [statusParam, page, debouncedSearch, toast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openTicket = async (row: TicketRow) => {
    setLoadingDetail(true);
    setActiveTicket(null);
    setActiveMessages([]);
    try {
      const data = await apiFetch<DetailPayload>(`/admin/support/tickets/${row.id}`);
      setActiveTicket(data.ticket);
      setActiveMessages(data.messages);
    } catch (err) {
      toast({
        title: "Failed to open ticket",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  const sendReply = async (text: string) => {
    if (!activeTicket) return;
    setSending(true);
    try {
      const data = await apiFetch<{ message: TicketMessage }>(
        `/admin/support/tickets/${activeTicket.id}/messages`,
        { method: "POST", body: JSON.stringify({ content: text }) },
      );
      setActiveMessages((prev) => [...prev, data.message]);
      setActiveTicket((t) =>
        t ? { ...t, status: t.status === "open" ? "in_progress" : t.status } : t,
      );
    } catch (err) {
      toast({
        title: "Failed to send reply",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const closeTicket = async () => {
    if (!activeTicket) return;
    setClosing(true);
    try {
      await apiFetch(`/admin/support/tickets/${activeTicket.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "closed" }),
      });
      setActiveTicket((t) => (t ? { ...t, status: "closed" } : t));
      toast({ title: "Ticket closed", description: "The ticket has been marked as closed." });
    } catch (err) {
      toast({
        title: "Failed to close ticket",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setClosing(false);
    }
  };

  const TAB_LABELS: { key: TabKey; label: string }[] = [
    { key: "all", label: "All Tickets" },
    { key: "open", label: "Open Ticket" },
    { key: "closed", label: "Closed Ticket" },
  ];

  const FILTER_OPTIONS: { label: string; status: TicketStatus; dot: string }[] = [
    { label: "Active", status: "in_progress", dot: "bg-green-500" },
    { label: "Pending", status: "resolved", dot: "bg-amber-400" },
    { label: "Open", status: "open", dot: "bg-indigo-500" },
    { label: "Closed", status: "closed", dot: "bg-gray-400" },
  ];

  return (
    <AdminLayout>
      <div className="container mx-auto px-3 sm:px-4 py-6 max-w-[1400px]">
        {!activeTicket && (
          <AdminLocalTabs
            tabs={TAB_LABELS.map(({ key, label }) => ({ key, label }))}
            activeKey={tab}
            onChange={(key) => {
              setTab(key as TabKey);
              setPage(1);
            }}
          />
        )}

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {activeTicket ? (
            <div className="p-4 sm:p-6">
              <ChatView
                ticket={activeTicket}
                messages={activeMessages}
                loadingMessages={loadingDetail}
                sending={sending}
                closing={closing}
                onBack={() => {
                  setActiveTicket(null);
                  setActiveMessages([]);
                  void loadList();
                }}
                onSend={sendReply}
                onClose={closeTicket}
              />
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 sm:p-5 border-b border-gray-100">
                <h1 className="text-lg font-black text-gray-900 shrink-0">Customer Support</h1>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search here..."
                      className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="relative flex-shrink-0" ref={filterRef}>
                    <button
                      onClick={() => setFilterOpen((v) => !v)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Filter className="h-4 w-4" />
                      Filter
                    </button>
                    {filterOpen && (
                      <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-gray-200 bg-white shadow-lg z-20 py-2">
                        {FILTER_OPTIONS.map((opt) => (
                          <button
                            key={opt.status}
                            onClick={() => {
                              const newTab =
                                opt.status === "closed" || opt.status === "resolved"
                                  ? "closed"
                                  : "open";
                              setTab(newTab);
                              setFilterOpen(false);
                              setPage(1);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <span className={cn("h-2.5 w-2.5 rounded-full", opt.dot)} />
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Table Area */}
              <div className="p-0 sm:p-2">
                <TicketTable
                  rows={listData?.items ?? []}
                  loading={loadingList}
                  onOpen={openTicket}
                />
              </div>

              {/* Pagination */}
              {listData && (
                <div className="p-4 sm:p-6 border-t border-gray-100">
                  <Pagination
                    page={page}
                    total={listData.total}
                    pageSize={PAGE_SIZE}
                    onChange={(p) => setPage(p)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export default AdminSupportPage;
