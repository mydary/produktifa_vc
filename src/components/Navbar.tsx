import React, { useEffect, useState } from "react";
import { Calendar, CheckSquare, Flame, FolderKanban, LayoutDashboard, LogOut, MessagesSquare, Sparkles, Trophy } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { GamificationData } from "../types";

interface NavbarProps {
  activeTab: "dashboard" | "projects" | "tasks" | "calendar" | "gamification" | "chat";
  onTabChange: (tab: "dashboard" | "projects" | "tasks" | "calendar" | "gamification" | "chat") => void;
}

const LOGO_SRC = "/assets/aistudio/file_000000003f108207860b8aedad3cf931_53da58af.png";

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const { user, logout } = useAuth();
  const [gamSummary, setGamSummary] = useState<{ level: number; title: string; current_streak: number; total_xp: number } | null>(null);
  const [chatUnread, setChatUnread] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    api<GamificationData>("/gamification/overview")
      .then((res) => {
        if (res?.profile) {
          setGamSummary({
            level: res.profile.level,
            title: res.profile.title,
            current_streak: res.profile.current_streak,
            total_xp: res.profile.total_xp,
          });
        }
      })
      .catch(() => {});

    // Fetch chat unread count
    api<{ total: number }>("/chat/unread-count")
      .then((res) => {
        if (res && typeof res.total === "number") {
          setChatUnread(res.total);
        }
      })
      .catch(() => {});
  }, [user, activeTab]);

  // Get user initials (e.g. "Ani Lestari" -> "AL")
  const getInitials = (name?: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/90 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 sm:px-6 py-2 sm:py-2.5">
        {/* Brand & Nav Group */}
        <div className="flex items-center gap-2 sm:gap-4 md:gap-6 min-w-0">
          <button
            onClick={() => onTabChange("dashboard")}
            className="flex items-center gap-2 text-left cursor-pointer focus:outline-none group shrink-0"
            title="Produktifa - Beranda"
          >
            <img
              src={LOGO_SRC}
              alt="Produktifa Logo"
              className="h-7 sm:h-8 w-auto object-contain transition-transform group-hover:scale-105 shrink-0"
            />
            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-black tracking-tight text-[#0d3b66]">
                PRODUKTIFA
              </span>
              <span className="hidden xl:inline-block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                TASK SUITE
              </span>
            </div>
          </button>

          {/* Navigation Links with Mobile Icon-First Responsiveness */}
          <nav className="flex items-center gap-0.5 sm:gap-1 border-l border-slate-200 pl-2 sm:pl-4">
            <button
              onClick={() => onTabChange("dashboard")}
              aria-label="Dashboard"
              title="Dashboard"
              className={`flex items-center gap-1.5 rounded-md px-2 sm:px-2.5 md:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === "dashboard"
                  ? "bg-[#0d3b66] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">Dashboard</span>
            </button>

            <button
              onClick={() => onTabChange("projects")}
              aria-label="Proyek"
              title="Proyek"
              className={`flex items-center gap-1.5 rounded-md px-2 sm:px-2.5 md:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === "projects"
                  ? "bg-[#0d3b66] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <FolderKanban className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">Proyek</span>
            </button>

            <button
              onClick={() => onTabChange("tasks")}
              aria-label="Tugas"
              title="Tugas"
              className={`flex items-center gap-1.5 rounded-md px-2 sm:px-2.5 md:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === "tasks"
                  ? "bg-[#0d3b66] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">Tugas</span>
            </button>

            <button
              onClick={() => onTabChange("calendar")}
              aria-label="Kalender & Deadline"
              title="Kalender & Deadline"
              className={`flex items-center gap-1.5 rounded-md px-2 sm:px-2.5 md:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === "calendar"
                  ? "bg-[#0d3b66] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">Kalender</span>
            </button>

            <button
              onClick={() => onTabChange("gamification")}
              aria-label="Misi Produktifa & Level"
              title="Misi Produktifa & Level"
              className={`flex items-center gap-1.5 rounded-md px-2 sm:px-2.5 md:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === "gamification"
                  ? "bg-[#0d3b66] text-white shadow-xs"
                  : "text-amber-800 bg-amber-50/60 hover:bg-amber-100/70 border border-amber-200/60"
              }`}
            >
              <Trophy className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="hidden md:inline font-bold">Misi & Level</span>
              {gamSummary && (
                <span className="text-[10px] font-mono font-black text-amber-700 bg-amber-200/70 px-1.5 py-0.2 rounded">
                  Lv.{gamSummary.level}
                </span>
              )}
            </button>

            <button
              onClick={() => onTabChange("chat")}
              aria-label="Chat Tim"
              title="Chat & Diskusi Tim"
              className={`flex items-center gap-1.5 rounded-md px-2 sm:px-2.5 md:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 relative ${
                activeTab === "chat"
                  ? "bg-[#0d3b66] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <MessagesSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">Chat</span>
              {chatUnread > 0 && (
                <span className="flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white font-mono text-[9px] font-bold">
                  {chatUnread}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* User Account & Action Zone */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Quick Level & Streak Pill */}
          {gamSummary && (
            <button
              onClick={() => onTabChange("gamification")}
              title={`Level ${gamSummary.level} (${gamSummary.title}) • Streak: ${gamSummary.current_streak} Hari • Klik untuk buka Misi Produktifa`}
              className="hidden sm:flex items-center gap-2 bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 rounded-lg border border-slate-200 transition-all cursor-pointer text-xs"
            >
              <div className="flex items-center gap-1 font-bold text-slate-800">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Lv.{gamSummary.level}</span>
              </div>
              <div className="w-px h-3 bg-slate-300" />
              <div className="flex items-center gap-1 text-orange-600 font-extrabold text-[11px]">
                <Flame className="h-3.5 w-3.5 fill-orange-500 text-orange-500" />
                <span>{gamSummary.current_streak}d</span>
              </div>
            </button>
          )}

          <div className="flex items-center gap-2">
            <div
              className="h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-[#0d3b66] text-white font-mono font-bold text-[11px] sm:text-xs flex items-center justify-center shrink-0 border border-slate-300"
              title={`${user?.name} (${user?.email})`}
            >
              {getInitials(user?.name)}
            </div>
            <div className="hidden lg:block text-left text-xs leading-tight">
              <div className="font-bold text-slate-900 truncate max-w-[120px]">{user?.name}</div>
              <div className="text-slate-500 font-mono text-[11px] truncate max-w-[120px] tabular-nums">
                {user?.email}
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            className="btn-ghost text-xs py-1.5 px-2 sm:px-2.5 text-slate-600 hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50 shrink-0"
            title="Keluar dari akun"
            aria-label="Keluar"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </div>
    </header>
  );
};

