import React, { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Calendar,
  Check,
  Columns,
  Edit2,
  FolderKanban,
  HelpCircle,
  Kanban,
  List,
  Loader2,
  Mail,
  Plus,
  Search,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { GuideModal } from "./GuideModal";
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
  "Completed": { text: "text-emerald-800", bg: "bg-emerald-50", border: "border-emerald-300" },
};

interface TasksViewProps {
  initialProjectId?: number | null;
  onClearInitialProject?: () => void;
  onNavigateToProjects: () => void;
  onNavigateToCalendar?: () => void;
}

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

export const TasksView: React.FC<TasksViewProps> = ({
  initialProjectId,
  onClearInitialProject,
  onNavigateToProjects,
  onNavigateToCalendar,
}) => {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [f, setF] = useState({
    q: "",
    status: "",
    priority: "",
    project: initialProjectId ? String(initialProjectId) : "",
    assignee: "",
  });
  const [form, setForm] = useState<TaskFormState | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Email reminders & Confirm modal state
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const [sendingSummary, setSendingSummary] = useState(false);

  useEffect(() => {
    if (initialProjectId) {
      setF((prev) => ({ ...prev, project: String(initialProjectId) }));
    }
  }, [initialProjectId]);

  const loadProjects = useCallback(async () => {
    try {
      const data = await api<Project[]>("/projects");
      setProjects(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    const qs = new URLSearchParams();
    if (f.q) qs.set("q", f.q);
    if (f.status === "late") qs.set("overdue", "true");
    else if (f.status) qs.set("status", f.status);
    if (f.priority) qs.set("priority", f.priority);
    if (f.project) qs.set("project_id", f.project);
    if (f.assignee) qs.set("assignee_id", f.assignee);

    try {
      setLoading(true);
      const data = await api<Task[]>(`/tasks?${qs.toString()}`);
      setTasks(data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [f]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTasks().catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [loadTasks]);

  async function run(fn: () => Promise<unknown>) {
    setErr("");
    setActionBusy(true);
    try {
      await fn();
      await loadTasks();
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      toast.error(msg, "Gagal Melakukan Aksi");
    } finally {
      setActionBusy(false);
    }
  }

  function saveTask(e: FormEvent) {
    e.preventDefault();
    if (!form?.title?.trim()) return;
    const { id, ...rest } = form;
    const body = {
      ...rest,
      due_date: rest.due_date ? rest.due_date : null,
      assignee_id: rest.assignee_id ? Number(rest.assignee_id) : null,
    };

    run(async () => {
      if (id) {
        await api(`/tasks/${id}`, { method: "PATCH", body });
        toast.success("Rincian tugas berhasil diperbarui!", "Tugas Diperbarui");
      } else {
        await api("/tasks", { method: "POST", body });
        toast.success("Tugas baru berhasil ditambahkan!", "Tugas Dibuat");
      }
      setForm(null);
    });
  }

  const handleDeleteTask = async () => {
    if (!deleteTaskId) return;
    const id = deleteTaskId;
    await run(async () => {
      await api(`/tasks/${id}`, { method: "DELETE" });
      toast.success("Tugas berhasil dihapus dari sistem.", "Tugas Dihapus");
    });
    setDeleteTaskId(null);
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
      toast.success(res.message || "Ringkasan tugas berhasil dikirim ke email!", "Ringkasan Terkirim");
    } catch (e) {
      toast.error((e as Error).message, "Gagal Mengirim Ringkasan");
    } finally {
      setSendingSummary(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: number, newStatus: string) => {
    await run(async () => {
      const res = await api<{ gamification?: any }>(`/tasks/${taskId}`, {
        method: "PATCH",
        body: { status: newStatus },
      });
      if (res?.gamification && !res.gamification.alreadyAwarded) {
        toast.success(
          `Tugas selesai! +${res.gamification.totalEarnedXP} XP diperoleh!${
            res.gamification.leveledUp
              ? ` 🎉 Selamat, naik ke Level ${res.gamification.newLevel} (${res.gamification.levelDetails.title})!`
              : ""
          }`,
          "Misi Produktifa ✨"
        );
      } else {
        toast.success(`Status tugas diubah menjadi "${newStatus}"`, "Status Tugas");
      }
    });
  };

  const blankForm = (initialStatus: Status = "To Do"): TaskFormState => ({

    project_id: Number(f.project) || projects[0]?.id || 0,
    assignee_id: f.assignee ? Number(f.assignee) : null,
    title: "",
    description: "",
    status: initialStatus,
    priority: "Medium",
    due_date: "",
  });

  const getProjectName = (id: number) =>
    projects.find((p) => p.id === id)?.name ?? "Proyek";

  // Filter project and members for assignee filter
  const filterProject = f.project ? projects.find((p) => String(p.id) === f.project) : null;
  const filterMembers = React.useMemo(() => {
    if (filterProject) {
      return filterProject.members || [];
    }
    const map = new Map<number, { user_id: number; name: string; role_name?: string }>();
    projects.forEach((p) => {
      p.members?.forEach((m) => {
        if (!map.has(m.user_id)) {
          map.set(m.user_id, { user_id: m.user_id, name: m.name, role_name: m.role_name });
        }
      });
    });
    return Array.from(map.values());
  }, [projects, filterProject]);

  // Active form project & assignee details for jobdesk preview
  const activeProject = form ? projects.find((p) => p.id === form.project_id) : null;
  const activeAssignee = activeProject?.members?.find((m) => m.user_id === form?.assignee_id);

  // Filter tasks by status for Kanban Board columns
  const todoTasks = tasks.filter((t) => t.status === "To Do");
  const inProgressTasks = tasks.filter((t) => t.status === "In Progress");
  const completedTasks = tasks.filter((t) => t.status === "Completed");

  return (
    <div className="space-y-6">
      {/* Editorial Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            <span>Manajemen Tugas</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0d3b66]">
            Daftar & Lacak Tugas
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Kelola alur kerja harian tim, alihkan status, dan lacak deadline dengan presisi.
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
            title="Panduan Halaman Tugas"
            aria-label="Panduan Halaman Tugas"
          >
            <HelpCircle className="h-4 w-4 text-[#0284c7]" />
            <span className="hidden sm:inline font-semibold">Panduan</span>
          </button>

          {/* View Mode Switcher: List vs Lacak Tugas vs Kalender */}
          <div className="flex items-center bg-slate-200/80 p-0.5 rounded-md border border-slate-300">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-sm transition-colors cursor-pointer ${
                viewMode === "list"
                  ? "bg-white text-[#0d3b66] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Tampilan Daftar (List)"
            >
              <List className="h-3.5 w-3.5" />
              <span>Daftar</span>
            </button>
            <button
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-sm transition-colors cursor-pointer ${
                viewMode === "board"
                  ? "bg-white text-[#0d3b66] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Tampilan Lacak Tugas"
            >
              <Columns className="h-3.5 w-3.5" />
              <span>Lacak Tugas</span>
            </button>
            {onNavigateToCalendar && (
              <button
                onClick={onNavigateToCalendar}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-sm text-slate-600 hover:text-[#0d3b66] transition-colors cursor-pointer"
                title="Buka Tampilan Kalender & Deadline"
              >
                <Calendar className="h-3.5 w-3.5 text-[#0284c7]" />
                <span>Kalender</span>
              </button>
            )}
          </div>

          <button
            className="btn-accent flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-xs"
            disabled={!projects.length}
            onClick={() => {
              setForm(blankForm());
              setErr("");
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Tugas Baru</span>
          </button>
        </div>
      </div>

      {!projects.length && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>Buat proyek terlebih dahulu sebelum menambah tugas tim.</span>
          </div>
          <button
            onClick={onNavigateToProjects}
            className="btn text-xs py-1 px-3 bg-amber-700 hover:bg-amber-800"
          >
            Buat Proyek
          </button>
        </div>
      )}

      {err && (
        <div className="flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{err}</span>
        </div>
      )}

      {/* Flat UI Filter Box */}
      <div className="card border-slate-300 bg-white space-y-3 !p-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="input pl-9 text-xs sm:text-sm"
            placeholder="Cari tugas (judul atau deskripsi)..."
            value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })}
          />
          {f.q && (
            <button
              onClick={() => setF({ ...f, q: "" })}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Status:
            </label>
            <select
              className="input text-xs py-1.5"
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
            >
              <option value="">Semua Status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="late">Terlambat (Overdue)</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Prioritas:
            </label>
            <select
              className="input text-xs py-1.5"
              value={f.priority}
              onChange={(e) => setF({ ...f, priority: e.target.value })}
            >
              <option value="">Semua Prioritas</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Project Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Proyek:
            </label>
            <select
              className="input text-xs py-1.5"
              value={f.project}
              onChange={(e) => {
                setF({ ...f, project: e.target.value });
                if (onClearInitialProject) onClearInitialProject();
              }}
            >
              <option value="">Semua Proyek</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Penanggung Jawab:
            </label>
            <select
              className="input text-xs py-1.5"
              value={f.assignee}
              onChange={(e) => setF({ ...f, assignee: e.target.value })}
            >
              <option value="">Semua Anggota</option>
              {filterMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name} {m.role_name ? `(${m.role_name})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Flat Create / Edit Task Form */}
      {form && (
        <form onSubmit={saveTask} className="card border-slate-300 bg-white space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <h2 className="font-bold text-[#0d3b66] text-sm flex items-center gap-2 uppercase tracking-wide">
              <Plus className="h-4 w-4 text-[#0284c7]" />
              {form.id ? "Edit Rincian Tugas" : "Tambah Tugas Baru"}
            </h2>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Judul Tugas *
              </label>
              <input
                className="input"
                placeholder="Contoh: Implementasi fitur otentikasi login & register"
                required
                maxLength={160}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Deskripsi
              </label>
              <textarea
                className="input"
                rows={2}
                placeholder="Rincian persyaratan, lingkup tugas, atau catatan penting..."
                maxLength={2000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pilih Proyek *
              </label>
              <select
                className="input"
                required
                value={form.project_id}
                onChange={(e) => {
                  const newPid = Number(e.target.value);
                  setForm({ ...form, project_id: newPid, assignee_id: null });
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Penanggung Jawab (Assignee)
              </label>
              <select
                className="input"
                value={form.assignee_id ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    assignee_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">-- Belum Ditugaskan --</option>
                {activeProject?.members?.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name} {m.role_name ? `(${m.role_name})` : ""} {m.is_owner ? "· Pemilik" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Jobdesk details preview if assignee is selected */}
            {activeAssignee && (
              <div className="sm:col-span-2 p-2.5 rounded-md bg-sky-50/90 border border-sky-200 text-xs text-sky-950 flex items-start gap-2.5">
                <Briefcase className="h-4 w-4 text-[#0284c7] shrink-0 mt-0.5" />
                <div className="space-y-0.5 min-w-0">
                  <div className="font-bold flex items-center gap-1.5 flex-wrap">
                    <span>Tanggung Jawab (Jobdesk) {activeAssignee.name}</span>
                    {activeAssignee.role_name && (
                      <span className="text-[10px] bg-sky-200/80 text-sky-900 px-1.5 py-0.2 rounded-xs font-semibold">
                        {activeAssignee.role_name}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-sky-900/80 leading-relaxed">
                    {activeAssignee.jobdesk || "Belum ada catatan jobdesk khusus untuk anggota ini."}
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tenggat Waktu (Due Date)
              </label>
              <input
                className="input font-mono tabular-nums text-xs"
                type="date"
                value={form.due_date ?? ""}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Status
              </label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tingkat Prioritas
              </label>
              <select
                className="input"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
            <button type="submit" disabled={actionBusy} className="btn text-xs py-2 px-4 flex items-center gap-1.5">
              {actionBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />}
              <span>{actionBusy ? "Menyimpan..." : form.id ? "Perbarui Tugas" : "Simpan Tugas"}</span>
            </button>
            <button
              type="button"
              disabled={actionBusy}
              className="btn-ghost text-xs py-2 px-3"
              onClick={() => setForm(null)}
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {/* VIEW MODE 1: LIST VIEW */}
      {viewMode === "list" && (
        <div className="card border-slate-300 bg-white divide-y divide-slate-200 !p-0 overflow-hidden shadow-xs">
          {loading && tasks.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-xs font-semibold uppercase tracking-wider">
              Memuat daftar tugas...
            </div>
          )}

          {!loading && tasks.length === 0 && (
            <div className="p-10 text-center text-slate-500 space-y-2">
              <div className="text-sm font-bold text-slate-700">
                Tidak ada tugas yang cocok
              </div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {f.q || f.status || f.priority || f.project
                  ? "Sesuaikan kata kunci pencarian atau setel ulang filter di atas."
                  : "Belum ada tugas yang dibuat untuk kriteria ini."}
              </p>
            </div>
          )}

          {tasks.map((t) => {
            const isDone = t.status === "Completed";
            const priorityStyle = PCOLOR[t.priority] || PCOLOR.Medium;
            const statusStyle = SCOLOR[t.status] || SCOLOR["To Do"];

            return (
              <div
                key={t.id}
                className={`p-4 transition-colors hover:bg-slate-50 space-y-2.5 ${
                  isDone ? "bg-slate-50/50" : ""
                }`}
              >
                {/* Title & Inline Status Dropdown */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleUpdateTaskStatus(t.id, isDone ? "To Do" : "Completed")}
                      className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-sm border transition-colors cursor-pointer ${
                        isDone
                          ? "bg-emerald-600 border-emerald-700 text-white"
                          : "border-slate-400 hover:border-[#0d3b66] bg-white"
                      }`}
                      title={isDone ? "Tandai belum selesai" : "Tandai selesai"}
                    >
                      {isDone && <Check className="h-3 w-3 stroke-[3]" />}
                    </button>

                    <div className="text-left">
                      <span
                        className={`font-bold text-sm leading-snug ${
                          isDone ? "text-slate-400 line-through" : "text-slate-900"
                        }`}
                      >
                        {t.title}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto pl-7 sm:pl-0">
                    <select
                      className={`text-xs font-bold rounded-sm border px-2 py-1 outline-none transition-colors cursor-pointer ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                      value={t.status}
                      onChange={(e) => handleUpdateTaskStatus(t.id, e.target.value)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>


                {/* Description */}
                {t.description && (
                  <p className="text-xs text-slate-600 pl-7 leading-relaxed">
                    {t.description}
                  </p>
                )}

                {/* Meta & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pl-7 pt-1 text-xs text-slate-500">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-bold border ${priorityStyle.bg} ${priorityStyle.text} ${priorityStyle.border}`}
                    >
                      <Tag className="h-3 w-3" />
                      <span>{t.priority}</span>
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                      <span>{getProjectName(t.project_id)}</span>
                    </span>

                    {/* Penanggung Jawab / Assignee badge */}
                    {t.assignee_name ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-sm border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-900"
                        title={t.assignee_role ? `Peran: ${t.assignee_role}` : "Penanggung jawab"}
                      >
                        <User className="h-3 w-3 text-sky-600" />
                        <span className="font-semibold">{t.assignee_name}</span>
                        {t.assignee_role && (
                          <span className="text-[10px] text-sky-800 bg-sky-200/60 px-1 py-0.2 rounded-xs font-semibold">
                            {t.assignee_role}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-dashed border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-400">
                        <User className="h-3 w-3 text-slate-300" />
                        <span>Belum ditugaskan</span>
                      </span>
                    )}

                    <span
                      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-mono tabular-nums ${
                        t.is_overdue
                          ? "bg-rose-50 text-rose-800 border border-rose-300 font-bold"
                          : "text-slate-500 border border-transparent"
                      }`}
                    >
                      {t.is_overdue ? (
                        <AlertTriangle className="h-3 w-3 text-rose-600" />
                      ) : (
                        <Calendar className="h-3 w-3 text-slate-400" />
                      )}
                      <span>{t.due_date ?? "Tanpa tenggat"}</span>
                      {t.is_overdue && (
                        <span className="ml-1 uppercase tracking-wider text-[10px] text-rose-700 font-extrabold">
                          · Terlambat
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 ml-auto">
                    {/* Send Email Reminder Button */}
                    <button
                      type="button"
                      disabled={sendingReminderId === t.id}
                      onClick={() => handleSendTaskReminder(t)}
                      className="btn-ghost text-xs py-1 px-2 text-[#0284c7] hover:border-[#0284c7] flex items-center gap-1 cursor-pointer"
                      title="Kirim pengingat tugas ini ke email Anda"
                    >
                      {sendingReminderId === t.id ? (
                        <Loader2 className="h-3 w-3 animate-spin text-[#0284c7]" />
                      ) : (
                        <Mail className="h-3 w-3" />
                      )}
                      <span className="hidden sm:inline">Ingatkan</span>
                    </button>

                    <button
                      className="btn-ghost text-xs py-1 px-2 text-slate-700"
                      onClick={() =>
                        setForm({
                          id: t.id,
                          project_id: t.project_id,
                          assignee_id: t.assignee_id || null,
                          title: t.title,
                          description: t.description || "",
                          status: t.status,
                          priority: t.priority,
                          due_date: t.due_date ?? "",
                        })
                      }
                      title="Edit rincian tugas"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span className="hidden sm:inline ml-1">Edit</span>
                    </button>
                    <button
                      className="btn-danger text-xs py-1 px-2"
                      onClick={() => setDeleteTaskId(t.id)}
                      title="Hapus tugas"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span className="hidden sm:inline ml-1">Hapus</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE 2: KANBAN BOARD VIEW */}
      {viewMode === "board" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {/* COLUMN 1: TO DO */}
          <div className="card border-slate-300 bg-slate-100/60 !p-3 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-xs bg-slate-500" />
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Belum Mulai (To Do)
                </h3>
              </div>
              <span className="font-mono tabular-nums text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-sm px-1.5 py-0.2">
                {todoTasks.length}
              </span>
            </div>

            <div className="space-y-2.5 min-h-[160px]">
              {todoTasks.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Tidak ada tugas di kolom ini.
                </div>
              )}

              {todoTasks.map((t) => (
                <div
                  key={t.id}
                  className="card border-slate-300 bg-white !p-3.5 space-y-2 hover:border-slate-400 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-slate-900 text-xs leading-snug">
                      {t.title}
                    </h4>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-xs border shrink-0 ${
                        PCOLOR[t.priority].bg
                      } ${PCOLOR[t.priority].text} ${PCOLOR[t.priority].border}`}
                    >
                      {t.priority}
                    </span>
                  </div>

                  {t.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-2">
                      {t.description}
                    </p>
                  )}

                  <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 font-mono tabular-nums">
                    <span className="text-slate-600 font-semibold truncate max-w-[110px]">
                      {getProjectName(t.project_id)}
                    </span>
                    <span className={t.is_overdue ? "text-rose-600 font-bold" : ""}>
                      {t.due_date ?? "No due date"}
                    </span>
                  </div>

                  {/* Assignee & Role */}
                  <div className="flex items-center gap-1 text-[11px]">
                    {t.assignee_name ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-sky-50 text-sky-900 border border-sky-200/80 text-[10px] max-w-full truncate font-medium">
                        <User className="h-2.5 w-2.5 text-sky-600 shrink-0" />
                        <span className="truncate">{t.assignee_name}</span>
                        {t.assignee_role && (
                          <span className="text-sky-800 font-semibold text-[9px] shrink-0">
                            · {t.assignee_role}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Belum ditugaskan</span>
                    )}
                  </div>

                  <div className="pt-1 flex items-center justify-between gap-1 border-t border-slate-100">
                    <button
                      onClick={() =>
                        run(async () => {
                          await api(`/tasks/${t.id}`, { method: "PATCH", body: { status: "In Progress" } });
                          toast.success("Tugas dipindahkan ke Sedang Berjalan!", "Status Tugas");
                        })
                      }
                      className="text-[11px] text-sky-700 font-bold hover:underline cursor-pointer"
                    >
                      Mulai Kerjakan →
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSendTaskReminder(t)}
                        disabled={sendingReminderId === t.id}
                        className="text-slate-400 hover:text-[#0284c7] p-0.5 cursor-pointer"
                        title="Kirim pengingat ke email"
                      >
                        {sendingReminderId === t.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-[#0284c7]" />
                        ) : (
                          <Mail className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        onClick={() => setForm({ ...t, assignee_id: t.assignee_id || null, due_date: t.due_date ?? "" })}
                        className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                        title="Edit tugas"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setDeleteTaskId(t.id)}
                        className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                        title="Hapus tugas"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setForm(blankForm("To Do"))}
              className="w-full py-1.5 text-xs text-slate-600 font-semibold hover:text-[#0d3b66] border border-dashed border-slate-300 rounded-sm hover:border-slate-400 flex items-center justify-center gap-1 cursor-pointer bg-white/70"
            >
              <Plus className="h-3 w-3" />
              <span>Tambah Tugas</span>
            </button>
          </div>

          {/* COLUMN 2: IN PROGRESS */}
          <div className="card border-slate-300 bg-sky-50/40 !p-3 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-sky-200">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#0284c7]" />
                <h3 className="font-bold text-[#0d3b66] text-xs uppercase tracking-wider">
                  Sedang Berjalan (In Progress)
                </h3>
              </div>
              <span className="font-mono tabular-nums text-xs font-bold text-[#0284c7] bg-white border border-sky-200 rounded-sm px-1.5 py-0.2">
                {inProgressTasks.length}
              </span>
            </div>

            <div className="space-y-2.5 min-h-[160px]">
              {inProgressTasks.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Tidak ada tugas aktif berjalan.
                </div>
              )}

              {inProgressTasks.map((t) => (
                <div
                  key={t.id}
                  className="card border-slate-300 bg-white !p-3.5 space-y-2 hover:border-sky-300 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-slate-900 text-xs leading-snug">
                      {t.title}
                    </h4>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-xs border shrink-0 ${
                        PCOLOR[t.priority].bg
                      } ${PCOLOR[t.priority].text} ${PCOLOR[t.priority].border}`}
                    >
                      {t.priority}
                    </span>
                  </div>

                  {t.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-2">
                      {t.description}
                    </p>
                  )}

                  <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 font-mono tabular-nums">
                    <span className="text-slate-600 font-semibold truncate max-w-[110px]">
                      {getProjectName(t.project_id)}
                    </span>
                    <span className={t.is_overdue ? "text-rose-600 font-bold" : ""}>
                      {t.due_date ?? "No due date"}
                    </span>
                  </div>

                  {/* Assignee & Role */}
                  <div className="flex items-center gap-1 text-[11px]">
                    {t.assignee_name ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-sky-50 text-sky-900 border border-sky-200/80 text-[10px] max-w-full truncate font-medium">
                        <User className="h-2.5 w-2.5 text-sky-600 shrink-0" />
                        <span className="truncate">{t.assignee_name}</span>
                        {t.assignee_role && (
                          <span className="text-sky-800 font-semibold text-[9px] shrink-0">
                            · {t.assignee_role}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Belum ditugaskan</span>
                    )}
                  </div>

                  <div className="pt-1 flex items-center justify-between gap-1 border-t border-slate-100">
                    <button
                      onClick={() => handleUpdateTaskStatus(t.id, "Completed")}
                      className="text-[11px] text-emerald-700 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Check className="h-3 w-3" />
                      <span>Selesaikan</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSendTaskReminder(t)}
                        disabled={sendingReminderId === t.id}
                        className="text-slate-400 hover:text-[#0284c7] p-0.5 cursor-pointer"
                        title="Kirim pengingat ke email"
                      >
                        {sendingReminderId === t.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-[#0284c7]" />
                        ) : (
                          <Mail className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        onClick={() => setForm({ ...t, assignee_id: t.assignee_id || null, due_date: t.due_date ?? "" })}
                        className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                        title="Edit tugas"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setDeleteTaskId(t.id)}
                        className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                        title="Hapus tugas"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setForm(blankForm("In Progress"))}
              className="w-full py-1.5 text-xs text-sky-800 font-semibold hover:text-[#0d3b66] border border-dashed border-sky-300 rounded-sm hover:border-sky-400 flex items-center justify-center gap-1 cursor-pointer bg-white/70"
            >
              <Plus className="h-3 w-3" />
              <span>Tambah Tugas</span>
            </button>
          </div>

          {/* COLUMN 3: COMPLETED */}
          <div className="card border-slate-300 bg-emerald-50/30 !p-3 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
                <h3 className="font-bold text-emerald-900 text-xs uppercase tracking-wider">
                  Selesai (Completed)
                </h3>
              </div>
              <span className="font-mono tabular-nums text-xs font-bold text-emerald-700 bg-white border border-emerald-200 rounded-sm px-1.5 py-0.2">
                {completedTasks.length}
              </span>
            </div>

            <div className="space-y-2.5 min-h-[160px]">
              {completedTasks.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Belum ada tugas selesai.
                </div>
              )}

              {completedTasks.map((t) => (
                <div
                  key={t.id}
                  className="card border-slate-200 bg-white/90 !p-3.5 space-y-2 hover:border-emerald-300 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-slate-400 line-through text-xs leading-snug">
                      {t.title}
                    </h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-xs border shrink-0 bg-slate-100 text-slate-500 border-slate-200">
                      {t.priority}
                    </span>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 font-mono tabular-nums">
                    <span className="truncate max-w-[110px]">{getProjectName(t.project_id)}</span>
                    <span>{t.due_date ?? "Tanpa tenggat"}</span>
                  </div>

                  {/* Assignee & Role */}
                  <div className="flex items-center gap-1 text-[11px]">
                    {t.assignee_name ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-slate-100 text-slate-600 border border-slate-200 text-[10px] max-w-full truncate font-medium">
                        <User className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                        <span className="truncate">{t.assignee_name}</span>
                        {t.assignee_role && (
                          <span className="text-slate-500 font-semibold text-[9px] shrink-0">
                            · {t.assignee_role}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Belum ditugaskan</span>
                    )}
                  </div>

                  <div className="pt-1 flex items-center justify-between gap-1 border-t border-slate-100">
                    <button
                      onClick={() =>
                        run(async () => {
                          await api(`/tasks/${t.id}`, { method: "PATCH", body: { status: "In Progress" } });
                          toast.success("Tugas dikembalikan ke Sedang Berjalan!", "Status Tugas");
                        })
                      }
                      className="text-[11px] text-slate-500 font-semibold hover:underline cursor-pointer"
                    >
                      Kembalikan ke Proses
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSendTaskReminder(t)}
                        disabled={sendingReminderId === t.id}
                        className="text-slate-400 hover:text-[#0284c7] p-0.5 cursor-pointer"
                        title="Kirim pengingat ke email"
                      >
                        {sendingReminderId === t.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-[#0284c7]" />
                        ) : (
                          <Mail className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        onClick={() => setForm({ ...t, assignee_id: t.assignee_id || null, due_date: t.due_date ?? "" })}
                        className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                        title="Edit tugas"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setDeleteTaskId(t.id)}
                        className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                        title="Hapus tugas"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setForm(blankForm("Completed"))}
              className="w-full py-1.5 text-xs text-emerald-800 font-semibold hover:text-[#0d3b66] border border-dashed border-emerald-300 rounded-sm hover:border-emerald-400 flex items-center justify-center gap-1 cursor-pointer bg-white/70"
            >
              <Plus className="h-3 w-3" />
              <span>Tambah Tugas</span>
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteTaskId !== null}
        title="Hapus Tugas"
        message="Apakah Anda yakin ingin menghapus tugas ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus Tugas"
        cancelLabel="Batal"
        isLoading={actionBusy}
        onConfirm={handleDeleteTask}
        onCancel={() => setDeleteTaskId(null)}
      />

      {/* Help & User Guide Modal */}
      <GuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        title="Panduan Halaman Tugas"
        subtitle="Petunjuk membuat tugas, menyaring data, mengubah status, dan melacak deadline"
        steps={[
          {
            title: "Buat Tugas Baru dan Tetapkan Prioritas",
            desc: "Klik '+ Tugas Baru'. Masukkan judul tugas, pilih proyek terkait, tentukan prioritas (Low, Medium, High), serta batas tenggat waktu penyelesaian (due date).",
          },
          {
            title: "Gunakan Mode Tampilan 'Daftar' atau 'Lacak Tugas'",
            desc: "Pilih mode 'Daftar' untuk evaluasi komprehensif baris per baris dengan rincian lengkap, atau beralih ke 'Lacak Tugas' untuk alur kerja visual berbasis kolom status.",
          },
          {
            title: "Pembaruan Status yang Fleksibel",
            desc: "Di mode Daftar, ubah status menggunakan menu dropdown atau centang checkbox untuk menyelesaikan tugas. Di mode Lacak Tugas, klik tombol aksi 'Mulai Kerja' atau 'Selesaikan' langsung pada kartu.",
          },
          {
            title: "Pencarian dan Filter Cepat",
            desc: "Cari tugas lewat kolom pencarian instan atau saring berdasarkan Proyek, Status, Prioritas, dan Penanggung Jawab. Pilih filter status 'Terlambat' untuk memprioritaskan tugas yang melewati deadline.",
          },
          {
            title: "Tugaskan ke Anggota Berdasarkan Peran & Jobdesk",
            desc: "Pilih penanggung jawab dari daftar anggota proyek. Anda dapat meninjau peran (Role) dan rincian tanggung jawab (Jobdesk) anggota langsung saat membuat atau mengedit tugas agar pekerjaan terdistribusi secara terorganisir.",
          },
        ]}
        tips={[
          "Lencana merah 'Terlambat' muncul otomatis saat tanggal tenggat telah lewat namun status belum diselesaikan.",
          "Gunakan tombol 'Ingatkan via Email' untuk mengirim ringkasan atau detail tugas langsung ke inbox email Anda.",
          "Filter daftar tugas berdasarkan 'Penanggung Jawab' untuk memantau progres beban kerja setiap anggota tim secara spesifik.",
        ]}
      />
    </div>
  );
};
