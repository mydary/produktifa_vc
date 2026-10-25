import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FolderKanban,
  HelpCircle,
  ListTodo,
  Loader2,
  Mail,
  PieChart,
  Plus,
  Sparkles,
  Tag,
  TrendingUp,
  Trophy,
  Flame,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { GuideModal } from "./GuideModal";
import type { Project, Summary, Task, GamificationData } from "../types";

interface DashboardViewProps {
  onNavigateToTasks: (projectId?: number) => void;
  onNavigateToProjects: () => void;
  onNavigateToCalendar?: () => void;
  onNavigateToGamification?: () => void;
}

const pct = (d: number, t: number) => (t ? Math.round((d / t) * 100) : 0);

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateToTasks,
  onNavigateToProjects,
  onNavigateToCalendar,
  onNavigateToGamification,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [gamData, setGamData] = useState<GamificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const [showGuide, setShowGuide] = useState(false);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const [sendingSummary, setSendingSummary] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sumData, projData, taskData, gData] = await Promise.all([
        api<Summary>("/dashboard/summary"),
        api<Project[]>("/projects"),
        api<Task[]>("/tasks"),
        api<GamificationData>("/gamification/overview").catch(() => null),
      ]);
      setSummary(sumData);
      setProjects(projData);
      setTasks(taskData);
      if (gData) setGamData(gData);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    loadData();
  }, []);

  const toggleTaskStatus = async (taskId: number, currentStatus: string) => {
    const nextStatus = currentStatus === "Completed" ? "To Do" : "Completed";
    try {
      const res = await api<{ gamification?: any }>(`/tasks/${taskId}`, { method: "PATCH", body: { status: nextStatus } });
      if (res?.gamification && !res.gamification.alreadyAwarded) {
        toast.success(
          `Tugas selesai! +${res.gamification.totalEarnedXP} XP diperoleh!${
            res.gamification.leveledUp ? ` 🎉 Selamat, naik ke Level ${res.gamification.newLevel} (${res.gamification.levelDetails.title})!` : ""
          }`,
          "Misi Produktifa ✨"
        );
      } else {
        toast.success(
          nextStatus === "Completed" ? "Tugas berhasil diselesaikan!" : "Tugas dikembalikan ke antrean To Do.",
          "Status Diperbarui"
        );
      }
      await loadData();
    } catch (e) {
      toast.error((e as Error).message, "Gagal Mengubah Status");
    }
  };


  const handleSendTaskReminder = async (task: Task) => {
    if (sendingReminderId !== null) return;
    setSendingReminderId(task.id);
    try {
      const res = await api<{ message: string }>(`/tasks/${task.id}/remind`, { method: "POST" });
      toast.success(res.message || `Pengingat tugas "${task.title}" berhasil dikirim ke email!`, "Pengingat Email");
    } catch (e) {
      toast.error((e as Error).message, "Gagal Mengirim Pengingat");
    } finally {
      setSendingReminderId(null);
    }
  };

  const handleSendSummaryReminder = async () => {
    if (sendingSummary) return;
    setSendingSummary(true);
    try {
      const res = await api<{ message: string }>("/tasks/remind-summary", { method: "POST" });
      toast.success(res.message || "Ringkasan pengingat tugas berhasil dikirim ke email!", "Ringkasan Terkirim");
    } catch (e) {
      toast.error((e as Error).message, "Gagal Mengirim Ringkasan");
    } finally {
      setSendingSummary(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="py-20 text-center text-slate-500">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#0d3b66] border-t-transparent" />
        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Memuat ringkasan dashboard...
        </p>
      </div>
    );
  }

  const s = summary || { total: 0, todo: 0, in_progress: 0, completed: 0, overdue: 0 };
  const overallProgress = pct(s.completed, s.total);

  // Priority calculations
  const priorityCounts = {
    High: tasks.filter((t) => t.priority === "High").length,
    Medium: tasks.filter((t) => t.priority === "Medium").length,
    Low: tasks.filter((t) => t.priority === "Low").length,
  };

  // Urgent tasks queue (overdue first, then In Progress, max 4)
  const urgentTasks = [...tasks]
    .filter((t) => t.status !== "Completed")
    .sort((a, b) => {
      if (a.is_overdue && !b.is_overdue) return -1;
      if (!a.is_overdue && b.is_overdue) return 1;
      return 0;
    })
    .slice(0, 4);

  // SVG Donut Chart Parameters
  const radius = 68;
  const circumference = 2 * Math.PI * radius; // ~427.25

  const statusSegments = [
    { label: "Selesai", key: "completed", count: s.completed, color: "#059669" },
    { label: "Sedang Berjalan", key: "in_progress", count: s.in_progress, color: "#0284c7" },
    { label: "To Do", key: "todo", count: s.todo, color: "#64748b" },
    { label: "Terlambat", key: "overdue", count: s.overdue, color: "#dc2626" },
  ];

  let accumulatedLength = 0;
  const donutSegments = statusSegments.map((seg) => {
    const fraction = s.total > 0 ? seg.count / s.total : 0;
    const strokeDasharray = `${fraction * circumference} ${circumference}`;
    const strokeDashoffset = -accumulatedLength;
    accumulatedLength += fraction * circumference;
    return { ...seg, fraction, strokeDasharray, strokeDashoffset };
  });

  return (
    <div className="space-y-6">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0d3b66]">
            Selamat Datang, {user?.name.split(" ")[0]}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-xl">
            {s.total > 0 ? (
              <span>
                Tim Anda telah menyelesaikan{" "}
                <strong className="text-emerald-700 font-mono tabular-nums">{s.completed}</strong> dari{" "}
                <strong className="font-mono tabular-nums">{s.total}</strong> tugas terencana (
                <strong className="font-mono tabular-nums">{overallProgress}%</strong>).
              </span>
            ) : (
              <span>Mulai dengan membuat proyek baru untuk mengatur tugas tim.</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={handleSendSummaryReminder}
            disabled={sendingSummary || tasks.length === 0}
            className="btn-ghost text-xs py-2 px-2.5 text-[#0d3b66] hover:text-[#0284c7] border border-slate-300 hover:border-[#0284c7] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Kirim notifikasi pengingat semua tugas aktif ke email Anda"
          >
            {sendingSummary ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0284c7]" />
            ) : (
              <Mail className="h-3.5 w-3.5 text-[#0284c7]" />
            )}
            <span className="hidden sm:inline font-semibold">
              {sendingSummary ? "Mengirim..." : "Ingatkan via Email"}
            </span>
          </button>
          <button
            onClick={() => setShowGuide(true)}
            className="btn-ghost text-xs py-2 px-2.5 text-slate-600 hover:text-[#0d3b66] border border-slate-300 hover:border-[#0d3b66] flex items-center gap-1.5 cursor-pointer"
            title="Panduan Penggunaan Dashboard"
            aria-label="Panduan Penggunaan Dashboard"
          >
            <HelpCircle className="h-4 w-4 text-[#0284c7]" />
            <span className="hidden sm:inline font-semibold">Panduan</span>
          </button>
          {onNavigateToCalendar && (
            <button
              onClick={onNavigateToCalendar}
              className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5 text-slate-700 hover:text-[#0284c7]"
              title="Buka Kalender & Jadwal Deadline"
            >
              <Calendar className="h-3.5 w-3.5 text-[#0284c7]" />
              <span>Kalender</span>
            </button>
          )}
          <button
            onClick={onNavigateToProjects}
            className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <FolderKanban className="h-3.5 w-3.5 text-slate-700" />
            <span>Kelola Proyek</span>
          </button>
          <button
            onClick={() => onNavigateToTasks()}
            className="btn-accent text-xs py-2 px-3.5 flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Tambah Tugas</span>
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
          {err}
        </div>
      )}

      {/* Gamification Level & Quest Summary Widget */}
      {gamData?.profile && (
        <div className="rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50/70 via-orange-50/40 to-amber-50/60 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 border-2 border-amber-300 text-white flex items-center justify-center font-black text-sm shadow-xs shrink-0">
              Lv.{gamData.profile.level}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                  Misi Produktifa: Level {gamData.profile.level} ({gamData.profile.title})
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full border border-orange-200">
                  <Flame className="h-3 w-3 fill-orange-500 text-orange-500" />
                  <span>{gamData.profile.current_streak} Hari Streak</span>
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                <span className="font-mono font-bold text-amber-800">
                  {gamData.profile.total_xp.toLocaleString()} XP
                </span>
                <span>•</span>
                <span>
                  {gamData.profile.xp_in_level} / {gamData.profile.xp_needed} XP ke Level {gamData.profile.level + 1} ({gamData.profile.progress_percent}%)
                </span>
              </div>
              <div className="h-2 w-48 sm:w-64 bg-amber-200/70 rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full transition-all duration-300"
                  style={{ width: `${gamData.profile.progress_percent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
            {gamData.quests && (
              <div className="hidden lg:flex flex-col text-right text-xs">
                <span className="text-slate-500">Misi Harian</span>
                <span className="font-bold text-slate-800">
                  {gamData.quests.daily.filter((q) => q.is_claimed).length} / {gamData.quests.daily.length} Selesai
                </span>
              </div>
            )}
            {onNavigateToGamification && (
              <button
                onClick={onNavigateToGamification}
                className="btn-primary text-xs py-2 px-3.5 bg-[#0d3b66] hover:bg-[#124b80] text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Trophy className="h-3.5 w-3.5 text-amber-300" />
                <span>Buka Misi & Level</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Structured Metric Blocks */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Total Tasks */}
        <div className="card border-slate-300 bg-white">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Total Tugas
            </span>
            <ListTodo className="h-4 w-4 text-slate-500" />
          </div>
          <div className="text-3xl font-black text-[#0d3b66] font-mono tabular-nums">
            {s.total}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">
            Di {projects.length} proyek aktif
          </div>
        </div>

        {/* Completed */}
        <div className="card border-slate-300 bg-white">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Selesai
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-emerald-700 font-mono tabular-nums">
            {s.completed}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium font-mono tabular-nums">
            {overallProgress}% target tercapai
          </div>
        </div>

        {/* In Progress */}
        <div className="card border-slate-300 bg-white">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
              Sedang Berjalan
            </span>
            <Clock className="h-4 w-4 text-sky-600" />
          </div>
          <div className="text-3xl font-black text-sky-700 font-mono tabular-nums">
            {s.in_progress}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">
            Dalam tahap pengerjaan
          </div>
        </div>

        {/* Overdue */}
        <div className="card border-slate-300 bg-white">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
              Terlambat
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="text-3xl font-black text-rose-700 font-mono tabular-nums">
            {s.overdue}
          </div>
          <div className="text-[11px] text-rose-600 mt-1 font-medium">
            {s.overdue > 0 ? "Perlu perhatian segera" : "Semua sesuai jadwal"}
          </div>
        </div>
      </div>

      {/* Visual Analytics Grid: Donut + Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* GRAPH 1: Circular Progress & Status Distribution */}
        <div className="lg:col-span-5 card border-slate-300 bg-white space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-[#0d3b66]" />
              <h2 className="font-bold text-[#0d3b66] text-sm uppercase tracking-wide">
                Distribusi Status Tugas
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-mono tabular-nums font-semibold">
              {s.total} Tugas
            </span>
          </div>

          {s.total === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Belum ada data tugas untuk divisualisasikan.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Circular SVG Donut Chart */}
              <div className="relative flex items-center justify-center py-2">
                <svg className="w-44 h-44 transform -rotate-90" viewBox="0 0 180 180">
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    fill="transparent"
                    stroke="#f1f5f9"
                    strokeWidth="20"
                  />
                  {donutSegments.map((seg) => {
                    if (seg.count === 0) return null;
                    const isHovered = hoveredSegment === seg.key;
                    return (
                      <circle
                        key={seg.key}
                        cx="90"
                        cy="90"
                        r={radius}
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth={isHovered ? "23" : "20"}
                        strokeDasharray={seg.strokeDasharray}
                        strokeDashoffset={seg.strokeDashoffset}
                        className="transition-all duration-300 cursor-pointer"
                        onMouseEnter={() => setHoveredSegment(seg.key)}
                        onMouseLeave={() => setHoveredSegment(null)}
                      />
                    );
                  })}
                </svg>

                {/* Central Stat */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-[#0d3b66] font-mono tabular-nums">
                    {overallProgress}%
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Selesai
                  </span>
                </div>
              </div>

              {/* Status Breakdown Legend Grid */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                {statusSegments.map((seg) => {
                  const percentage = pct(seg.count, s.total);
                  const isHovered = hoveredSegment === seg.key;
                  return (
                    <div
                      key={seg.key}
                      onMouseEnter={() => setHoveredSegment(seg.key)}
                      onMouseLeave={() => setHoveredSegment(null)}
                      className={`flex flex-col p-2 rounded-sm border transition-colors cursor-pointer ${
                        isHovered
                          ? "border-slate-400 bg-slate-50"
                          : "border-slate-200 bg-white"
                      }`}
                      onClick={() => onNavigateToTasks()}
                      title={`Klik untuk melihat tugas ${seg.label}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="text-[11px] font-medium text-slate-600 truncate">
                          {seg.label}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between mt-1 font-mono tabular-nums">
                        <span className="text-sm font-black text-slate-800">
                          {seg.count}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500">
                          {percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* GRAPH 2: Comparative Progress Per Project + Priority Strip */}
        <div className="lg:col-span-7 card border-slate-300 bg-white space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-[#0d3b66]" />
              <h2 className="font-bold text-[#0d3b66] text-sm uppercase tracking-wide">
                Grafik Perbandingan Progres Proyek
              </h2>
            </div>
            <button
              onClick={onNavigateToProjects}
              className="text-xs text-[#0284c7] hover:text-[#0369a1] font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Semua ({projects.length})</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <FolderKanban className="mx-auto h-8 w-8 text-slate-300 mb-2" />
              <p className="text-xs">Belum ada proyek yang dibuat.</p>
              <button
                onClick={onNavigateToProjects}
                className="mt-3 btn text-xs py-1.5 px-3"
              >
                + Buat Proyek Pertama
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Scale reference line */}
              <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-400 border-b border-slate-100 pb-1">
                <span>0% Target</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100% Selesai</span>
              </div>

              {/* Project Progress Bars */}
              <div className="space-y-3.5">
                {projects.map((p) => {
                  const projectPct = pct(p.done_count, p.task_count);
                  return (
                    <div
                      key={p.id}
                      className="group cursor-pointer space-y-1.5"
                      onClick={() => onNavigateToTasks(p.id)}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 max-w-[70%]">
                          <span className="font-bold text-slate-900 truncate group-hover:text-[#0284c7] transition-colors">
                            {p.name}
                          </span>
                          {!p.is_owner && (
                            <span className="border border-slate-300 bg-slate-100 text-slate-600 px-1 py-0.2 text-[9px] font-semibold rounded-xs">
                              Dibagikan
                            </span>
                          )}
                        </div>
                        <div className="font-mono tabular-nums text-right">
                          <span className="font-bold text-slate-800">{projectPct}%</span>
                          <span className="text-slate-400 ml-1.5 text-[11px]">
                            ({p.done_count}/{p.task_count} tugas)
                          </span>
                        </div>
                      </div>

                      {/* Visual Bar Track */}
                      <div className="h-4 w-full bg-slate-100 rounded-sm border border-slate-200 overflow-hidden flex relative">
                        <div
                          className="h-full bg-emerald-600 transition-all duration-500 ease-out flex items-center justify-end pr-1.5 text-[10px] text-white font-bold font-mono"
                          style={{ width: `${projectPct}%` }}
                        >
                          {projectPct > 15 && `${projectPct}%`}
                        </div>
                        <div
                          className="h-full bg-slate-200/70"
                          style={{ width: `${100 - projectPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Priority Load Distribution Strip */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">
                  <span className="flex items-center gap-1.5">
                    <Tag className="h-3 w-3 text-slate-500" />
                    Beban Berdasarkan Prioritas Tugas
                  </span>
                  <span className="font-mono tabular-nums text-slate-500">
                    High: {priorityCounts.High} · Med: {priorityCounts.Medium} · Low: {priorityCounts.Low}
                  </span>
                </div>

                {s.total > 0 ? (
                  <div className="h-2.5 w-full bg-slate-100 rounded-sm overflow-hidden flex border border-slate-200">
                    <div
                      className="bg-rose-600 h-full transition-all"
                      style={{ width: `${(priorityCounts.High / s.total) * 100}%` }}
                      title={`Tinggi: ${priorityCounts.High} tugas`}
                    />
                    <div
                      className="bg-amber-500 h-full transition-all"
                      style={{ width: `${(priorityCounts.Medium / s.total) * 100}%` }}
                      title={`Sedang: ${priorityCounts.Medium} tugas`}
                    />
                    <div
                      className="bg-emerald-600 h-full transition-all"
                      style={{ width: `${(priorityCounts.Low / s.total) * 100}%` }}
                      title={`Rendah: ${priorityCounts.Low} tugas`}
                    />
                  </div>
                ) : (
                  <div className="h-2.5 w-full bg-slate-100 rounded-sm" />
                )}

                <div className="flex justify-between text-[10px] text-slate-500 font-medium mt-1.5">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-rose-600" /> High ({pct(priorityCounts.High, s.total)}%)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-amber-500" /> Medium ({pct(priorityCounts.Medium, s.total)}%)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-emerald-600" /> Low ({pct(priorityCounts.Low, s.total)}%)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ACTIONABLE TASK QUEUE: TUGAS YANG MEMERLUKAN TINDAKAN */}
      {urgentTasks.length > 0 && (
        <div className="card border-slate-300 bg-white space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#0284c7]" />
              <h2 className="font-bold text-[#0d3b66] text-sm uppercase tracking-wide">
                Tugas Yang Memerlukan Tindakan Tim
              </h2>
            </div>
            <button
              onClick={() => onNavigateToTasks()}
              className="text-xs text-[#0284c7] hover:text-[#0369a1] font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Buka Semua Tugas</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {urgentTasks.map((t) => {
              const project = projects.find((p) => p.id === t.project_id);
              return (
                <div
                  key={t.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      onClick={() => toggleTaskStatus(t.id, t.status)}
                      className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-sm border border-slate-400 bg-white hover:border-[#0d3b66] cursor-pointer"
                      title="Klik untuk menyelesaikan tugas"
                    >
                      {t.status === "Completed" && <Check className="h-3 w-3 text-emerald-600 stroke-[3]" />}
                    </button>
                    <div className="truncate">
                      <span className="font-bold text-slate-900 mr-2">{t.title}</span>
                      {project && (
                        <span className="text-slate-400 text-[11px]">
                          ({project.name})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {t.is_overdue && (
                      <span className="border border-rose-300 bg-rose-50 text-rose-800 px-1.5 py-0.5 text-[10px] font-bold rounded-xs uppercase">
                        Terlambat
                      </span>
                    )}
                    <span className="font-mono tabular-nums text-slate-500 text-[11px]">
                      {t.due_date ?? "Tanpa tenggat"}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded-xs ${
                        t.priority === "High"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : t.priority === "Medium"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {t.priority}
                    </span>
                    <button
                      onClick={() => handleSendTaskReminder(t)}
                      disabled={sendingReminderId === t.id}
                      className="p-1 rounded-sm text-slate-400 hover:text-[#0284c7] hover:bg-sky-50 border border-transparent hover:border-sky-200 cursor-pointer transition-colors"
                      title="Kirim pengingat tugas ini ke email Anda"
                    >
                      {sendingReminderId === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0284c7]" />
                      ) : (
                        <Mail className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Help & User Guide Modal */}
      <GuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        title="Panduan Penggunaan Dashboard"
        subtitle="Petunjuk membaca metrik performa, visualisasi grafik, dan antrean tugas tim"
        steps={[
          {
            title: "Pantau Statistik Tugas",
            desc: "Lihat total tugas aktif, tugas yang sudah selesai, tugas yang sedang berjalan, dan tugas yang melewati tenggat waktu (terlambat) secara langsung.",
          },
          {
            title: "Pahami Grafik Lingkaran Distribusi Status",
            desc: "Grafik lingkaran donat memperlihatkan persentase keseluruhan keberhasilan tim. Sorot atau klik segmen warna untuk menganalisis beban status.",
          },
          {
            title: "Bandingkan Kecepatan Progres Proyek",
            desc: "Grafik batang horizontal membandingkan tingkat penyelesaian antar proyek. Klik nama proyek untuk langsung membuka tugas-tugas di dalamnya.",
          },
          {
            title: "Tindakan Cepat pada Antrean Mendesak",
            desc: "Tugas mendesak dan yang mendekati batas tenggat muncul di daftar bawah. Cukup centang kotak di sisi kiri untuk menandai tugas telah selesai tanpa berpindah halaman.",
          },
        ]}
        tips={[
          "Gunakan tombol '+ Tambah Tugas' di pojok kanan atas untuk menambahkan item pekerjaan baru dengan cepat.",
          "Klik tombol 'Kelola Proyek' jika Anda ingin membuat ruang kerja tim baru atau mengundang rekan kerja.",
        ]}
      />
    </div>
  );
};
