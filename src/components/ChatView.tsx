import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderKanban,
  Hash,
  Info,
  MessageSquare,
  MessagesSquare,
  Paperclip,
  PlusCircle,
  RefreshCw,
  Search,
  Send,
  Shield,
  Tag,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, tokenStore } from "../lib/api";
import type { ChatMessage, ConversationItem, Priority, Status, TaskReference } from "../types";

interface ChatViewProps {
  initialProjectId?: number | null;
  onNavigateToTasks?: (projectId?: number) => void;
  onNavigateToProjects?: () => void;
}

interface ProjectChatMember {
  id: number;
  name: string;
  email: string;
  role_name?: string;
  is_owner?: boolean;
}

export const ChatView: React.FC<ChatViewProps> = ({
  initialProjectId,
  onNavigateToTasks,
  onNavigateToProjects,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const token = tokenStore.get();

  // State
  const [conversations, setConversations] = useState<{
    project_rooms: ConversationItem[];
    private_conversations: ConversationItem[];
  }>({ project_rooms: [], private_conversations: [] });
  const [filterType, setFilterType] = useState<"all" | "project" | "private">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConvo, setSelectedConvo] = useState<ConversationItem | null>(null);

  // Active Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [inputContent, setInputContent] = useState("");
  const [sending, setSending] = useState(false);

  // Project details & members for project chat
  const [projectMembers, setProjectMembers] = useState<ProjectChatMember[]>([]);
  const [showMembersDrawer, setShowMembersDrawer] = useState(false);

  // Task reference selection
  const [availableTasks, setAvailableTasks] = useState<TaskReference[]>([]);
  const [selectedTaskRef, setSelectedTaskRef] = useState<TaskReference | null>(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Fetch conversations list
  const loadConversations = async (silent = false) => {
    if (!silent) setLoadingConversations(true);
    try {
      const data = await api<{
        project_rooms: ConversationItem[];
        private_conversations: ConversationItem[];
      }>("/chat/conversations");
      setConversations(data);

      // If initialProjectId is provided and no convo selected yet, auto-select it
      if (initialProjectId && !selectedConvo) {
        const found = data.project_rooms.find((p) => p.target_id === initialProjectId);
        if (found) {
          setSelectedConvo(found);
        }
      } else if (!selectedConvo && (data.project_rooms.length > 0 || data.private_conversations.length > 0)) {
        // Auto select first project room by default
        if (data.project_rooms.length > 0) {
          setSelectedConvo(data.project_rooms[0]);
        } else {
          setSelectedConvo(data.private_conversations[0]);
        }
      }
    } catch (err: any) {
      if (!silent) toast.error(err.message || "Gagal memuat daftar percakapan");
    } finally {
      if (!silent) setLoadingConversations(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  // WebSocket connection management
  useEffect(() => {
    if (!token) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let broadcastChan: BroadcastChannel | null = null;

    const handleIncomingMessage = (payload: any) => {
      if (payload?.type === "new_message" && payload.data) {
        const newMsg: ChatMessage = payload.data;

        // Check if message belongs to current active conversation
        if (selectedConvo) {
          const isForCurrentConvo =
            (selectedConvo.type === "project" &&
              newMsg.chat_type === "project" &&
              newMsg.project_id === selectedConvo.target_id) ||
            (selectedConvo.type === "private" &&
              newMsg.chat_type === "private" &&
              ((newMsg.sender_id === selectedConvo.target_id && newMsg.recipient_id === user?.id) ||
                (newMsg.sender_id === user?.id && newMsg.recipient_id === selectedConvo.target_id)));

          if (isForCurrentConvo) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            setTimeout(() => scrollToBottom("smooth"), 80);
          }
        }

        // Refresh conversation snippet and unread counts
        loadConversations(true);
      }
    };

    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        broadcastChan = new BroadcastChannel("produktifa_chat_channel");
        broadcastChan.onmessage = (event) => {
          handleIncomingMessage(event.data);
        };
      } catch {}
    }

    const connectWs = () => {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {};

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            handleIncomingMessage(payload);
          } catch {}
        };

        ws.onclose = () => {
          // If connection failed, don't continuously reconnect on serverless/Vercel
        };

        ws.onerror = () => {
          ws?.close();
        };

        wsRef.current = ws;
      } catch {}
    };

    connectWs();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
      if (broadcastChan) broadcastChan.close();
    };
  }, [token, selectedConvo?.id, user?.id]);

  // Load active conversation messages
  useEffect(() => {
    if (!selectedConvo) return;

    setLoadingMessages(true);
    setSelectedTaskRef(null);
    setShowTaskPicker(false);
    setShowMembersDrawer(false);

    if (selectedConvo.type === "project") {
      api<{
        project: any;
        members: ProjectChatMember[];
        messages: ChatMessage[];
      }>(`/chat/project/${selectedConvo.target_id}`)
        .then((res) => {
          setMessages(res.messages || []);
          setProjectMembers(res.members || []);
          setTimeout(() => scrollToBottom("auto"), 100);
          // Load project tasks for referencing
          loadProjectTasks(selectedConvo.target_id);
          // Silently update unread counts
          loadConversations(true);
        })
        .catch((err) => {
          toast.error(err.message || "Gagal memuat pesan chat proyek");
          setMessages([]);
        })
        .finally(() => setLoadingMessages(false));
    } else {
      api<{
        target_user: any;
        messages: ChatMessage[];
      }>(`/chat/private/${selectedConvo.target_id}`)
        .then((res) => {
          setMessages(res.messages || []);
          setProjectMembers([]);
          setTimeout(() => scrollToBottom("auto"), 100);
          // Silently update unread counts
          loadConversations(true);
        })
        .catch((err) => {
          toast.error(err.message || "Gagal memuat pesan chat pribadi");
          setMessages([]);
        })
        .finally(() => setLoadingMessages(false));
    }
  }, [selectedConvo?.id]);

  // Load project tasks for reference
  const loadProjectTasks = async (projectId: number) => {
    setLoadingTasks(true);
    try {
      const data = await api<TaskReference[]>(`/chat/project/${projectId}/tasks`);
      setAvailableTasks(data || []);
    } catch {
      setAvailableTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedConvo || !inputContent.trim() || sending) return;

    const content = inputContent.trim();
    const taskRefId = selectedTaskRef ? selectedTaskRef.id : null;
    setSending(true);

    try {
      const endpoint =
        selectedConvo.type === "project"
          ? `/chat/project/${selectedConvo.target_id}`
          : `/chat/private/${selectedConvo.target_id}`;

      const newMsg = await api<ChatMessage>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          content,
          task_ref_id: taskRefId,
        }),
      });

      // Optimistically add if not already in state
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      setInputContent("");
      setSelectedTaskRef(null);
      setTimeout(() => scrollToBottom("smooth"), 50);
      loadConversations(true);
    } catch (err: any) {
      toast.error(err.message || "Gagal mengirim pesan");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Keyboard shortcut: Enter to send (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Format timestamp helper
  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const formatDateLabel = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const today = new Date();
      if (date.toDateString() === today.toDateString()) return "Hari Ini";
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) return "Kemarin";
      return date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return "";
    }
  };

  // Filter conversations based on query and category
  const filteredProjectRooms = conversations.project_rooms.filter((p) => {
    if (filterType === "private") return false;
    if (!searchQuery) return true;
    return p.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredPrivateConvos = conversations.private_conversations.filter((c) => {
    if (filterType === "project") return false;
    if (!searchQuery) return true;
    return (
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const totalUnreadCount =
    conversations.project_rooms.reduce((acc, p) => acc + (p.unread_count || 0), 0) +
    conversations.private_conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  // Badge priority colors helper
  const getPriorityStyle = (priority?: Priority) => {
    switch (priority) {
      case "High":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "Medium":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Low":
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const getStatusStyle = (status?: Status) => {
    switch (status) {
      case "Completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "In Progress":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "To Do":
      default:
        return "bg-slate-100 text-slate-700 border-slate-300";
    }
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#0d3b66] text-white">
              <MessagesSquare className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-black tracking-tight text-[#0d3b66]">
                Chat & Diskusi Tim
              </h1>
              <p className="text-xs text-slate-500">
                Komunikasi langsung dan diskusi proyek tanpa keluar dari Produktifa.
              </p>
            </div>
          </div>
        </div>

        {/* Security badge & Quick Actions */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold"
            title="Sistem chat menerapkan aturan isolasi proyek ketat dan enkripsi token JWT"
          >
            <Shield className="h-3.5 w-3.5 text-emerald-600" />
            <span>Akses Terisolasi & Aman</span>
          </div>
          <button
            onClick={() => loadConversations(false)}
            className="btn-ghost py-1.5 px-2.5 text-xs text-slate-600 flex items-center gap-1.5"
            title="Perbarui percakapan"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Chat Grid (Sidebar + Chat Area) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-[720px] max-h-[85vh]">
        {/* Left Column: Conversation Directory */}
        <div className="md:col-span-4 lg:col-span-4 bg-white rounded-xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden h-full">
          {/* Sidebar Top: Search & Filter Tabs */}
          <div className="p-3 border-b border-slate-200 space-y-2.5 bg-slate-50/60">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari ruang proyek atau nama rekan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0d3b66] focus:ring-1 focus:ring-[#0d3b66] transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterType("all")}
                className={`flex-1 py-1 px-2 text-[11px] font-bold rounded-md transition-all text-center cursor-pointer ${
                  filterType === "all"
                    ? "bg-[#0d3b66] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-200/60"
                }`}
              >
                Semua
              </button>
              <button
                onClick={() => setFilterType("project")}
                className={`flex-1 py-1 px-2 text-[11px] font-bold rounded-md transition-all text-center cursor-pointer flex items-center justify-center gap-1 ${
                  filterType === "project"
                    ? "bg-[#0d3b66] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-200/60"
                }`}
              >
                <FolderKanban className="h-3 w-3" />
                <span>Proyek</span>
              </button>
              <button
                onClick={() => setFilterType("private")}
                className={`flex-1 py-1 px-2 text-[11px] font-bold rounded-md transition-all text-center cursor-pointer flex items-center justify-center gap-1 ${
                  filterType === "private"
                    ? "bg-[#0d3b66] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-200/60"
                }`}
              >
                <UserIcon className="h-3 w-3" />
                <span>Pribadi</span>
              </button>
            </div>
          </div>

          {/* Conversation List Stream */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingConversations ? (
              <div className="p-8 text-center space-y-2">
                <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#0d3b66] border-t-transparent" />
                <p className="text-xs text-slate-500">Memuat percakapan...</p>
              </div>
            ) : filteredProjectRooms.length === 0 && filteredPrivateConvos.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <MessageSquare className="h-8 w-8 mx-auto text-slate-300" />
                <p className="text-xs font-medium">Tidak ada percakapan ditemukan.</p>
              </div>
            ) : (
              <>
                {/* 1. PROJECT CHATS SECTION */}
                {filteredProjectRooms.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-100/70 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <FolderKanban className="h-3 w-3" />
                        Chat Proyek ({filteredProjectRooms.length})
                      </span>
                    </div>
                    {filteredProjectRooms.map((convo) => {
                      const isSelected = selectedConvo?.id === convo.id;
                      return (
                        <button
                          key={convo.id}
                          onClick={() => setSelectedConvo(convo)}
                          className={`w-full text-left p-3 transition-colors flex items-start gap-3 cursor-pointer border-l-4 ${
                            isSelected
                              ? "bg-sky-50/80 border-[#0d3b66]"
                              : "hover:bg-slate-50 border-transparent"
                          }`}
                        >
                          <div className="p-2 rounded-lg bg-[#0d3b66]/10 text-[#0d3b66] shrink-0 mt-0.5">
                            <FolderKanban className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className="font-bold text-xs text-slate-900 truncate">
                                {convo.title}
                              </span>
                              {convo.last_message && (
                                <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                  {formatTime(convo.last_message.created_at)}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">
                              {convo.last_message ? (
                                <span>
                                  <strong className="text-slate-700">
                                    {convo.last_message.sender_name.split(" ")[0]}:
                                  </strong>{" "}
                                  {convo.last_message.content}
                                </span>
                              ) : (
                                <span className="italic text-slate-400">Belum ada pesan</span>
                              )}
                            </p>
                          </div>
                          {convo.unread_count > 0 && (
                            <span className="px-1.5 py-0.5 bg-rose-500 text-white font-mono text-[10px] font-bold rounded-full shrink-0">
                              {convo.unread_count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 2. PRIVATE CHATS SECTION */}
                {filteredPrivateConvos.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-100/70 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <UserIcon className="h-3 w-3" />
                        Chat Pribadi ({filteredPrivateConvos.length})
                      </span>
                    </div>
                    {filteredPrivateConvos.map((convo) => {
                      const isSelected = selectedConvo?.id === convo.id;
                      const initial = convo.title.slice(0, 2).toUpperCase();
                      return (
                        <button
                          key={convo.id}
                          onClick={() => setSelectedConvo(convo)}
                          className={`w-full text-left p-3 transition-colors flex items-start gap-3 cursor-pointer border-l-4 ${
                            isSelected
                              ? "bg-sky-50/80 border-[#0d3b66]"
                              : "hover:bg-slate-50 border-transparent"
                          }`}
                        >
                          <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-300">
                            {initial}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className="font-bold text-xs text-slate-900 truncate">
                                {convo.title}
                              </span>
                              {convo.last_message && (
                                <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                  {formatTime(convo.last_message.created_at)}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">
                              {convo.last_message ? (
                                convo.last_message.content
                              ) : (
                                <span className="text-slate-400">{convo.subtitle}</span>
                              )}
                            </p>
                          </div>
                          {convo.unread_count > 0 && (
                            <span className="px-1.5 py-0.5 bg-rose-500 text-white font-mono text-[10px] font-bold rounded-full shrink-0">
                              {convo.unread_count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Column: Active Conversation Room */}
        <div className="md:col-span-8 lg:col-span-8 bg-white rounded-xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden h-full relative">
          {selectedConvo ? (
            <>
              {/* Active Room Header */}
              <div className="p-3.5 px-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      selectedConvo.type === "project"
                        ? "bg-[#0d3b66] text-white"
                        : "bg-indigo-600 text-white"
                    }`}
                  >
                    {selectedConvo.type === "project" ? (
                      <FolderKanban className="h-4 w-4" />
                    ) : (
                      <UserIcon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-sm text-slate-900 truncate">
                        {selectedConvo.title}
                      </h2>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wide ${
                          selectedConvo.type === "project"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-indigo-100 text-indigo-800"
                        }`}
                      >
                        {selectedConvo.type === "project" ? "Chat Proyek" : "Pesan Pribadi"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      {selectedConvo.type === "project"
                        ? `${projectMembers.length} anggota proyek aktif`
                        : selectedConvo.subtitle}
                    </p>
                  </div>
                </div>

                {/* Right controls in header */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedConvo.type === "project" && (
                    <button
                      onClick={() => setShowMembersDrawer(!showMembersDrawer)}
                      className={`btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1.5 ${
                        showMembersDrawer ? "bg-slate-200 text-slate-900" : "text-slate-600"
                      }`}
                      title="Lihat peran anggota dalam proyek ini"
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Peran Anggota ({projectMembers.length})</span>
                    </button>
                  )}
                  {selectedConvo.type === "project" && onNavigateToTasks && (
                    <button
                      onClick={() => onNavigateToTasks(selectedConvo.target_id)}
                      className="btn-ghost text-xs py-1.5 px-2.5 text-slate-600 flex items-center gap-1.5"
                      title="Buka daftar tugas proyek ini"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Lihat Tugas</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Members Role Drawer (Slide-down info bar for Project Chat) */}
              {showMembersDrawer && selectedConvo.type === "project" && (
                <div className="p-3 bg-slate-100/90 border-b border-slate-200 text-xs animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-[#0d3b66]" />
                      Daftar Anggota & Peran Proyek
                    </span>
                    <button
                      onClick={() => setShowMembersDrawer(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-36 overflow-y-auto">
                    {projectMembers.map((m) => (
                      <div
                        key={m.id}
                        className="bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-2"
                      >
                        <div className="h-6 w-6 rounded bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                          {m.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 text-[11px] truncate">
                            {m.name} {m.is_owner && "👑"}
                          </div>
                          <div className="text-[10px] text-slate-500 font-semibold truncate">
                            {m.role_name || (m.is_owner ? "Project Manager" : "Anggota")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages Stream Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f8fafc]">
                {loadingMessages ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center space-y-2">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#0d3b66] border-t-transparent" />
                      <p className="text-xs text-slate-500">Memuat riwayat obrolan...</p>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                    <MessageSquare className="h-10 w-10 text-slate-300" />
                    <div className="text-center max-w-xs">
                      <p className="text-sm font-bold text-slate-700">Belum ada pesan</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Kirimkan salam atau lampirkan referensi tugas untuk memulai koordinasi dengan tim.
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isSelf = msg.sender_id === user?.id;
                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const isNewDay =
                      !prevMsg ||
                      new Date(msg.created_at).toDateString() !==
                        new Date(prevMsg.created_at).toDateString();

                    return (
                      <React.Fragment key={msg.id}>
                        {isNewDay && (
                          <div className="flex items-center justify-center my-3">
                            <span className="px-2.5 py-0.5 rounded-full bg-slate-200/80 text-slate-600 text-[10px] font-bold">
                              {formatDateLabel(msg.created_at)}
                            </span>
                          </div>
                        )}

                        <div
                          className={`flex gap-2.5 items-end ${
                            isSelf ? "justify-end" : "justify-start"
                          }`}
                        >
                          {!isSelf && (
                            <div
                              className="h-7 w-7 rounded-full bg-[#0d3b66] text-white font-bold text-[10px] flex items-center justify-center shrink-0 border border-slate-300 mb-1"
                              title={`${msg.sender_name} (${msg.sender_role || "Anggota"})`}
                            >
                              {msg.sender_name.slice(0, 2).toUpperCase()}
                            </div>
                          )}

                          <div
                            className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-2xs space-y-1.5 ${
                              isSelf
                                ? "bg-[#0d3b66] text-white rounded-br-xs"
                                : "bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs"
                            }`}
                          >
                            {/* Sender Info & Role Tag (for incoming messages or project chat) */}
                            {!isSelf && (
                              <div className="flex items-center gap-1.5 leading-none">
                                <span className="font-bold text-xs text-slate-900">
                                  {msg.sender_name}
                                </span>
                                {msg.sender_role && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-sky-100 text-sky-800">
                                    {msg.sender_role} {msg.is_sender_owner ? "· Pemilik" : ""}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Message Content */}
                            <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                              {msg.content}
                            </p>

                            {/* Attached Task Reference Card */}
                            {msg.task_ref && (
                              <div
                                onClick={() => {
                                  if (onNavigateToTasks && msg.project_id) {
                                    onNavigateToTasks(msg.project_id);
                                  }
                                }}
                                className={`mt-2 p-2.5 rounded-lg border text-left cursor-pointer transition-all hover:scale-[1.01] ${
                                  isSelf
                                    ? "bg-white/10 border-white/20 text-white hover:bg-white/15"
                                    : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100/80"
                                }`}
                                title="Klik untuk melihat tugas ini di Kanban/Tugas"
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-80">
                                    <Tag className="h-3 w-3" />
                                    Referensi Tugas #{msg.task_ref.id}
                                  </span>
                                  <ExternalLink className="h-3 w-3 opacity-60" />
                                </div>
                                <div className="font-bold text-xs truncate">
                                  {msg.task_ref.title}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                                  {msg.task_ref.status && (
                                    <span
                                      className={`px-1.5 py-0.2 rounded border font-semibold ${getStatusStyle(
                                        msg.task_ref.status
                                      )}`}
                                    >
                                      {msg.task_ref.status}
                                    </span>
                                  )}
                                  {msg.task_ref.priority && (
                                    <span
                                      className={`px-1.5 py-0.2 rounded border font-semibold ${getPriorityStyle(
                                        msg.task_ref.priority
                                      )}`}
                                    >
                                      {msg.task_ref.priority}
                                    </span>
                                  )}
                                  {msg.task_ref.due_date && (
                                    <span className="flex items-center gap-0.5 opacity-80">
                                      <Clock className="h-2.5 w-2.5" />
                                      {msg.task_ref.due_date}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Time & Read indicator */}
                            <div
                              className={`flex items-center justify-end gap-1 text-[10px] font-mono leading-none pt-0.5 ${
                                isSelf ? "text-slate-300" : "text-slate-400"
                              }`}
                            >
                              <span>{formatTime(msg.created_at)}</span>
                              {isSelf && selectedConvo.type === "private" && (
                                <span title={msg.is_read ? "Sudah dibaca" : "Terkirim"}>
                                  {msg.is_read ? "✓✓" : "✓"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Selected Task Reference Preview Pill */}
              {selectedTaskRef && (
                <div className="px-4 py-2 bg-sky-50 border-t border-sky-100 flex items-center justify-between text-xs text-sky-900">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-bold flex items-center gap-1 text-[#0d3b66]">
                      <Paperclip className="h-3.5 w-3.5" />
                      Referensi Tugas:
                    </span>
                    <span className="truncate font-semibold">{selectedTaskRef.title}</span>
                  </div>
                  <button
                    onClick={() => setSelectedTaskRef(null)}
                    className="text-slate-400 hover:text-slate-700 ml-2"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Task Reference Picker Modal / Popover */}
              {showTaskPicker && selectedConvo.type === "project" && (
                <div className="border-t border-slate-200 bg-white p-3 max-h-48 overflow-y-auto space-y-1.5 animate-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-[#0d3b66]" />
                      Pilih Tugas Proyek untuk Direferensikan
                    </span>
                    <button
                      onClick={() => setShowTaskPicker(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {loadingTasks ? (
                    <div className="p-4 text-center text-xs text-slate-500">Memuat daftar tugas...</div>
                  ) : availableTasks.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Belum ada tugas di proyek ini.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {availableTasks.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSelectedTaskRef(t);
                            setShowTaskPicker(false);
                            inputRef.current?.focus();
                          }}
                          className="w-full text-left p-2 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-[#0d3b66] transition-all flex items-start justify-between gap-2 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-slate-900 truncate">{t.title}</div>
                            <div className="text-[10px] text-slate-500">
                              {t.status} · Prioritas {t.priority}
                            </div>
                          </div>
                          <PlusCircle className="h-4 w-4 text-[#0d3b66] shrink-0 mt-0.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Message Input Bar */}
              <div className="p-3 border-t border-slate-200 bg-white shrink-0">
                <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                  {/* Task Reference Button (Only for Project chat) */}
                  {selectedConvo.type === "project" && (
                    <button
                      type="button"
                      onClick={() => setShowTaskPicker(!showTaskPicker)}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        selectedTaskRef || showTaskPicker
                          ? "bg-sky-50 text-[#0d3b66] border-[#0d3b66]"
                          : "text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                      title="Sematkan referensi tugas ke dalam percakapan"
                    >
                      <Paperclip className="h-4 w-4" />
                      <span className="hidden sm:inline">Tugas</span>
                    </button>
                  )}

                  {/* Textarea */}
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={inputContent}
                      onChange={(e) => setInputContent(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        selectedConvo.type === "project"
                          ? `Tulis pesan untuk tim ${selectedConvo.title}... (Enter kirim, Shift+Enter baris baru)`
                          : `Tulis pesan pribadi untuk ${selectedConvo.title}...`
                      }
                      rows={1}
                      className="w-full resize-none rounded-lg border border-slate-300 py-2.5 px-3 text-xs focus:outline-none focus:border-[#0d3b66] focus:ring-1 focus:ring-[#0d3b66] max-h-24 transition-all"
                    />
                  </div>

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={!inputContent.trim() || sending}
                    className="p-2.5 rounded-lg bg-[#0d3b66] text-white hover:bg-[#0a2e50] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
                    title="Kirim pesan"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
              <MessagesSquare className="h-12 w-12 text-slate-300" />
              <div>
                <h3 className="font-bold text-slate-700 text-sm">Pilih Percakapan</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Pilih salah satu ruang kerja proyek atau kontak rekan tim dari daftar di sebelah kiri untuk memulai diskusi.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
