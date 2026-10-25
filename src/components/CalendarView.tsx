import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Flame,
  FolderKanban,
  HelpCircle,
  ListTodo,
  Loader2,
  Mail,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { ConfirmModal } from "./ConfirmModal";
import {
  PRIORITIES,
  STATUSES,
  type Priority,
  type Project,
  type Status,
  type Task,
} from "../types";

const PCOLOR: Record<Priority, { text: string; bg: string; border: string }> = {
  Low: { text: "text-emerald-800", bg: "bg-emerald-50", border: "border-emerald-300" },
  Medium: { text: "text-amber-800", bg: "bg-amber-50", border: "border-amber-300" },
  High: { text: "text-rose-800", bg: "bg-rose-50", border: "border-rose-300" },
};

const SCOLOR: Record<Status, { text: string; bg: string; border: string }> = {
  "To Do": { text: "text-slate-700", bg: "bg-slate-100", border: "border-slate-300" },
  "In Progress": { text: "text-sky-800", bg: "bg-sky-50", border: "border-sky-300" },
  Completed: { text: "text-emerald-800", bg: "bg-emerald-50", border: "border-emerald-300" },
};

const DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

interface CalendarViewProps {
  onNavigateToTasks: (projectId?: number) => void;
  onNavigateToProjects: () => void;
}

type CalendarViewMode = "month" | "week" | "day";

type TaskFormState = {
  id?: number;
  project_id: number;
  assignee_id?: number | null;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  due_date: string;
};

// Helper to format Date object into YYYY-MM-DD in local time
function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Format YYYY-MM-DD into readable Indonesian date string
function formatIndonesianDate(dateStr: string, includeDayName = true): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  const dayName = DAY_NAMES[(dateObj.getDay() + 6) % 7];
  const monthName = MONTH_NAMES[m - 1];
  return includeDayName ? `${dayName}, ${d} ${monthName} ${y}` : `${d} ${monthName} ${y}`;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  onNavigateToTasks,
  onNavigateToProjects,
}) => {
  const toast = useToast();

  // Navigation state
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");

  // Filters
  const [filterProjectId, setFilterProjectId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  // Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  // Form / Modal states
  const [form, setForm] = useState<TaskFormState | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const [sendingSummary, setSendingSummary] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  const todayStr = useMemo(() => formatDateKey(new Date()), []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [projData, taskData] = await Promise.all([
        api<Project[]>("/projects"),
        api<Task[]>("/tasks"),
      ]);
      setProjects(projData);
      setTasks(taskData);
    } catch (e) {
      toast.error((e as Error).message, "Gagal Memuat Kalender");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Project map for quick lookup
  const projectMap = useMemo(() => {
    const map = new Map<number, Project>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterProjectId && String(t.project_id) !== filterProjectId) return false;
      if (filterStatus === "completed" && t.status !== "Completed") return false;
      if (filterStatus === "pending" && t.status === "Completed") return false;
      if (filterStatus === "overdue" && (!t.is_overdue || t.status === "Completed")) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      return true;
    });
  }, [tasks, filterProjectId, filterStatus, filterPriority]);

  // Tasks mapped by date string "YYYY-MM-DD"
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    filteredTasks.forEach((t) => {
      if (!t.due_date) return;
      if (!map[t.due_date]) {
        map[t.due_date] = [];
      }
      map[t.due_date].push(t);
    });
    return map;
  }, [filteredTasks]);

  // Tasks without due date
  const unscheduledTasks = useMemo(() => {
    return filteredTasks.filter((t) => !t.due_date);
  }, [filteredTasks]);

  // Workload and "Hari Paling Padat" (Busiest Day) detection
  const busiestDayInfo = useMemo(() => {
    let peakDate: string | null = null;
    let maxPendingCount = 0;
    let maxTotalCount = 0;

    Object.entries(tasksByDate).forEach(([dateStr, dayTasks]) => {
      const pendingCount = dayTasks.filter((t) => t.status !== "Completed").length;
      const totalCount = dayTasks.length;

      // Weight incomplete tasks higher for busy deadline calculation
      if (
        pendingCount > maxPendingCount ||
        (pendingCount === maxPendingCount && totalCount > maxTotalCount)
      ) {
        maxPendingCount = pendingCount;
        maxTotalCount = totalCount;
        peakDate = dateStr;
      }
    });

    if (!peakDate || maxTotalCount === 0) return null;

    return {
      date: peakDate,
      totalCount: maxTotalCount,
      pendingCount: maxPendingCount,
      completedCount: maxTotalCount - maxPendingCount,
    };
  }, [tasksByDate]);

  // Summary statistics for deadlines
  const stats = useMemo(() => {
    const totalScheduled = filteredTasks.filter((t) => t.due_date).length;
    const overdueCount = filteredTasks.filter((t) => t.is_overdue && t.status !== "Completed").length;

    // Upcoming in next 7 days
    const now = new Date();
    const inSevenDays = new Date();
    inSevenDays.setDate(now.getDate() + 7);
    const startStr = formatDateKey(now);
    const endStr = formatDateKey(inSevenDays);

    const upcomingCount = filteredTasks.filter((t) => {
      if (!t.due_date || t.status === "Completed") return false;
      return t.due_date >= startStr && t.due_date <= endStr;
    }).length;

    return {
      totalScheduled,
      overdueCount,
      upcomingCount,
      unscheduledCount: unscheduledTasks.length,
    };
  }, [filteredTasks, unscheduledTasks.length]);

  // Navigation handlers
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "month") {
        next.setMonth(next.getMonth() - 1);
      } else if (viewMode === "week") {
        next.setDate(next.getDate() - 7);
      } else {
        next.setDate(next.getDate() - 1);
      }
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "month") {
        next.setMonth(next.getMonth() + 1);
      } else if (viewMode === "week") {
        next.setDate(next.getDate() + 7);
      } else {
        next.setDate(next.getDate() + 1);
      }
      return next;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleJumpToDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (y && m && d) {
      setCurrentDate(new Date(y, m - 1, d));
      setViewMode("day");
    }
  };

  // Toggle task status
  const handleToggleTaskStatus = async (task: Task) => {
    const nextStatus: Status = task.status === "Completed" ? "To Do" : "Completed";
    try {
      await api(`/tasks/${task.id}`, { method: "PATCH", body: { status: nextStatus } });
      toast.success(
        nextStatus === "Completed"
          ? `Tugas "${task.title}" berhasil diselesaikan!`
          : `Tugas "${task.title}" dikembalikan ke antrean To Do.`,
        "Status Diperbarui"
      );
      await loadData();
    } catch (e) {
      toast.error((e as Error).message, "Gagal Mengubah Status");
    }
  };

  // Send single task reminder
  const handleSendTaskReminder = async (task: Task) => {
    if (sendingReminderId !== null) return;
    setSendingReminderId(task.id);
    try {
      const res = await api<{ message: string }>(`/tasks/${task.id}/remind`, { method: "POST" });
      toast.success(
        res.message || `Pengingat deadline untuk "${task.title}" berhasil dikirim ke email!`,
        "Pengingat Email"
      );
    } catch (e) {
      toast.error((e as Error).message, "Gagal Mengirim Pengingat");
    } finally {
      setSendingReminderId(null);
    }
  };

  // Send summary reminder
  const handleSendSummaryReminder = async () => {
    if (sendingSummary) return;
    setSendingSummary(true);
    try {
      const res = await api<{ message: string }>("/tasks/remind-summary", { method: "POST" });
      toast.success(
        res.message || "Jadwal dan ringkasan tugas berhasil dikirimkan ke email Anda!",
        "Ringkasan Kalender"
      );
    } catch (e) {
      toast.error((e as Error).message, "Gagal Mengirim Ringkasan");
    } finally {
      setSendingSummary(false);
    }
  };

  // Save Task (Create or Update)
  const handleSaveTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!form?.title?.trim()) return;
    if (!form.project_id) {
      toast.error("Silakan pilih proyek untuk tugas ini.", "Proyek Wajib Diisi");
      return;
    }

    const { id, ...rest } = form;
    const body = {
      ...rest,
      due_date: rest.due_date ? rest.due_date : null,
      assignee_id: rest.assignee_id ? Number(rest.assignee_id) : null,
    };

    setActionBusy(true);
    try {
      if (id) {
        await api(`/tasks/${id}`, { method: "PATCH", body });
        toast.success("Deadline & rincian tugas berhasil diperbarui!", "Tugas Diperbarui");
      } else {
        await api("/tasks", { method: "POST", body });
        toast.success("Tugas baru berhasil dijadwalkan!", "Tugas Dibuat");
      }
      setForm(null);
      await loadData();
    } catch (e) {
      toast.error((e as Error).message, "Gagal Menyimpan Tugas");
    } finally {
      setActionBusy(false);
    }
  };

  // Delete Task
  const handleDeleteTask = async () => {
    if (!deleteTaskId) return;
    setActionBusy(true);
    try {
      await api(`/tasks/${deleteTaskId}`, { method: "DELETE" });
      toast.success("Tugas berhasil dihapus dari jadwal.", "Tugas Dihapus");
      setDeleteTaskId(null);
      await loadData();
    } catch (e) {
      toast.error((e as Error).message, "Gagal Menghapus Tugas");
    } finally {
      setActionBusy(false);
    }
  };

  // Open modal to add task on specific date
  const openAddTaskForDate = (dateStr: string) => {
    setForm({
      project_id: projects[0]?.id || 0,
      assignee_id: null,
      title: "",
      description: "",
      status: "To Do",
      priority: "Medium",
      due_date: dateStr,
    });
  };

  // Open modal to edit existing task
  const openEditTask = (task: Task) => {
    setForm({
      id: task.id,
      project_id: task.project_id,
      assignee_id: task.assignee_id || null,
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      due_date: task.due_date || "",
    });
  };

  // Quick inline update deadline in daily view
  const handleUpdateDueDate = async (task: Task, newDate: string) => {
    try {
      await api(`/tasks/${task.id}`, {
        method: "PATCH",
        body: { due_date: newDate || null },
      });
      toast.success(
        newDate
          ? `Deadline dipindahkan ke ${formatIndonesianDate(newDate, false)}.`
          : "Deadline tugas dihapus.",
        "Deadline Diperbarui"
      );
      await loadData();
    } catch (e) {
      toast.error((e as Error).message, "Gagal Memperbarui Tanggal");
    }
  };

  // Monthly calendar calculation (Monday to Sunday)
  const monthGridDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of current month
    const firstDay = new Date(year, month, 1);
    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // Convert to Monday = 0, ..., Sunday = 6
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7;

    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: {
      date: Date;
      dateKey: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isBusiest: boolean;
    }[] = [];

    // Previous month padding days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, d);
      const key = formatDateKey(prevDate);
      days.push({
        date: prevDate,
        dateKey: key,
        dayNum: d,
        isCurrentMonth: false,
        isToday: key === todayStr,
        isBusiest: busiestDayInfo?.date === key,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const curDate = new Date(year, month, d);
      const key = formatDateKey(curDate);
      days.push({
        date: curDate,
        dateKey: key,
        dayNum: d,
        isCurrentMonth: true,
        isToday: key === todayStr,
        isBusiest: busiestDayInfo?.date === key,
      });
    }

    // Next month padding days to complete grid (multiples of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      const key = formatDateKey(nextDate);
      days.push({
        date: nextDate,
        dateKey: key,
        dayNum: d,
        isCurrentMonth: false,
        isToday: key === todayStr,
        isBusiest: busiestDayInfo?.date === key,
      });
    }

    return days;
  }, [currentDate, todayStr, busiestDayInfo]);

  // Weekly calendar days (7 days: Monday to Sunday)
  const weekDays = useMemo(() => {
    const cur = new Date(currentDate);
    const dayOfWeek = (cur.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(cur);
    monday.setDate(cur.getDate() - dayOfWeek);

    const days: {
      date: Date;
      dateKey: string;
      dayName: string;
      dayNum: number;
      isToday: boolean;
      isBusiest: boolean;
    }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = formatDateKey(d);
      days.push({
        date: d,
        dateKey: key,
        dayName: DAY_NAMES[i],
        dayNum: d.getDate(),
        isToday: key === todayStr,
        isBusiest: busiestDayInfo?.date === key,
      });
    }

    return days;
  }, [currentDate, todayStr, busiestDayInfo]);

  // Current formatted range title
  const currentPeriodLabel = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (viewMode === "month") {
      return `${MONTH_NAMES[month]} ${year}`;
    }

    if (viewMode === "week") {
      const first = weekDays[0];
      const last = weekDays[6];
      if (first && last) {
        if (first.date.getMonth() === last.date.getMonth()) {
          return `${first.dayNum} - ${last.dayNum} ${MONTH_NAMES[first.date.getMonth()]} ${year}`;
        }
        return `${first.dayNum} ${MONTH_NAMES[first.date.getMonth()]} - ${last.dayNum} ${
          MONTH_NAMES[last.date.getMonth()]
        } ${year}`;
      }
      return `${MONTH_NAMES[month]} ${year}`;
    }

    // Daily
    const dayKey = formatDateKey(currentDate);
    return formatIndonesianDate(dayKey, true);
  }, [currentDate, viewMode, weekDays]);

  const activeDailyTasks = useMemo(() => {
    const dayKey = formatDateKey(currentDate);
    return tasksByDate[dayKey] || [];
  }, [currentDate, tasksByDate]);

  const activeModalProject = form ? projectMap.get(form.project_id) : null;
  const activeModalAssignee = activeModalProject?.members?.find((m) => m.user_id === form?.assignee_id);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-lg bg-sky-100 p-2 text-[#0284c7]">
              <CalendarIcon className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0d3b66]">
                Kalender & Deadline
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Pantau tenggat waktu, jadwalkan tugas harian/mingguan/bulanan, dan cegah tugas terlewat.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Email Summary Reminder */}
          <button
            onClick={handleSendSummaryReminder}
            disabled={sendingSummary}
            className="btn-ghost flex items-center gap-1.5 text-xs py-2 px-3 text-slate-700 hover:text-sky-700 hover:border-sky-300"
            title="Kirim daftar jadwal dan deadline ke email saya"
          >
            {sendingSummary ? (
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            ) : (
              <Mail className="h-4 w-4 text-sky-600" />
            )}
            <span className="hidden sm:inline">Kirim ke Email</span>
          </button>

          {/* Guide Modal Trigger */}
          <button
            onClick={() => setShowGuideModal(true)}
            className="btn-ghost flex items-center gap-1 text-xs py-2 px-2.5 text-slate-500 hover:text-slate-800"
            title="Panduan fitur kalender"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* Add Task Button */}
          <button
            onClick={() => openAddTaskForDate(todayStr)}
            className="btn-primary flex items-center gap-1.5 text-xs py-2 px-3"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Tugas</span>
          </button>
        </div>
      </div>

      {/* Workload Alert: Hari Paling Padat Spotlight */}
      {busiestDayInfo && busiestDayInfo.totalCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 shadow-xs transition-all hover:border-amber-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-500 p-2 text-white shrink-0 mt-0.5 sm:mt-0 shadow-xs">
                <Flame className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded">
                    Hari Paling Padat Terdeteksi
                  </span>
                  <span className="font-semibold text-slate-900 text-sm sm:text-base">
                    {formatIndonesianDate(busiestDayInfo.date, true)}
                  </span>
                </div>
                <p className="text-xs text-amber-950/80 leading-relaxed">
                  Terdapat <strong className="text-amber-900 font-bold">{busiestDayInfo.totalCount} tugas</strong> terjadwal pada hari ini (
                  <strong className="text-amber-900 font-bold">{busiestDayInfo.pendingCount} deadline aktif</strong>
                  {busiestDayInfo.completedCount > 0 && `, ${busiestDayInfo.completedCount} selesai`}). Disarankan untuk mulai mencicil lebih awal atau mendistribusikan beban kerja ke hari lain.
                </p>
              </div>
            </div>

            <button
              onClick={() => handleJumpToDate(busiestDayInfo.date)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-semibold shadow-xs shrink-0 transition-colors"
            >
              <span>Buka Jadwal Hari Ini</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Total Terjadwal
            </span>
            <CalendarIcon className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {stats.totalScheduled}
            </span>
            <span className="text-xs text-slate-400">tugas</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Mendekati Deadline
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600 tracking-tight">
              {stats.upcomingCount}
            </span>
            <span className="text-xs text-slate-400">dlm 7 hari</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Terlambat (Overdue)
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600 tracking-tight">
              {stats.overdueCount}
            </span>
            <span className="text-xs text-slate-400">perlu tindakan</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Beban Terpadat
            </span>
            <Flame className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5 truncate">
            <span className="text-2xl font-black text-[#0d3b66] tracking-tight">
              {busiestDayInfo ? busiestDayInfo.totalCount : 0}
            </span>
            <span className="text-xs text-slate-500 truncate">
              {busiestDayInfo ? `tugas (${formatIndonesianDate(busiestDayInfo.date, false)})` : "Belum ada"}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation & View Mode Switcher Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-xs">
        {/* Date Navigator */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={handlePrev}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            title="Sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            onClick={handleToday}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Hari Ini
          </button>

          <button
            onClick={handleNext}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            title="Berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <h2 className="ml-2 text-sm sm:text-base font-bold text-[#0d3b66] tracking-tight">
            {currentPeriodLabel}
          </h2>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1 self-start sm:self-auto">
          <button
            onClick={() => setViewMode("month")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "month"
                ? "bg-[#0d3b66] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Bulanan
          </button>
          <button
            onClick={() => setViewMode("week")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "week"
                ? "bg-[#0d3b66] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Mingguan
          </button>
          <button
            onClick={() => setViewMode("day")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "day"
                ? "bg-[#0d3b66] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Harian
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-slate-500 uppercase tracking-wider text-[11px] mr-1">
          Filter:
        </span>

        {/* Project Selector */}
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          aria-label="Filter Proyek"
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 shadow-xs focus:border-sky-500 focus:outline-none"
        >
          <option value="">Semua Proyek ({projects.length})</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Status Selector */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filter Status"
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 shadow-xs focus:border-sky-500 focus:outline-none"
        >
          <option value="all">Semua Status</option>
          <option value="pending">Belum Selesai</option>
          <option value="completed">Sudah Selesai</option>
          <option value="overdue">Terlambat (Overdue)</option>
        </select>

        {/* Priority Selector */}
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          aria-label="Filter Prioritas"
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 shadow-xs focus:border-sky-500 focus:outline-none"
        >
          <option value="all">Semua Prioritas</option>
          <option value="High">Prioritas Tinggi</option>
          <option value="Medium">Prioritas Sedang</option>
          <option value="Low">Prioritas Rendah</option>
        </select>

        {(filterProjectId || filterStatus !== "all" || filterPriority !== "all") && (
          <button
            onClick={() => {
              setFilterProjectId("");
              setFilterStatus("all");
              setFilterPriority("all");
            }}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-800 ml-auto"
          >
            <X className="h-3.5 w-3.5" />
            <span>Reset Filter</span>
          </button>
        )}
      </div>

      {/* Main Calendar Views */}
      {loading ? (
        <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-7 w-7 animate-spin text-[#0d3b66]" />
            <span className="text-xs font-semibold text-slate-500">Memuat data kalender...</span>
          </div>
        </div>
      ) : (
        <>
          {/* 1. BULANAN (MONTHLY VIEW) */}
          {viewMode === "month" && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              {/* Day Headers (Senin - Minggu) */}
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-bold uppercase tracking-wider text-slate-600">
                {DAY_NAMES.map((name, idx) => (
                  <div
                    key={name}
                    className={`py-2.5 ${idx >= 5 ? "text-rose-600 bg-rose-50/30" : ""}`}
                  >
                    <span className="hidden sm:inline">{name}</span>
                    <span className="sm:hidden">{name.slice(0, 3)}</span>
                  </div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
                {monthGridDays.map((cell) => {
                  const dayTasks = tasksByDate[cell.dateKey] || [];
                  const pendingCount = dayTasks.filter((t) => t.status !== "Completed").length;
                  const hasOverdue = dayTasks.some((t) => t.is_overdue && t.status !== "Completed");

                  return (
                    <div
                      key={cell.dateKey}
                      onClick={() => handleJumpToDate(cell.dateKey)}
                      className={`min-h-[105px] sm:min-h-[125px] p-1.5 sm:p-2 transition-colors relative flex flex-col justify-between group cursor-pointer ${
                        !cell.isCurrentMonth
                          ? "bg-slate-50/60 text-slate-400"
                          : cell.isToday
                          ? "bg-sky-50/40"
                          : "hover:bg-slate-50/80 bg-white"
                      } ${cell.isBusiest ? "ring-2 ring-inset ring-amber-400/80" : ""}`}
                    >
                      {/* Top Header of Date Cell */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1">
                          <span
                            className={`inline-flex items-center justify-center text-xs font-bold rounded-md h-5 w-5 sm:h-6 sm:w-6 ${
                              cell.isToday
                                ? "bg-[#0d3b66] text-white"
                                : cell.isCurrentMonth
                                ? "text-slate-800"
                                : "text-slate-400"
                            }`}
                          >
                            {cell.dayNum}
                          </span>

                          {cell.isBusiest && (
                            <span
                              className="hidden sm:inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-900"
                              title="Hari Paling Padat"
                            >
                              <Flame className="h-2.5 w-2.5 text-amber-600 fill-amber-500" />
                              <span>Padat</span>
                            </span>
                          )}
                        </div>

                        {/* Task Count / Quick Add Button */}
                        <div className="flex items-center gap-1">
                          {dayTasks.length > 0 && (
                            <span
                              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                                hasOverdue
                                  ? "bg-rose-100 text-rose-700"
                                  : pendingCount === 0
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                              title={`${dayTasks.length} tugas (${pendingCount} belum selesai)`}
                            >
                              {dayTasks.length}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAddTaskForDate(cell.dateKey);
                            }}
                            className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-slate-200 text-slate-600 transition-opacity"
                            title="Tambah tugas di tanggal ini"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Tasks List inside cell */}
                      <div className="space-y-1 overflow-hidden flex-1">
                        {dayTasks.slice(0, 3).map((task) => {
                          const isDone = task.status === "Completed";
                          return (
                            <div
                              key={task.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditTask(task);
                              }}
                              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium truncate transition-all ${
                                isDone
                                  ? "bg-emerald-50 text-emerald-800 line-through opacity-75"
                                  : task.is_overdue
                                  ? "bg-rose-50 text-rose-800 border-l-2 border-rose-500 font-semibold"
                                  : task.priority === "High"
                                  ? "bg-rose-50 text-rose-800 border-l-2 border-rose-400"
                                  : "bg-slate-100 text-slate-800 border-l-2 border-[#0284c7]"
                              }`}
                              title={`${task.title} - ${task.status} (${task.priority})`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleTaskStatus(task);
                                }}
                                className="shrink-0 hover:scale-110 transition-transform"
                              >
                                {isDone ? (
                                  <Check className="h-3 w-3 text-emerald-600 stroke-[3]" />
                                ) : (
                                  <div className="h-2.5 w-2.5 rounded-xs border border-slate-400 hover:border-slate-600" />
                                )}
                              </button>
                              <span className="truncate">{task.title}</span>
                            </div>
                          );
                        })}

                        {dayTasks.length > 3 && (
                          <div className="text-[10px] font-bold text-sky-700 pl-1 hover:underline">
                            +{dayTasks.length - 3} tugas lagi...
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. MINGGUAN (WEEKLY VIEW) */}
          {viewMode === "week" && (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-1 md:grid-cols-7 gap-3 min-w-[760px] md:min-w-0">
                {weekDays.map((day) => {
                  const dayTasks = tasksByDate[day.dateKey] || [];
                  const pendingCount = dayTasks.filter((t) => t.status !== "Completed").length;
                  const completedCount = dayTasks.length - pendingCount;

                  return (
                    <div
                      key={day.dateKey}
                      className={`flex flex-col rounded-xl border bg-white shadow-xs transition-all ${
                        day.isBusiest
                          ? "border-amber-400 ring-2 ring-amber-400/40"
                          : day.isToday
                          ? "border-sky-300 bg-sky-50/20"
                          : "border-slate-200"
                      }`}
                    >
                      {/* Day Column Header */}
                      <div className="border-b border-slate-100 p-3 bg-slate-50/70 rounded-t-xl">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                            {day.dayName}
                          </span>
                          {day.isBusiest && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                              <Flame className="h-3 w-3 text-amber-600 fill-amber-500" />
                              <span>Padat</span>
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-baseline justify-between">
                          <div className="flex items-baseline gap-1.5">
                            <span
                              className={`text-xl font-black ${
                                day.isToday ? "text-[#0284c7]" : "text-slate-900"
                              }`}
                            >
                              {day.dayNum}
                            </span>
                            {day.isToday && (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-sky-700">
                                Hari Ini
                              </span>
                            )}
                          </div>

                          <span className="text-[11px] font-semibold text-slate-500">
                            {dayTasks.length} tugas
                          </span>
                        </div>

                        {/* Quick Day Progress Bar */}
                        {dayTasks.length > 0 && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{
                                  width: `${Math.round((completedCount / dayTasks.length) * 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                              {completedCount}/{dayTasks.length}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Day Tasks List */}
                      <div className="p-2 space-y-2 flex-1 min-h-[220px]">
                        {dayTasks.length === 0 ? (
                          <div className="flex h-32 flex-col items-center justify-center text-center p-3 text-slate-400">
                            <CalendarIcon className="h-6 w-6 stroke-1 text-slate-300 mb-1" />
                            <p className="text-[11px]">Belum ada tugas terjadwal</p>
                            <button
                              type="button"
                              onClick={() => openAddTaskForDate(day.dateKey)}
                              className="mt-2 text-xs font-semibold text-[#0284c7] hover:underline"
                            >
                              + Tambah
                            </button>
                          </div>
                        ) : (
                          dayTasks.map((task) => {
                            const isDone = task.status === "Completed";
                            const p = projectMap.get(task.project_id);

                            return (
                              <div
                                key={task.id}
                                className={`rounded-lg border p-2.5 transition-all shadow-2xs ${
                                  isDone
                                    ? "border-emerald-200 bg-emerald-50/50 opacity-80"
                                    : task.is_overdue
                                    ? "border-rose-300 bg-rose-50/40"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="flex items-start gap-2 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTaskStatus(task)}
                                      className="mt-0.5 shrink-0"
                                    >
                                      {isDone ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                      ) : (
                                        <div className="h-4 w-4 rounded-xs border-2 border-slate-300 hover:border-slate-500" />
                                      )}
                                    </button>
                                    <div className="min-w-0">
                                      <p
                                        onClick={() => openEditTask(task)}
                                        className={`text-xs font-bold cursor-pointer hover:text-sky-700 leading-snug line-clamp-2 ${
                                          isDone
                                            ? "line-through text-slate-500"
                                            : "text-slate-900"
                                        }`}
                                      >
                                        {task.title}
                                      </p>
                                      {p && (
                                        <p className="text-[10px] font-semibold text-slate-500 truncate mt-0.5">
                                          {p.name}
                                        </p>
                                      )}
                                      {task.assignee_name && (
                                        <p className="text-[10px] font-medium text-sky-800 flex items-center gap-1 mt-0.5 truncate">
                                          <User className="h-2.5 w-2.5 text-sky-600 shrink-0" />
                                          <span className="truncate">{task.assignee_name}</span>
                                          {task.assignee_role && (
                                            <span className="text-[9px] text-sky-700 bg-sky-100/80 px-1 rounded-xs shrink-0">
                                              ({task.assignee_role})
                                            </span>
                                          )}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold shrink-0 ${
                                      PCOLOR[task.priority].bg
                                    } ${PCOLOR[task.priority].text}`}
                                  >
                                    {task.priority}
                                  </span>
                                </div>

                                {/* Overdue / Reminder Actions */}
                                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                                  {task.is_overdue && !isDone ? (
                                    <span className="flex items-center gap-1 font-bold text-rose-700">
                                      <AlertTriangle className="h-3 w-3" />
                                      <span>Terlambat</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 capitalize">
                                      {task.status}
                                    </span>
                                  )}

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleSendTaskReminder(task)}
                                      disabled={sendingReminderId === task.id}
                                      className="text-slate-400 hover:text-sky-600 p-0.5 rounded"
                                      title="Kirim pengingat email"
                                    >
                                      {sendingReminderId === task.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin text-sky-600" />
                                      ) : (
                                        <Mail className="h-3 w-3" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openEditTask(task)}
                                      className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
                                      title="Edit tugas"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}

                        <button
                          type="button"
                          onClick={() => openAddTaskForDate(day.dateKey)}
                          className="w-full rounded-lg border border-dashed border-slate-200 py-1.5 text-center text-xs font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-800 transition-colors"
                        >
                          + Tambah Tugas
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. HARIAN (DAILY VIEW / AGENDA) */}
          {viewMode === "day" && (
            <div className="space-y-4">
              {/* Daily Banner Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[#0d3b66] px-2.5 py-1 text-xs font-bold text-white uppercase tracking-wider">
                        Agenda Harian
                      </span>
                      {formatDateKey(currentDate) === todayStr && (
                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                          Hari Ini
                        </span>
                      )}
                      {busiestDayInfo?.date === formatDateKey(currentDate) && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                          <Flame className="h-3.5 w-3.5 text-amber-600 fill-amber-500" />
                          <span>Hari Terpadat</span>
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                      {formatIndonesianDate(formatDateKey(currentDate), true)}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openAddTaskForDate(formatDateKey(currentDate))}
                      className="btn-primary text-xs py-2 px-3"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Tambah Tugas untuk Hari Ini</span>
                    </button>
                  </div>
                </div>

                {/* Day Workload stats bar */}
                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-slate-50">
                    <span className="text-slate-500 block">Total Tugas</span>
                    <strong className="text-base font-bold text-slate-900">
                      {activeDailyTasks.length}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-900">
                    <span className="text-emerald-700 block">Selesai</span>
                    <strong className="text-base font-bold">
                      {activeDailyTasks.filter((t) => t.status === "Completed").length}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-sky-50 text-sky-900">
                    <span className="text-sky-700 block">Belum Selesai</span>
                    <strong className="text-base font-bold">
                      {activeDailyTasks.filter((t) => t.status !== "Completed").length}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-50 text-rose-900">
                    <span className="text-rose-700 block">Terlambat</span>
                    <strong className="text-base font-bold">
                      {activeDailyTasks.filter((t) => t.is_overdue && t.status !== "Completed").length}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Tasks List for the Day */}
              {activeDailyTasks.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                  <CalendarIcon className="mx-auto h-12 w-12 text-slate-300 stroke-1" />
                  <h4 className="mt-3 text-base font-bold text-slate-800">
                    Tidak ada jadwal tugas untuk tanggal ini
                  </h4>
                  <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                    Manfaatkan hari ini untuk fokus pada tugas mendatang atau jadwalkan aktivitas baru.
                  </p>
                  <button
                    onClick={() => openAddTaskForDate(formatDateKey(currentDate))}
                    className="mt-4 btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Jadwalkan Tugas Pertama</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeDailyTasks.map((task) => {
                    const isDone = task.status === "Completed";
                    const project = projectMap.get(task.project_id);

                    return (
                      <div
                        key={task.id}
                        className={`rounded-xl border p-4 transition-all shadow-xs ${
                          isDone
                            ? "border-emerald-200 bg-emerald-50/40"
                            : task.is_overdue
                            ? "border-rose-300 bg-rose-50/30"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => handleToggleTaskStatus(task)}
                              className="mt-1 shrink-0 cursor-pointer"
                              title={isDone ? "Tandai belum selesai" : "Tandai selesai"}
                            >
                              {isDone ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                              ) : (
                                <div className="h-5 w-5 rounded-md border-2 border-slate-300 hover:border-sky-500 transition-colors" />
                              )}
                            </button>

                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4
                                  className={`text-sm sm:text-base font-bold ${
                                    isDone ? "line-through text-slate-500" : "text-slate-900"
                                  }`}
                                >
                                  {task.title}
                                </h4>

                                <span
                                  className={`rounded-md px-2 py-0.5 text-xs font-bold border ${
                                    PCOLOR[task.priority].bg
                                  } ${PCOLOR[task.priority].text} ${PCOLOR[task.priority].border}`}
                                >
                                  Prioritas {task.priority}
                                </span>

                                <span
                                  className={`rounded-md px-2 py-0.5 text-xs font-bold border ${
                                    SCOLOR[task.status].bg
                                  } ${SCOLOR[task.status].text} ${SCOLOR[task.status].border}`}
                                >
                                  {task.status}
                                </span>

                                {task.is_overdue && !isDone && (
                                  <span className="flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                                    <AlertTriangle className="h-3 w-3" />
                                    <span>Tenggat Terlewat</span>
                                  </span>
                                )}
                              </div>

                              {task.description && (
                                <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                                  {task.description}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
                                {project && (
                                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                                    <FolderKanban className="h-3.5 w-3.5 text-sky-600" />
                                    <span>Proyek: {project.name}</span>
                                  </span>
                                )}

                                {task.assignee_name ? (
                                  <span className="inline-flex items-center gap-1 font-semibold text-sky-900 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md text-xs">
                                    <User className="h-3.5 w-3.5 text-sky-600" />
                                    <span>{task.assignee_name}</span>
                                    {task.assignee_role && (
                                      <span className="text-[10px] text-sky-800 bg-sky-200/70 px-1.5 py-0.2 rounded-xs font-semibold">
                                        {task.assignee_role}
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-slate-400 text-xs italic">
                                    <User className="h-3.5 w-3.5 text-slate-300" />
                                    <span>Belum ditugaskan</span>
                                  </span>
                                )}

                                <div className="flex items-center gap-1.5">
                                  <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                                  <span>Ubah Deadline:</span>
                                  <input
                                    type="date"
                                    value={task.due_date || ""}
                                    onChange={(e) => handleUpdateDueDate(task, e.target.value)}
                                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-700 focus:border-sky-500 focus:outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1.5 self-end sm:self-start">
                            <button
                              type="button"
                              onClick={() => handleSendTaskReminder(task)}
                              disabled={sendingReminderId === task.id}
                              className="btn-ghost flex items-center gap-1 text-xs py-1.5 px-2.5 text-slate-600 hover:text-sky-700 hover:border-sky-300"
                              title="Kirim pengingat email"
                            >
                              {sendingReminderId === task.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
                              ) : (
                                <Mail className="h-3.5 w-3.5 text-sky-600" />
                              )}
                              <span className="hidden sm:inline">Ingatkan Email</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditTask(task)}
                              className="btn-ghost p-1.5 text-slate-600 hover:text-slate-900"
                              title="Edit tugas"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeleteTaskId(task.id)}
                              className="btn-ghost p-1.5 text-slate-600 hover:text-rose-700 hover:border-rose-300"
                              title="Hapus tugas"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Unscheduled Tasks Section */}
      {unscheduledTasks.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">
                Tugas Belum Dijadwalkan ({unscheduledTasks.length})
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              Beri deadline agar masuk dalam kalender dan pengingat
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {unscheduledTasks.slice(0, 6).map((task) => {
              const project = projectMap.get(task.project_id);
              return (
                <div
                  key={task.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="text-xs font-bold text-slate-800 line-clamp-1">{task.title}</p>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        PCOLOR[task.priority].bg
                      } ${PCOLOR[task.priority].text}`}
                    >
                      {task.priority}
                    </span>
                  </div>

                  {project && (
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                      {project.name}
                    </p>
                  )}

                  {task.assignee_name && (
                    <p className="text-[10px] text-sky-800 font-medium flex items-center gap-1 mt-0.5 truncate">
                      <User className="h-2.5 w-2.5 text-sky-600 shrink-0" />
                      <span className="truncate">{task.assignee_name}</span>
                      {task.assignee_role && <span className="text-[9px] text-sky-700">({task.assignee_role})</span>}
                    </p>
                  )}

                  <div className="mt-2 flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
                    <button
                      type="button"
                      onClick={() => handleUpdateDueDate(task, todayStr)}
                      className="text-[11px] font-semibold text-sky-700 hover:underline"
                    >
                      + Jadwalkan Hari Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditTask(task)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Task Create / Edit Modal */}
      {form && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setForm(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-[#0d3b66]">
                {form.id ? "Edit Tugas & Deadline" : "Jadwalkan Tugas Baru"}
              </h3>
              <button
                onClick={() => setForm(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Judul Tugas <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Siapkan materi presentasi proyek"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Deskripsi
                </label>
                <textarea
                  rows={2}
                  placeholder="Catatan detail atau instruksi pelaksanaan..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Proyek <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={form.project_id}
                    onChange={(e) => {
                      const newPid = Number(e.target.value);
                      setForm({ ...form, project_id: newPid, assignee_id: null });
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none bg-white"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Penanggung Jawab (Assignee)
                  </label>
                  <select
                    value={form.assignee_id ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        assignee_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none bg-white"
                  >
                    <option value="">-- Belum Ditugaskan --</option>
                    {activeModalProject?.members?.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name} {m.role_name ? `(${m.role_name})` : ""} {m.is_owner ? "· Pemilik" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Jobdesk preview if assignee is selected */}
              {activeModalAssignee && (
                <div className="p-2.5 rounded-lg bg-sky-50/90 border border-sky-200 text-xs text-sky-950 flex items-start gap-2.5">
                  <Briefcase className="h-4 w-4 text-[#0284c7] shrink-0 mt-0.5" />
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-bold flex items-center gap-1.5 flex-wrap">
                      <span>Tanggung Jawab (Jobdesk) {activeModalAssignee.name}</span>
                      {activeModalAssignee.role_name && (
                        <span className="text-[10px] bg-sky-200/80 text-sky-900 px-1.5 py-0.2 rounded-xs font-semibold">
                          {activeModalAssignee.role_name}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-sky-900/80 leading-relaxed">
                      {activeModalAssignee.jobdesk || "Belum ada catatan jobdesk khusus untuk anggota ini."}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Tenggat Waktu (Deadline)
                </label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Prioritas
                  </label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none bg-white"
                  >
                    {PRIORITIES.map((pr) => (
                      <option key={pr} value={pr}>
                        {pr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none bg-white"
                  >
                    {STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  {actionBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{form.id ? "Simpan Perubahan" : "Jadwalkan Tugas"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteTaskId !== null}
        title="Hapus Tugas dari Kalender?"
        message="Tugas yang dihapus tidak dapat dipulihkan. Apakah Anda yakin ingin menghapus tugas ini?"
        confirmLabel="Ya, Hapus Tugas"
        cancelLabel="Batal"
        isDestructive={true}
        isLoading={actionBusy}
        onConfirm={handleDeleteTask}
        onCancel={() => setDeleteTaskId(null)}
      />

      {/* Guide Modal for Calendar & Deadlines */}
      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-[#0284c7]" />
                <h3 className="text-base font-bold text-[#0d3b66]">
                  Panduan Kalender & Deadline
                </h3>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs text-slate-600 leading-relaxed">
              <div className="rounded-lg bg-sky-50 p-3 text-sky-900 space-y-1">
                <strong className="font-bold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-sky-600" />
                  Manfaat Kalender & Deadline
                </strong>
                <p>
                  Mengurangi risiko tugas terlewat, memvisualisasikan tenggat waktu, dan memudahkan
                  perencanaan harian, mingguan, serta bulanan.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-amber-600" />
                  Hari Paling Padat (Workload Heatmap)
                </h4>
                <p>
                  Sistem otomatis menghitung kepadatan tugas untuk mendeteksi tanggal dengan beban kerja
                  tertinggi. Segera selesaikan atau cicil tugas pada hari tersebut agar deadline tidak menumpuk.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-sky-600" />
                  Pengingat Email Otomatis
                </h4>
                <p>
                  Klik ikon surat pada tugas atau tombol "Kirim ke Email" di bagian atas untuk
                  mengirimkan notifikasi tenggat waktu langsung ke inbox Anda.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">Navigasi 3 Tampilan</h4>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>Bulanan:</strong> Ikhtisar seluruh bulan dengan indikator visual tugas.
                  </li>
                  <li>
                    <strong>Mingguan:</strong> Rincian per hari Senin–Minggu dengan progress bar.
                  </li>
                  <li>
                    <strong>Harian:</strong> Agenda lengkap per jam/hari dengan kemampuan langsung
                    mengubah deadline.
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-3 flex justify-end">
              <button
                onClick={() => setShowGuideModal(false)}
                className="btn-primary text-xs py-2 px-4"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
