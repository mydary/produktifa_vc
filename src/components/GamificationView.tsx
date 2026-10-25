import React, { useEffect, useState } from "react";
import {
  Award,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Flame,
  Footprints,
  FolderCheck,
  Gift,
  HelpCircle,
  History,
  Info,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import type { GamificationData, Quest, Badge, XpTransaction, ActivityDay } from "../types";

interface GamificationViewProps {
  onNavigateToTasks?: () => void;
  onNavigateToProjects?: () => void;
}

export const GamificationView: React.FC<GamificationViewProps> = ({
  onNavigateToTasks,
  onNavigateToProjects,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<GamificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingQuestId, setClaimingQuestId] = useState<number | null>(null);
  const [badgeFilter, setBadgeFilter] = useState<"all" | "unlocked" | "locked">("all");
  const [activeSubTab, setActiveSubTab] = useState<"quests" | "badges" | "streak" | "ledger">("quests");

  const loadGamificationData = async () => {
    try {
      setLoading(true);
      const res = await api<GamificationData>("/gamification/overview");
      setData(res);
    } catch (err) {
      toast.error((err as Error).message, "Gagal Memuat Data Gamifikasi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGamificationData();
  }, []);

  const handleClaimQuest = async (quest: Quest) => {
    if (claimingQuestId !== null) return;
    try {
      setClaimingQuestId(quest.id);
      const res = await api<{
        success: boolean;
        xp_gained: number;
        all_period_bonus: number;
        new_total_xp: number;
        level: number;
        title: string;
      }>(`/gamification/quests/${quest.id}/claim`, { method: "POST" });

      if (res.all_period_bonus > 0) {
        toast.success(
          `Selamat! Anda memperoleh +${res.xp_gained} XP (termasuk bonus sempurna +${res.all_period_bonus} XP)!`,
          "Misi Selesai & Bonus Diklaim! 🎉"
        );
      } else {
        toast.success(`Berhasil mengklaim +${res.xp_gained} XP! Terus tingkatkan produktivitas Anda.`, "Misi Selesai! ✨");
      }

      await loadGamificationData();
    } catch (err) {
      toast.error((err as Error).message, "Gagal Mengklaim Hadiah");
    } finally {
      setClaimingQuestId(null);
    }
  };

  const renderBadgeIcon = (iconName: string, isUnlocked: boolean) => {
    const className = `h-6 w-6 ${isUnlocked ? "text-amber-500" : "text-slate-400"}`;
    switch (iconName) {
      case "Footprints":
        return <Footprints className={className} />;
      case "FolderCheck":
        return <FolderCheck className={className} />;
      case "Flame":
        return <Flame className={className} />;
      case "Zap":
        return <Zap className={className} />;
      case "ShieldCheck":
        return <ShieldCheck className={className} />;
      case "Award":
        return <Award className={className} />;
      case "Trophy":
        return <Trophy className={className} />;
      case "Users":
        return <Users className={className} />;
      case "Target":
        return <Target className={className} />;
      default:
        return <Star className={className} />;
    }
  };

  const getFrameColorClass = (frame: string) => {
    switch (frame) {
      case "diamond":
        return "border-violet-400 ring-4 ring-violet-200/60 bg-gradient-to-br from-violet-600 to-indigo-700 text-white";
      case "gold":
        return "border-amber-400 ring-4 ring-amber-200/60 bg-gradient-to-br from-amber-500 to-yellow-600 text-white";
      case "silver":
        return "border-slate-300 ring-4 ring-slate-200/60 bg-gradient-to-br from-slate-600 to-slate-700 text-white";
      default:
        return "border-amber-700/60 ring-4 ring-amber-100 bg-gradient-to-br from-amber-800 to-amber-950 text-white";
    }
  };

  const getFrameBadgeClass = (frame: string) => {
    switch (frame) {
      case "diamond":
        return "bg-violet-100 text-violet-800 border-violet-200";
      case "gold":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "silver":
        return "bg-slate-100 text-slate-800 border-slate-200";
      default:
        return "bg-orange-50 text-orange-800 border-orange-200";
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#0d3b66] border-t-transparent" />
        <p className="mt-4 text-xs font-bold tracking-wider uppercase text-slate-500">
          Memuat Misi Produktifa & Data Gamifikasi...
        </p>
      </div>
    );
  }

  const profile = data?.profile;
  const quests = data?.quests;
  const badges = data?.badges || [];
  const activity = data?.activity;
  const recentLedger = data?.recent_ledger || [];

  const filteredBadges = badges.filter((b) => {
    if (badgeFilter === "unlocked") return b.is_unlocked;
    if (badgeFilter === "locked") return !b.is_unlocked;
    return true;
  });

  const unlockedCount = badges.filter((b) => b.is_unlocked).length;

  return (
    <div className="space-y-6">
      {/* 1. HERO BANNER: MISI PRODUKTIFA */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-[#0d3b66] via-[#10487d] to-[#165a9e] p-6 sm:p-8 text-white shadow-sm relative overflow-hidden">
        {/* Subtle decorative background circles */}
        <div className="absolute -top-12 -right-12 h-64 w-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-16 -left-12 h-48 w-48 rounded-full bg-amber-400/10 pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-xs border border-white/15">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>Misi Produktifa</span>
              <span className="text-white/40">•</span>
              <span className="text-amber-200">Selesaikan Misi, Naikkan Level!</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Kembangkan Level Produktivitasmu
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              Dapatkan XP dan naikkan level setiap kali Anda menyelesaikan tugas pekerjaan. 
              Sistem ini menghargai konsistensi dan ketepatan waktu tanpa membuat Anda kehilangan poin saat beristirahat.
            </p>
          </div>

          {/* User Level Card */}
          {profile && (
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 sm:p-5 flex flex-col gap-3 min-w-[280px] sm:min-w-[320px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-12 w-12 rounded-xl flex items-center justify-center font-black text-base shadow-sm border-2 ${getFrameColorClass(
                      profile.avatar_frame
                    )}`}
                  >
                    Lv.{profile.level}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-white text-base">
                        Level {profile.level}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getFrameBadgeClass(
                          profile.avatar_frame
                        )}`}
                      >
                        {profile.title}
                      </span>
                    </div>
                    <div className="text-xs text-amber-300 font-mono font-bold flex items-center gap-1 mt-0.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{profile.total_xp.toLocaleString()} XP Akumulasi</span>
                    </div>
                  </div>
                </div>

                {/* Streak Counter */}
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-orange-300 font-extrabold text-sm sm:text-base">
                    <Flame className="h-4 w-4 fill-orange-400 text-orange-400" />
                    <span>{profile.current_streak} Hari</span>
                  </div>
                  <div className="text-[10px] text-slate-300 font-medium">
                    Rekor: {profile.longest_streak} Hari
                  </div>
                </div>
              </div>

              {/* Progress Bar to next level */}
              <div className="space-y-1.5 pt-1 border-t border-white/15">
                <div className="flex justify-between text-xs text-slate-200 font-medium">
                  <span>Progres ke Level {profile.level + 1}</span>
                  <span className="font-mono font-bold text-amber-200">
                    {profile.xp_in_level} / {profile.xp_needed} XP ({profile.progress_percent}%)
                  </span>
                </div>
                <div className="h-2.5 w-full bg-black/25 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full transition-all duration-500 shadow-xs"
                    style={{ width: `${profile.progress_percent}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-300 flex justify-between">
                  <span>Ambang saat ini: {profile.current_level_xp} XP</span>
                  <span>Target: {profile.next_level_xp} XP</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 overflow-x-auto gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setActiveSubTab("quests")}
            className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === "quests"
                ? "bg-[#0d3b66] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>Misi Aktif (Quests)</span>
            {quests && (
              <span className="ml-1 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black px-1.5 py-0.2">
                {quests.daily.length + quests.weekly.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab("badges")}
            className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === "badges"
                ? "bg-[#0d3b66] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Award className="h-4 w-4" />
            <span>Badge & Prestasi</span>
            <span className="ml-1 rounded-full bg-slate-200 text-slate-800 text-[10px] font-black px-1.5 py-0.2">
              {unlockedCount}/{badges.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab("streak")}
            className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === "streak"
                ? "bg-[#0d3b66] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Flame className="h-4 w-4" />
            <span>Streak & Kalender</span>
          </button>

          <button
            onClick={() => setActiveSubTab("ledger")}
            className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === "ledger"
                ? "bg-[#0d3b66] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <History className="h-4 w-4" />
            <span>Riwayat XP</span>
          </button>
        </div>

        <button
          onClick={loadGamificationData}
          title="Segarkan data gamifikasi"
          className="btn-ghost text-xs py-1.5 px-2 text-slate-600 hover:text-slate-900 shrink-0 flex items-center gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Segarkan</span>
        </button>
      </div>

      {/* 3. TAB CONTENT */}
      {/* 3A: QUESTS (DAILY & WEEKLY) */}
      {activeSubTab === "quests" && (
        <div className="space-y-6">
          {/* Rules / Guidance Callout */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Prinsip Gamifikasi Produktifa:</span>
              <p className="text-amber-800 leading-relaxed">
                XP hanya diberikan <strong>1 kali</strong> per penyelesaian tugas valid dan langsung diberikan kepada anggota yang mengerjakan tugas. 
                Jika tugas terlambat, Anda tetap menerima poin dasar dan tidak kehilangan XP.
              </p>
            </div>
          </div>

          {/* Daily Quests Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#0d3b66]" />
                  <span>Misi Harian (Daily Quests)</span>
                  <span className="text-xs font-medium text-slate-500 font-mono">
                    Hari Ini: {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" })}
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Target harian untuk menjaga ritme kerja yang sehat. Selesaikan semua untuk bonus +15 XP!
                </p>
              </div>

              {quests?.daily_all_completed && (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Semua Misi Harian Tuntas!</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {quests?.daily.map((q) => {
                const canClaim = q.is_complete && !q.is_claimed;
                return (
                  <div
                    key={q.id}
                    className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                      q.is_claimed
                        ? "bg-emerald-50/40 border-emerald-200"
                        : canClaim
                        ? "bg-amber-50/60 border-amber-300 ring-2 ring-amber-200/50"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-slate-900 text-sm">{q.title}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                          +{q.xp_reward} XP
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed min-h-[32px]">
                        {q.description}
                      </p>
                    </div>

                    <div className="mt-4 space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Target</span>
                        <span className="font-mono font-bold text-slate-800">
                          {q.current_count} / {q.target_count}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            q.is_claimed
                              ? "bg-emerald-500"
                              : canClaim
                              ? "bg-amber-500"
                              : "bg-[#0d3b66]"
                          }`}
                          style={{ width: `${q.progress_percent}%` }}
                        />
                      </div>

                      {q.is_claimed ? (
                        <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-100/60 rounded-md">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Hadiah Diklaim</span>
                        </div>
                      ) : canClaim ? (
                        <button
                          onClick={() => handleClaimQuest(q)}
                          disabled={claimingQuestId === q.id}
                          className="w-full btn-primary text-xs py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <Gift className="h-3.5 w-3.5" />
                          <span>{claimingQuestId === q.id ? "Mengklaim..." : "Klaim Hadiah (+XP)"}</span>
                        </button>
                      ) : (
                        <div className="text-[11px] text-center text-slate-400 py-1 font-medium">
                          Sedang Berjalan ({q.progress_percent}%)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekly Quests Section */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#0d3b66]" />
                  <span>Target Mingguan (Weekly Quests)</span>
                  <span className="text-xs font-medium text-slate-500 font-mono">
                    {quests?.weekly[0]?.period_key || "Minggu Ini"}
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Target konsistensi jangka menengah. Selesaikan seluruh target untuk bonus ekstra +50 XP!
                </p>
              </div>

              {quests?.weekly_all_completed && (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Seluruh Target Mingguan Tercapai!</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {quests?.weekly.map((q) => {
                const canClaim = q.is_complete && !q.is_claimed;
                return (
                  <div
                    key={q.id}
                    className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                      q.is_claimed
                        ? "bg-emerald-50/40 border-emerald-200"
                        : canClaim
                        ? "bg-amber-50/60 border-amber-300 ring-2 ring-amber-200/50"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-slate-900 text-sm">{q.title}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                          +{q.xp_reward} XP
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed min-h-[32px]">
                        {q.description}
                      </p>
                    </div>

                    <div className="mt-4 space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Target Mingguan</span>
                        <span className="font-mono font-bold text-slate-800">
                          {q.current_count} / {q.target_count}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            q.is_claimed
                              ? "bg-emerald-500"
                              : canClaim
                              ? "bg-amber-500"
                              : "bg-[#0d3b66]"
                          }`}
                          style={{ width: `${q.progress_percent}%` }}
                        />
                      </div>

                      {q.is_claimed ? (
                        <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-100/60 rounded-md">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Hadiah Diklaim</span>
                        </div>
                      ) : canClaim ? (
                        <button
                          onClick={() => handleClaimQuest(q)}
                          disabled={claimingQuestId === q.id}
                          className="w-full btn-primary text-xs py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <Gift className="h-3.5 w-3.5" />
                          <span>{claimingQuestId === q.id ? "Mengklaim..." : "Klaim Hadiah (+XP)"}</span>
                        </button>
                      ) : (
                        <div className="text-[11px] text-center text-slate-400 py-1 font-medium">
                          Sedang Berjalan ({q.progress_percent}%)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-100/80 rounded-xl border border-slate-200">
            <div className="text-xs text-slate-600">
              Siap menyelesaikan tugas berikutnya untuk menyelesaikan misi hari ini?
            </div>
            <div className="flex items-center gap-2">
              {onNavigateToTasks && (
                <button
                  onClick={onNavigateToTasks}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Buka Daftar Tugas</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
              {onNavigateToProjects && (
                <button
                  onClick={onNavigateToProjects}
                  className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Kelola Proyek</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3B: BADGES & PRESTASI */}
      {activeSubTab === "badges" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Award className="h-4 w-4 text-[#0d3b66]" />
                <span>Galeri Badge & Prestasi</span>
              </h2>
              <p className="text-xs text-slate-500">
                Pencapaian khusus yang membuktikan keahlian kerja nyata Anda. Badge yang belum terbuka menampilkan progres menuju target.
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
              <button
                onClick={() => setBadgeFilter("all")}
                className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  badgeFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Semua ({badges.length})
              </button>
              <button
                onClick={() => setBadgeFilter("unlocked")}
                className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  badgeFilter === "unlocked" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Terbuka ({unlockedCount})
              </button>
              <button
                onClick={() => setBadgeFilter("locked")}
                className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  badgeFilter === "locked" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Terkunci ({badges.length - unlockedCount})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredBadges.map((badge) => (
              <div
                key={badge.badge_key}
                className={`rounded-xl border p-4 transition-all flex flex-col justify-between ${
                  badge.is_unlocked
                    ? "bg-white border-amber-200/90 shadow-xs hover:border-amber-300"
                    : "bg-slate-50/70 border-slate-200 opacity-80"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div
                      className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border ${
                        badge.is_unlocked
                          ? "bg-amber-50 border-amber-200 text-amber-600"
                          : "bg-slate-100 border-slate-200 text-slate-400"
                      }`}
                    >
                      {renderBadgeIcon(badge.icon, badge.is_unlocked)}
                    </div>

                    <div className="flex flex-col items-end">
                      {badge.is_unlocked ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Terbuka</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded border border-slate-300">
                          <Lock className="h-3 w-3" />
                          <span>Terkunci</span>
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono mt-1 capitalize">
                        {badge.category}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-extrabold text-slate-900 text-sm">{badge.name}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed mt-1">
                    {badge.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">
                      {badge.is_unlocked ? "Pencapaian" : "Target Terbuka"}
                    </span>
                    <span className="font-mono font-bold text-slate-700">
                      {badge.current_count} / {badge.target_count} ({badge.progress_percent}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        badge.is_unlocked ? "bg-amber-500" : "bg-slate-400"
                      }`}
                      style={{ width: `${badge.progress_percent}%` }}
                    />
                  </div>
                  {badge.unlocked_at && (
                    <div className="text-[10px] text-emerald-700 font-medium pt-0.5">
                      Dibuka pada {new Date(badge.unlocked_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3C: STREAK & KALENDER AKTIVITAS */}
      {activeSubTab === "streak" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Streak Saat Ini
                </span>
                <div className="h-8 w-8 rounded-lg bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center">
                  <Flame className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-black text-slate-900">
                {profile?.current_streak || 0}{" "}
                <span className="text-sm font-semibold text-slate-500">Hari</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Menyelesaikan minimal 1 tugas produktif setiap hari.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Rekor Streak Terpanjang
                </span>
                <div className="h-8 w-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                  <Trophy className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-black text-slate-900">
                {profile?.longest_streak || 0}{" "}
                <span className="text-sm font-semibold text-slate-500">Hari</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Capaian konsistensi kerja berturut-turut terbaik Anda.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Status Aktivitas
                </span>
                <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                  <Zap className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-lg font-extrabold text-slate-900">
                {profile?.last_active_date
                  ? `Aktif ${profile.last_active_date}`
                  : "Mulai Hari Ini"}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Riwayat streak tetap tersimpan aman di profil Anda.
              </p>
            </div>
          </div>

          {/* 30-Day Activity Heatmap Grid */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#0d3b66]" />
                  <span>Kalender Aktivitas Produktif (30 Hari Terakhir)</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Setiap kotak mewakili hari kalender. Warna hijau menunjukkan Anda menyelesaikan tugas nyata pada hari tersebut.
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2 text-xs text-slate-500 self-start sm:self-auto">
                <span className="text-[11px]">Tidak ada tugas</span>
                <div className="h-3 w-3 rounded bg-slate-100 border border-slate-200" />
                <div className="h-3 w-3 rounded bg-emerald-200 border border-emerald-300" />
                <div className="h-3 w-3 rounded bg-emerald-500 border border-emerald-600" />
                <span className="text-[11px]">Banyak tugas</span>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-15 gap-2 pt-2">
              {activity?.days.map((day) => {
                let bgClass = "bg-slate-100 border-slate-200 text-slate-400";
                if (day.tasks_completed === 1) {
                  bgClass = "bg-emerald-100 border-emerald-300 text-emerald-800 font-bold";
                } else if (day.tasks_completed >= 2) {
                  bgClass = "bg-emerald-500 border-emerald-600 text-white font-black shadow-xs";
                }

                return (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.tasks_completed} tugas selesai ${day.is_today ? "(Hari ini)" : ""}`}
                    className={`aspect-square rounded-lg border flex flex-col items-center justify-center p-1 text-[10px] transition-transform hover:scale-105 cursor-pointer relative ${bgClass} ${
                      day.is_today ? "ring-2 ring-[#0d3b66]" : ""
                    }`}
                  >
                    <span className="text-[9px] opacity-70">
                      {new Date(day.date).getDate()}
                    </span>
                    {day.tasks_completed > 0 && (
                      <span className="text-[10px] leading-tight">
                        {day.tasks_completed}✓
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 flex items-start gap-2">
              <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <span>
                <strong>Prinsip Anti-Kelelahan:</strong> Produktifa dirancang agar Anda tidak merasa bersalah saat mengambil waktu istirahat. 
                Membuka aplikasi saja sengaja tidak dihitung sebagai streak, hanya pekerjaan yang selesai nyata yang dihitung.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3D: RIWAYAT XP (LEDGER LOG) */}
      {activeSubTab === "ledger" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <History className="h-4 w-4 text-[#0d3b66]" />
                <span>Buku Riwayat Perolehan XP (Ledger)</span>
              </h2>
              <p className="text-xs text-slate-500">
                Pencatatan transparan untuk setiap poin XP yang Anda peroleh dari tugas nyata, misi, dan badge.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Total Kumulatif</div>
              <div className="text-base font-black text-[#0d3b66]">
                {profile?.total_xp.toLocaleString()} XP
              </div>
            </div>
          </div>

          {recentLedger.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Belum ada riwayat perolehan XP. Selesaikan tugas pertama Anda untuk mendapatkan poin!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Waktu</th>
                    <th className="py-2.5 px-3">Kategori</th>
                    <th className="py-2.5 px-3">Keterangan</th>
                    <th className="py-2.5 px-3 text-right">Poin XP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentLedger.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                          {tx.source_type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {tx.description}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">
                        +{tx.amount} XP
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
