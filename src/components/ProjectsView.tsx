import React, { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  Edit2,
  FolderKanban,
  HelpCircle,
  ListTodo,
  Loader2,
  MessagesSquare,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { GuideModal } from "./GuideModal";
import { ConfirmModal } from "./ConfirmModal";
import { ProjectTeamModal } from "./ProjectTeamModal";
import type { Project } from "../types";

interface ProjectsViewProps {
  onNavigateToTasks: (projectId: number) => void;
  onOpenProjectChat?: (projectId: number) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ onNavigateToTasks, onOpenProjectChat }) => {
  const toast = useToast();
  const [list, setList] = useState<Project[]>([]);
  const [edit, setEdit] = useState<Partial<Project> | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProjectForTeam, setSelectedProjectForTeam] = useState<Project | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Confirm Modals state
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  const [removeMemberData, setRemoveMemberData] = useState<{
    projectId: number;
    memberId: number;
    name: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api<Project[]>("/projects");
      setList(data);
      setSelectedProjectForTeam((prev) => {
        if (!prev) return null;
        return data.find((p) => p.id === prev.id) || null;
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setErr("");
    setActionBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      toast.error(msg, "Gagal Melakukan Aksi");
    } finally {
      setActionBusy(false);
    }
  }

  function saveProject(e: FormEvent) {
    e.preventDefault();
    if (!edit?.name?.trim()) return;
    const body = { name: edit.name.trim(), description: edit.description ?? "" };
    run(async () => {
      if (edit.id) {
        await api(`/projects/${edit.id}`, { method: "PATCH", body });
        toast.success("Rincian proyek berhasil diperbarui!", "Proyek Diperbarui");
      } else {
        await api("/projects", { method: "POST", body });
        toast.success("Proyek baru berhasil dibuat!", "Proyek Dibuat");
      }
      setEdit(null);
    });
  }


  const handleConfirmDeleteProject = async () => {
    if (!deleteProjectId) return;
    const pid = deleteProjectId;
    await run(async () => {
      await api(`/projects/${pid}`, { method: "DELETE" });
      toast.success("Proyek beserta seluruh tugasnya berhasil dihapus.", "Proyek Dihapus");
    });
    setDeleteProjectId(null);
  };

  const handleConfirmRemoveMember = async () => {
    if (!removeMemberData) return;
    const { projectId, memberId, name } = removeMemberData;
    await run(async () => {
      await api(`/projects/${projectId}/members/${memberId}`, { method: "DELETE" });
      toast.info(`Anggota "${name}" telah dikeluarkan dari proyek.`, "Anggota Dikeluarkan");
    });
    setRemoveMemberData(null);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Editorial Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            <span>Ruang Lingkup Proyek</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0d3b66]">
            Proyek Tim
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Kelola ruang kerja, pantau distribusi beban kerja tim, dan atur izin kolaborator.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setShowGuide(true)}
            className="btn-ghost text-xs py-2 px-2.5 text-slate-600 hover:text-[#0d3b66] border border-slate-300 hover:border-[#0d3b66] flex items-center gap-1.5 cursor-pointer"
            title="Panduan Halaman Proyek"
            aria-label="Panduan Halaman Proyek"
          >
            <HelpCircle className="h-4 w-4 text-[#0284c7]" />
            <span className="hidden sm:inline font-semibold">Panduan</span>
          </button>
          <button
            className="btn-accent flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-xs"
            onClick={() => {
              setEdit({ name: "", description: "" });
              setErr("");
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Proyek Baru</span>
          </button>
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{err}</span>
        </div>
      )}

      {/* Flat Project Create / Edit Form Modal */}
      {edit && (
        <form onSubmit={saveProject} className="card border-slate-300 bg-white space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <h2 className="font-bold text-[#0d3b66] text-sm flex items-center gap-2 uppercase tracking-wide">
              <FolderKanban className="h-4 w-4 text-[#0284c7]" />
              {edit.id ? "Edit Rincian Proyek" : "Buat Proyek Baru"}
            </h2>
            <button
              type="button"
              onClick={() => setEdit(null)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nama Proyek *
              </label>
              <input
                className="input"
                placeholder="Contoh: Redesign Aplikasi Mobile 2026"
                required
                maxLength={120}
                value={edit.name ?? ""}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Deskripsi Proyek
              </label>
              <textarea
                className="input"
                rows={2}
                placeholder="Tuliskan tujuan dan catatan utama proyek ini..."
                maxLength={1000}
                value={edit.description ?? ""}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
            <button type="submit" disabled={actionBusy} className="btn text-xs py-2 px-4 flex items-center gap-1.5">
              {actionBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />}
              <span>{actionBusy ? "Menyimpan..." : edit.id ? "Perbarui Proyek" : "Simpan Proyek"}</span>
            </button>
            <button
              type="button"
              disabled={actionBusy}
              className="btn-ghost text-xs py-2 px-3"
              onClick={() => setEdit(null)}
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {/* Loading State */}
      {loading && list.length === 0 && (
        <div className="py-12 text-center text-slate-500 text-xs font-semibold uppercase tracking-wider">
          Memuat daftar proyek...
        </div>
      )}

      {/* Empty State */}
      {!loading && list.length === 0 && (
        <div className="card border-slate-300 text-center py-16 space-y-3">
          <FolderKanban className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="font-bold text-slate-800 text-sm">Belum Ada Proyek</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Mulai dengan membuat proyek baru untuk mengelompokkan tugas tim dan mengundang anggota kolaborasi.
          </p>
          <button
            onClick={() => setEdit({ name: "", description: "" })}
            className="btn text-xs py-2 px-3.5"
          >
            + Buat Proyek Pertama
          </button>
        </div>
      )}

      {/* Projects Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((p) => {
          const progress = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0;
          const isFinished = progress === 100 && p.task_count > 0;

          return (
            <div
              key={p.id}
              className="card border-slate-300 bg-white flex flex-col justify-between space-y-4 hover:border-slate-400 transition-colors shadow-2xs"
            >
              <div className="space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-black text-slate-900 text-base leading-tight">
                        {p.name}
                      </h2>
                      {!p.is_owner ? (
                        <span className="inline-flex items-center gap-1 rounded-xs border border-slate-300 bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
                          <Share2 className="h-3 w-3 text-[#0284c7]" />
                          Dibagikan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-xs border border-[#0d3b66]/20 bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-[#0d3b66]">
                          <UserCheck className="h-3 w-3" />
                          Pemilik
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-xs border font-mono tabular-nums ${
                      isFinished
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : progress > 0
                        ? "bg-sky-50 text-sky-800 border-sky-300"
                        : "bg-slate-100 text-slate-600 border-slate-300"
                    }`}
                  >
                    {isFinished ? "100% Selesai" : progress > 0 ? "Berjalan" : "Rencana"}
                  </span>
                </div>

                <p className="text-xs text-slate-600 line-clamp-2 min-h-[2rem] leading-relaxed">
                  {p.description || <span className="text-slate-400 italic">Tanpa deskripsi</span>}
                </p>

                {/* Flat Progress Bar */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs text-slate-500 font-mono tabular-nums">
                    <span className="font-bold text-slate-800">{progress}% selesai</span>
                    <span>{p.done_count} / {p.task_count} tugas</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-xs overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isFinished ? "bg-emerald-600" : "bg-[#0284c7]"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Team Avatars Cluster & Roles */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        Tim ({p.members.length}):
                      </span>
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {p.members.map((m) => (
                          <div
                            key={m.id || m.user_id}
                            title={`${m.name} (${m.role_name || "Anggota Tim"}) - ${m.jobdesk || "Belum ada jobdesk"}`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0d3b66] text-white text-[10px] font-bold font-mono border-2 border-white shadow-xs"
                          >
                            {getInitials(m.name)}
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedProjectForTeam(p)}
                      className="text-[#0284c7] hover:text-[#0369a1] font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                      title="Atur Role & Jobdesk Anggota"
                    >
                      <Briefcase className="h-3.5 w-3.5" />
                      <span>Peran & Jobdesk</span>
                    </button>
                  </div>

                  {/* Member Roles Chips */}
                  <div className="flex flex-wrap gap-1">
                    {p.members.slice(0, 3).map((m) => (
                      <span
                        key={m.id || m.user_id}
                        className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700"
                        title={`${m.name}: ${m.jobdesk || "Belum ada jobdesk"}`}
                      >
                        <span className="font-bold text-slate-900">{getInitials(m.name)}</span>
                        <span className="text-slate-500 truncate max-w-[100px]">({m.role_name || "Anggota"})</span>
                      </span>
                    ))}
                    {p.members.length > 3 && (
                      <span className="text-[10px] text-slate-400 self-center">
                        +{p.members.length - 3} lainnya
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 text-[#0d3b66] border-slate-300 hover:border-[#0d3b66]"
                    onClick={() => onNavigateToTasks(p.id)}
                  >
                    <ListTodo className="h-3.5 w-3.5" />
                    <span>Lihat Tugas ({p.task_count})</span>
                  </button>

                  {onOpenProjectChat && (
                    <button
                      className="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1 text-sky-800 hover:text-sky-950 border-sky-200 bg-sky-50/70 hover:bg-sky-100"
                      onClick={() => onOpenProjectChat(p.id)}
                      title="Buka ruang obrolan proyek ini"
                    >
                      <MessagesSquare className="h-3.5 w-3.5 text-sky-700" />
                      <span className="hidden sm:inline font-semibold">Chat Proyek</span>
                    </button>
                  )}

                  <button
                    className="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1 text-slate-700 hover:text-sky-700 border-slate-200 hover:bg-slate-50"
                    onClick={() => setSelectedProjectForTeam(p)}
                    title="Buka struktur peran dan tanggung jawab anggota"
                  >
                    <Users className="h-3.5 w-3.5 text-sky-600" />
                    <span className="hidden sm:inline font-semibold">Tim & Jobdesk</span>
                  </button>
                </div>

                {p.is_owner && (
                  <div className="flex items-center gap-1.5">
                    <button
                      className="btn-ghost text-xs py-1.5 px-2.5 text-slate-700"
                      onClick={() => setEdit(p)}
                      title="Edit nama dan deskripsi proyek"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      className="btn-danger text-xs py-1.5 px-2.5"
                      onClick={() => setDeleteProjectId(p.id)}
                      title="Hapus proyek"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Hapus</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete Project Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteProjectId !== null}
        title="Hapus Proyek"
        message="Apakah Anda yakin ingin menghapus proyek ini beserta seluruh tugas di dalamnya? Tindakan ini bersifat permanen."
        confirmLabel="Hapus Proyek"
        cancelLabel="Batal"
        isLoading={actionBusy}
        onConfirm={handleConfirmDeleteProject}
        onCancel={() => setDeleteProjectId(null)}
      />

      {/* Remove Member Confirmation Modal */}
      <ConfirmModal
        isOpen={removeMemberData !== null}
        title="Keluarkan Anggota"
        message={`Apakah Anda yakin ingin mengeluarkan "${removeMemberData?.name}" dari ruang kerja proyek ini?`}
        confirmLabel="Keluarkan"
        cancelLabel="Batal"
        isLoading={actionBusy}
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setRemoveMemberData(null)}
      />

      {/* Help & User Guide Modal */}
      <GuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        title="Panduan Halaman Proyek"
        subtitle="Petunjuk mengelola ruang kerja proyek, kolaborasi tim, dan pembagian tugas"
        steps={[
          {
            title: "Buat Proyek Baru untuk Ruang Kerja Tim",
            desc: "Klik tombol '+ Proyek Baru' di pojok kanan atas. Masukkan nama proyek dan deskripsi ringkas untuk memisahkan inisiatif atau tim kerja Anda.",
          },
          {
            title: "Buka dan Kelola Tugas Terkait",
            desc: "Klik tombol 'Lihat Tugas' pada kartu proyek untuk langsung menyaring dan mengeksekusi tugas-tugas yang terdaftar dalam proyek tersebut.",
          },
          {
            title: "Undang Kolaborator atau Anggota Tim",
            desc: "Sebagai pemilik proyek, klik tombol 'Undang Anggota' dan masukkan email rekan tim Anda. Tentukan peran awal dan deskripsi jobdesk mereka.",
          },
          {
            title: "Atur Peran (Role) & Tanggung Jawab (Jobdesk) Anggota",
            desc: "Klik 'Peran & Jobdesk' pada kartu proyek. Anda dapat menentukan posisi setiap anggota (Project Manager, Designer, Developer, Marketing, Finance, atau buat role kustom), menetapkan deskripsi jobdesk umum, dan memantau progres pekerjaan masing-masing anggota.",
          },
          {
            title: "Pahami Label 'Dibagikan' & Batasan Wewenang",
            desc: "Proyek yang dibuat orang lain dan dibagikan kepada Anda memiliki label 'Dibagikan'. Hanya pemilik asli yang memiliki izin untuk mengubah rincian atau menghapus proyek.",
          },
        ]}
        tips={[
          "Membuat proyek per sprint atau departemen membantu memantau persentase target secara akurat.",
          "Role dan jobdesk membedakan fungsi umum dari tugas spesifik, memastikan pembagian tanggung jawab tim berjalan tertib dan terukur.",
          "Menghapus proyek akan menghapus semua tugas yang ada di dalamnya secara permanen.",
        ]}
      />

      {/* Project Team, Role & Jobdesk Management Modal */}
      {selectedProjectForTeam && (
        <ProjectTeamModal
          project={selectedProjectForTeam}
          isOpen={Boolean(selectedProjectForTeam)}
          onClose={() => setSelectedProjectForTeam(null)}
          onProjectUpdated={load}
          onNavigateToTasks={onNavigateToTasks}
        />
      )}
    </div>
  );
};
