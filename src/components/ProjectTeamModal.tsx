import React, { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Check,
  CheckCircle2,
  Clock,
  Edit2,
  FolderKanban,
  Layers,
  Loader2,
  Mail,
  Plus,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { ConfirmModal } from "./ConfirmModal";
import type {
  MemberProgressItem,
  Project,
  ProjectMember,
  ProjectRole,
  Task,
} from "../types";

interface ProjectTeamModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onProjectUpdated: () => void;
  onNavigateToTasks?: (projectId: number) => void;
}

const PRESET_ROLE_COLORS = [
  "#0d3b66", // Navy
  "#0284c7", // Sky
  "#7c3aed", // Violet
  "#059669", // Emerald
  "#d97706", // Amber
  "#dc2626", // Rose
  "#475569", // Slate
];

const DEFAULT_ROLE_SUGGESTIONS = [
  {
    name: "Project Manager",
    jobdesk: "Menentukan arah proyek, timeline, koordinasi antar anggota, dan evaluasi hasil.",
    color: "#0d3b66",
  },
  {
    name: "Designer",
    jobdesk: "Membuat logo, poster promosi, desain media sosial, dan materi visual UI/UX.",
    color: "#7c3aed",
  },
  {
    name: "Developer",
    jobdesk: "Mengembangkan fitur aplikasi, integrasi backend API, dan perbaikan bug.",
    color: "#0284c7",
  },
  {
    name: "Marketing",
    jobdesk: "Menyusun strategi promosi produk, materi rilis publik, dan riset pasar.",
    color: "#059669",
  },
  {
    name: "Finance",
    jobdesk: "Mengelola alokasi anggaran operasional proyek dan laporan biaya.",
    color: "#d97706",
  },
];

export const ProjectTeamModal: React.FC<ProjectTeamModalProps> = ({
  project,
  isOpen,
  onClose,
  onProjectUpdated,
  onNavigateToTasks,
}) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"members" | "roles" | "progress" | "invite">("members");

  // Member editing state
  const [editingMember, setEditingMember] = useState<ProjectMember | null>(null);
  const [editRoleName, setEditRoleName] = useState("");
  const [editJobdesk, setEditJobdesk] = useState("");

  // Role creation / editing state
  const [roles, setRoles] = useState<ProjectRole[]>(project.roles || []);
  const [editingRole, setEditingRole] = useState<Partial<ProjectRole> | null>(null);

  // Invite member state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleName, setInviteRoleName] = useState("Designer");
  const [inviteJobdesk, setInviteJobdesk] = useState(
    "Membuat logo, poster promosi, desain media sosial, dan materi visual UI/UX."
  );

  // Member progress tracking state
  const [progressList, setProgressList] = useState<MemberProgressItem[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(false);

  // Action busy indicator
  const [actionBusy, setActionBusy] = useState(false);

  // Confirm delete/remove states
  const [removeMemberTarget, setRemoveMemberTarget] = useState<ProjectMember | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<ProjectRole | null>(null);

  // Load roles
  const loadRoles = async () => {
    try {
      const data = await api<ProjectRole[]>(`/projects/${project.id}/roles`);
      setRoles(data);
    } catch (e) {
      console.error(e);
    }
  };

  // Load member progress
  const loadMemberProgress = async () => {
    try {
      setLoadingProgress(true);
      const data = await api<MemberProgressItem[]>(`/projects/${project.id}/member-progress`);
      setProgressList(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProgress(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRoles();
      if (activeTab === "progress") {
        loadMemberProgress();
      }
    }
  }, [isOpen, activeTab, project.id]);

  if (!isOpen) return null;

  const getInitials = (name?: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  // 1. Save Member Role & Jobdesk
  const handleSaveMemberRoleAndJobdesk = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setActionBusy(true);

    try {
      if (editingMember.is_owner) {
        // Update owner role & jobdesk
        await api(`/projects/${project.id}/owner-role`, {
          method: "PATCH",
          body: {
            role_name: editRoleName.trim(),
            jobdesk: editJobdesk.trim(),
          },
        });
      } else {
        // Update member role & jobdesk
        await api(`/projects/${project.id}/members/${editingMember.user_id}`, {
          method: "PATCH",
          body: {
            role_name: editRoleName.trim(),
            jobdesk: editJobdesk.trim(),
          },
        });
      }

      toast.success(
        `Role & Jobdesk untuk ${editingMember.name} berhasil diperbarui!`,
        "Tanggung Jawab Diperbarui"
      );
      setEditingMember(null);
      onProjectUpdated();
      if (activeTab === "progress") loadMemberProgress();
    } catch (e) {
      toast.error((e as Error).message, "Gagal Menyimpan");
    } finally {
      setActionBusy(false);
    }
  };

  // 2. Invite New Member with Role & Jobdesk
  const handleInviteMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setActionBusy(true);

    try {
      await api(`/projects/${project.id}/members`, {
        method: "POST",
        body: {
          email: inviteEmail.trim(),
          role_name: inviteRoleName.trim(),
          jobdesk: inviteJobdesk.trim(),
        },
      });

      toast.success(
        `Undangan berhasil dikirim ke ${inviteEmail} dengan Role ${inviteRoleName}!`,
        "Anggota Ditambahkan"
      );
      setInviteEmail("");
      onProjectUpdated();
      setActiveTab("members");
    } catch (e) {
      toast.error((e as Error).message, "Gagal Menambahkan Anggota");
    } finally {
      setActionBusy(false);
    }
  };

  // 3. Remove Member
  const handleConfirmRemoveMember = async () => {
    if (!removeMemberTarget) return;
    setActionBusy(true);

    try {
      await api(`/projects/${project.id}/members/${removeMemberTarget.user_id}`, {
        method: "DELETE",
      });
      toast.info(`Anggota "${removeMemberTarget.name}" telah dikeluarkan dari proyek.`, "Anggota Dikeluarkan");
      setRemoveMemberTarget(null);
      onProjectUpdated();
      if (activeTab === "progress") loadMemberProgress();
    } catch (e) {
      toast.error((e as Error).message, "Gagal Mengeluarkan Anggota");
    } finally {
      setActionBusy(false);
    }
  };

  // 4. Save Custom Role
  const handleSaveRole = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingRole?.name?.trim()) return;
    setActionBusy(true);

    try {
      if (editingRole.id) {
        await api(`/projects/${project.id}/roles/${editingRole.id}`, {
          method: "PATCH",
          body: {
            name: editingRole.name.trim(),
            description: editingRole.description || "",
            color: editingRole.color || "#0284c7",
          },
        });
        toast.success("Role kustom berhasil diperbarui!", "Role Diperbarui");
      } else {
        await api(`/projects/${project.id}/roles`, {
          method: "POST",
          body: {
            name: editingRole.name.trim(),
            description: editingRole.description || "",
            color: editingRole.color || "#0284c7",
          },
        });
        toast.success("Role kustom baru berhasil dibuat!", "Role Ditambahkan");
      }
      setEditingRole(null);
      loadRoles();
      onProjectUpdated();
    } catch (e) {
      toast.error((e as Error).message, "Gagal Menyimpan Role");
    } finally {
      setActionBusy(false);
    }
  };

  // 5. Delete Custom Role
  const handleConfirmDeleteRole = async () => {
    if (!deleteRoleTarget) return;
    setActionBusy(true);

    try {
      await api(`/projects/${project.id}/roles/${deleteRoleTarget.id}`, {
        method: "DELETE",
      });
      toast.success(`Role "${deleteRoleTarget.name}" berhasil dihapus.`, "Role Dihapus");
      setDeleteRoleTarget(null);
      loadRoles();
      onProjectUpdated();
    } catch (e) {
      toast.error((e as Error).message, "Gagal Menghapus Role");
    } finally {
      setActionBusy(false);
    }
  };

  // Helper when selecting preset suggestion for invitation
  const selectRoleSuggestionForInvite = (roleName: string) => {
    setInviteRoleName(roleName);
    const found = DEFAULT_ROLE_SUGGESTIONS.find((r) => r.name === roleName);
    if (found) {
      setInviteJobdesk(found.jobdesk);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center rounded-lg bg-sky-100 p-2 text-[#0284c7]">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-[#0d3b66] tracking-tight">
                  Peran & Jobdesk Tim Proyek
                </h2>
                <p className="text-xs text-slate-500">
                  Proyek: <strong className="text-slate-800">{project.name}</strong> • Atur peran, tanggung jawab umum, dan pantau progres kerja anggota.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 pt-3 pb-2 text-xs font-semibold overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab("members")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "members"
                ? "bg-[#0d3b66] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Anggota & Jobdesk ({project.members.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("progress")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "progress"
                ? "bg-[#0d3b66] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>Pantau Progres Anggota</span>
          </button>

          <button
            onClick={() => setActiveTab("roles")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "roles"
                ? "bg-[#0d3b66] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Kelola Role Kustom ({roles.length})</span>
          </button>

          {project.is_owner && (
            <button
              onClick={() => setActiveTab("invite")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-all cursor-pointer whitespace-nowrap ml-auto ${
                activeTab === "invite"
                  ? "bg-[#0284c7] text-white shadow-xs"
                  : "bg-sky-50 text-[#0284c7] hover:bg-sky-100"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              <span>+ Undang Anggota</span>
            </button>
          )}
        </div>

        {/* Modal Body / Tab Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* TAB 1: ANGGOTA & JOBDESK LIST */}
          {activeTab === "members" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-[#0284c7] shrink-0 mt-0.5" />
                <p>
                  <strong>Role</strong> menentukan fungsi anggota dalam proyek (misal: <em>Project Manager</em>, <em>Designer</em>, <em>Developer</em>), sedangkan <strong>Jobdesk</strong> menjelaskan tanggung jawab umum anggota agar pembagian tugas berjalan terarah.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {project.members.map((m) => {
                  const isFinished = (m.done_count || 0) === (m.task_count || 0) && (m.task_count || 0) > 0;
                  const pctDone = m.task_count ? Math.round(((m.done_count || 0) / m.task_count) * 100) : 0;

                  return (
                    <div
                      key={m.id || m.user_id}
                      className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition-all shadow-xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`h-10 w-10 rounded-lg text-white font-mono font-bold text-xs flex items-center justify-center shrink-0 border shadow-xs ${
                              m.is_owner ? "bg-[#0d3b66] border-[#092b4c]" : "bg-sky-700 border-sky-800"
                            }`}
                          >
                            {getInitials(m.name)}
                          </div>

                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-slate-900 text-sm">{m.name}</h3>
                              {m.is_owner ? (
                                <span className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-[#0d3b66]">
                                  <UserCheck className="h-3 w-3" />
                                  <span>Pemilik Proyek</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                  <span>Anggota Tim</span>
                                </span>
                              )}

                              {/* Role Badge */}
                              <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-[11px] font-bold text-sky-800">
                                <Briefcase className="h-3 w-3 text-sky-600" />
                                <span>{m.role_name || "Anggota Tim"}</span>
                              </span>
                            </div>

                            <p className="text-slate-500 font-mono text-xs">{m.email}</p>
                          </div>
                        </div>

                        {/* Edit Role & Jobdesk Button (if owner or current user) */}
                        {project.is_owner && (
                          <div className="flex items-center gap-1.5 self-end sm:self-start">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMember(m);
                                setEditRoleName(m.role_name || "Designer");
                                setEditJobdesk(
                                  m.jobdesk ||
                                    "Menjalankan tugas proyek sesuai penugasan dari pengelola proyek."
                                );
                              }}
                              className="btn-ghost flex items-center gap-1 text-xs py-1.5 px-2.5 text-slate-700 hover:text-sky-700 hover:border-sky-300"
                              title="Ubah Role & Deskripsi Jobdesk"
                            >
                              <Edit2 className="h-3 w-3 text-sky-600" />
                              <span>Ubah Role & Jobdesk</span>
                            </button>

                            {!m.is_owner && (
                              <button
                                type="button"
                                onClick={() => setRemoveMemberTarget(m)}
                                className="btn-ghost p-1.5 text-slate-400 hover:text-rose-600 hover:border-rose-300"
                                title="Keluarkan anggota dari proyek"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Jobdesk Description Card */}
                      <div className="rounded-lg bg-slate-50/80 border border-slate-200/80 p-3 text-xs space-y-1">
                        <div className="flex items-center gap-1 font-bold uppercase tracking-wider text-[10px] text-slate-500">
                          <Briefcase className="h-3 w-3 text-slate-400" />
                          <span>Tanggung Jawab Utama (Jobdesk):</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed">
                          {m.jobdesk || (
                            <span className="italic text-slate-400">
                              Belum ada deskripsi jobdesk. Klik "Ubah Role & Jobdesk" untuk menambahkan.
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Mini Task Progress for this Member */}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 font-medium">
                        <span className="text-slate-500">
                          Penugasan Tugas: <strong>{m.task_count || 0} tugas</strong> (
                          {m.done_count || 0} selesai)
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={`h-full ${isFinished ? "bg-emerald-500" : "bg-[#0284c7]"}`}
                              style={{ width: `${pctDone}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-bold text-slate-700">
                            {pctDone}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PANTAU PROGRES ANGGOTA */}
          {activeTab === "progress" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-xs text-sky-950 flex items-start gap-2.5">
                <TrendingUp className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
                <p>
                  Pantau beban kerja dan progres penyelesaian tugas setiap anggota secara transparan sesuai dengan fungsi dan jobdesk masing-masing.
                </p>
              </div>

              {loadingProgress ? (
                <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0d3b66]" />
                  <span>Memuat ringkasan progres anggota...</span>
                </div>
              ) : progressList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Belum ada data anggota untuk dipantau.
                </div>
              ) : (
                <div className="space-y-4">
                  {progressList.map((item) => {
                    const pct = item.total_tasks > 0 ? Math.round((item.completed_tasks / item.total_tasks) * 100) : 0;

                    return (
                      <div
                        key={item.user_id}
                        className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-[#0d3b66] text-white font-mono font-bold text-xs flex items-center justify-center">
                              {getInitials(item.name)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-slate-900 text-sm">{item.name}</h4>
                                <span className="rounded bg-sky-50 border border-sky-200 px-1.5 py-0.2 text-[10px] font-bold text-sky-800">
                                  {item.role_name}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 font-mono">{item.email}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            <div className="text-right">
                              <span className="text-xs font-bold text-slate-800">
                                {item.completed_tasks} / {item.total_tasks} Selesai
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                {pct}% Tingkat Penyelesaian
                              </span>
                            </div>
                            <div className="w-16 h-2 rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Workload badges */}
                        <div className="grid grid-cols-4 gap-2 text-center text-xs">
                          <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                            <span className="text-[10px] text-slate-500 block">Total Ditugaskan</span>
                            <strong className="text-sm font-bold text-slate-800">
                              {item.total_tasks}
                            </strong>
                          </div>
                          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-100">
                            <span className="text-[10px] text-emerald-700 block">Selesai</span>
                            <strong className="text-sm font-bold">{item.completed_tasks}</strong>
                          </div>
                          <div className="p-1.5 rounded-lg bg-sky-50 text-sky-900 border border-sky-100">
                            <span className="text-[10px] text-sky-700 block">Berjalan</span>
                            <strong className="text-sm font-bold">{item.in_progress_tasks}</strong>
                          </div>
                          <div className="p-1.5 rounded-lg bg-rose-50 text-rose-900 border border-rose-100">
                            <span className="text-[10px] text-rose-700 block">Terlambat</span>
                            <strong className="text-sm font-bold">{item.overdue_tasks}</strong>
                          </div>
                        </div>

                        {/* List of Tasks Assigned to this Member */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                            Daftar Tugas Spesifik:
                          </span>
                          {item.tasks.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-1">
                              Belum ada tugas yang ditugaskan kepada anggota ini.
                            </p>
                          ) : (
                            <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                              {item.tasks.map((task) => (
                                <div
                                  key={task.id}
                                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5 text-xs"
                                >
                                  <div className="flex items-center gap-2 truncate mr-2">
                                    {task.status === "Completed" ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                    ) : task.is_overdue ? (
                                      <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                    ) : (
                                      <Clock className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                                    )}
                                    <span
                                      className={`truncate font-medium ${
                                        task.status === "Completed"
                                          ? "line-through text-slate-400"
                                          : "text-slate-800"
                                      }`}
                                    >
                                      {task.title}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                                    <span className="font-mono text-slate-400">
                                      {task.due_date || "Tanpa tenggat"}
                                    </span>
                                    <span
                                      className={`rounded px-1.5 py-0.2 font-bold ${
                                        task.status === "Completed"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : task.status === "In Progress"
                                          ? "bg-sky-100 text-sky-800"
                                          : "bg-slate-200 text-slate-700"
                                      }`}
                                    >
                                      {task.status}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: KELOLA ROLE KUSTOM */}
          {activeTab === "roles" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Role & Jabatan Proyek</h3>
                  <p className="text-xs text-slate-500">
                    Gunakan role bawaan atau buat role kustom baru sesuai struktur organisasi tim Anda.
                  </p>
                </div>

                {project.is_owner && (
                  <button
                    onClick={() =>
                      setEditingRole({
                        name: "",
                        description: "",
                        color: "#0284c7",
                      })
                    }
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Role Baru</span>
                  </button>
                )}
              </div>

              {/* Predefined / Suggested Roles quick buttons if empty */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roles.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 hover:border-slate-300 transition-colors shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: r.color || "#0284c7" }}
                        />
                        <h4 className="font-bold text-slate-900 text-xs sm:text-sm">{r.name}</h4>
                      </div>

                      {project.is_owner && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingRole(r)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            title="Edit role"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setDeleteRoleTarget(r)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Hapus role"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed min-h-[2.5rem]">
                      {r.description || <span className="italic text-slate-400">Tanpa deskripsi role.</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: UNDANG ANGGOTA BARU */}
          {activeTab === "invite" && project.is_owner && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-xs text-sky-900 space-y-1">
                <strong className="font-bold flex items-center gap-1.5">
                  <UserPlus className="h-4 w-4 text-[#0284c7]" />
                  Undang Rekan Tim ke Proyek
                </strong>
                <p>
                  Tetapkan Role dan deskripsi Jobdesk langsung saat mengundang, sehingga anggota baru mengetahui tanggung jawab pekerjaannya begitu bergabung.
                </p>
              </div>

              <form onSubmit={handleInviteMember} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Alamat Email Rekan Tim <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="Misal: budi@mail.com atau citra@mail.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Pilih Role (Peran) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {roles.map((r) => (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => selectRoleSuggestionForInvite(r.name)}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold border transition-all cursor-pointer ${
                          inviteRoleName === r.name
                            ? "bg-[#0d3b66] text-white border-[#0d3b66]"
                            : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                        }`}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    required
                    placeholder="Ketik role atau pilih dari opsi di atas"
                    value={inviteRoleName}
                    onChange={(e) => setInviteRoleName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Deskripsi Jobdesk (Tanggung Jawab Utama) <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Contoh: Membuat logo, poster promosi, desain media sosial, dan materi visual UI/UX..."
                    value={inviteJobdesk}
                    onChange={(e) => setInviteJobdesk(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none resize-none leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Jobdesk adalah tanggung jawab umum anggota, berbeda dengan tugas harian yang bersifat spesifik dan memiliki deadline.
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={actionBusy || !inviteEmail.trim() || !inviteRoleName.trim()}
                    className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                  >
                    {actionBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>Kirim Undangan Tim</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-100 pt-3 flex items-center justify-between shrink-0">
          {onNavigateToTasks && (
            <button
              onClick={() => {
                onClose();
                onNavigateToTasks(project.id);
              }}
              className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 text-[#0d3b66] hover:text-[#0284c7]"
            >
              <FolderKanban className="h-3.5 w-3.5" />
              <span>Buka Tugas Proyek Ini</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors ml-auto"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* EDIT MEMBER ROLE & JOBDESK MODAL */}
      {editingMember && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setEditingMember(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-[#0284c7]" />
                <h3 className="text-base font-bold text-[#0d3b66]">
                  Ubah Role & Jobdesk Anggota
                </h3>
              </div>
              <button
                onClick={() => setEditingMember(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMemberRoleAndJobdesk} className="space-y-3.5">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Anggota:</span>
                <span className="font-bold text-slate-900 text-sm">{editingMember.name}</span>
                <span className="text-slate-500 font-mono block">{editingMember.email}</span>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Role / Posisi Proyek <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {roles.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => {
                        setEditRoleName(r.name);
                        const match = DEFAULT_ROLE_SUGGESTIONS.find((d) => d.name === r.name);
                        if (match && !editJobdesk.trim()) {
                          setEditJobdesk(match.jobdesk);
                        }
                      }}
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold border transition-all cursor-pointer ${
                        editRoleName === r.name
                          ? "bg-[#0d3b66] text-white border-[#0d3b66]"
                          : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  required
                  placeholder="Misal: Designer, Project Manager, Developer..."
                  value={editRoleName}
                  onChange={(e) => setEditRoleName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Deskripsi Jobdesk (Tanggung Jawab Umum) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Jelaskan pekerjaan utama yang menjadi tanggung jawab anggota ini..."
                  value={editJobdesk}
                  onChange={(e) => setEditJobdesk(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionBusy || !editRoleName.trim()}
                  className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1"
                >
                  {actionBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT CUSTOM ROLE MODAL */}
      {editingRole && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setEditingRole(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-[#0d3b66]">
                {editingRole.id ? "Edit Role Kustom" : "Buat Role Kustom Baru"}
              </h3>
              <button
                onClick={() => setEditingRole(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Nama Role <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: QA Engineer, Content Writer, UI Designer"
                  value={editingRole.name || ""}
                  onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Deskripsi Peran
                </label>
                <textarea
                  rows={2}
                  placeholder="Tanggung jawab dan fokus utama posisi ini..."
                  value={editingRole.description || ""}
                  onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Warna Label Badge
                </label>
                <div className="flex items-center gap-2">
                  {PRESET_ROLE_COLORS.map((col) => (
                    <button
                      type="button"
                      key={col}
                      onClick={() => setEditingRole({ ...editingRole, color: col })}
                      className={`h-6 w-6 rounded-full border-2 transition-transform ${
                        editingRole.color === col
                          ? "border-slate-800 scale-110 shadow-xs"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingRole(null)}
                  className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionBusy || !editingRole.name?.trim()}
                  className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1"
                >
                  {actionBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>{editingRole.id ? "Simpan Perubahan" : "Buat Role"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation */}
      <ConfirmModal
        isOpen={removeMemberTarget !== null}
        title="Keluarkan Anggota Tim"
        message={`Apakah Anda yakin ingin mengeluarkan "${removeMemberTarget?.name}" dari proyek ini? Seluruh tugas yang ditugaskan kepada anggota ini akan di-unassign.`}
        confirmLabel="Ya, Keluarkan"
        cancelLabel="Batal"
        isLoading={actionBusy}
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setRemoveMemberTarget(null)}
      />

      {/* Delete Role Confirmation */}
      <ConfirmModal
        isOpen={deleteRoleTarget !== null}
        title="Hapus Role Kustom"
        message={`Apakah Anda yakin ingin menghapus role "${deleteRoleTarget?.name}"?`}
        confirmLabel="Ya, Hapus"
        cancelLabel="Batal"
        isLoading={actionBusy}
        onConfirm={handleConfirmDeleteRole}
        onCancel={() => setDeleteRoleTarget(null)}
      />
    </div>
  );
};
