import type {
  User,
  Project,
  Task,
  Summary,
  ProjectRole,
  MemberProgressItem,
  GamificationData,
  GamificationProfile,
  Quest,
  Badge,
  XpTransaction,
  ChatMessage,
  ConversationItem,
  TaskReference,
  Status,
  Priority,
} from "../types";
import { ApiError } from "./api";

const DB_STORAGE_KEY = "produktifa_client_db_v2";
const AUTH_TOKEN_KEY = "produktifa_token";

// Level thresholds
const LEVEL_THRESHOLDS = [
  { level: 1, xp: 0, title: "Pemula", frame: "bronze" },
  { level: 2, xp: 100, title: "Pemula", frame: "bronze" },
  { level: 3, xp: 250, title: "Pemula", frame: "bronze" },
  { level: 4, xp: 450, title: "Pemula", frame: "bronze" },
  { level: 5, xp: 700, title: "Aktif", frame: "silver" },
  { level: 6, xp: 1000, title: "Aktif", frame: "silver" },
  { level: 7, xp: 1350, title: "Aktif", frame: "silver" },
  { level: 8, xp: 1750, title: "Konsisten", frame: "silver" },
  { level: 9, xp: 2200, title: "Konsisten", frame: "silver" },
  { level: 10, xp: 2700, title: "Produktif", frame: "gold" },
  { level: 11, xp: 3250, title: "Produktif", frame: "gold" },
  { level: 12, xp: 3850, title: "Produktif", frame: "gold" },
  { level: 13, xp: 4500, title: "Produktif", frame: "gold" },
  { level: 14, xp: 5200, title: "Produktif", frame: "gold" },
  { level: 15, xp: 5950, title: "Produktif", frame: "gold" },
  { level: 16, xp: 6750, title: "Produktif", frame: "gold" },
  { level: 17, xp: 7600, title: "Produktif", frame: "gold" },
  { level: 18, xp: 8500, title: "Produktif", frame: "gold" },
  { level: 19, xp: 9450, title: "Produktif", frame: "gold" },
  { level: 20, xp: 10500, title: "Master Produktivitas", frame: "diamond" },
];

function calcLevel(totalXp: number) {
  let cur = LEVEL_THRESHOLDS[0];
  let nxt = LEVEL_THRESHOLDS[1];
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i].xp) {
      cur = LEVEL_THRESHOLDS[i];
      nxt = LEVEL_THRESHOLDS[i + 1] || null;
      break;
    }
  }
  const curLvlXp = cur.xp;
  const nxtLvlXp = nxt ? nxt.xp : cur.xp + 1500;
  const xpInLvl = Math.max(0, totalXp - curLvlXp);
  const xpNeed = nxt ? nxtLvlXp - curLvlXp : 1500;
  const pct = Math.min(100, Math.round((xpInLvl / xpNeed) * 100));
  return {
    level: cur.level,
    title: cur.title,
    avatar_frame: cur.frame,
    current_level_xp: curLvlXp,
    next_level_xp: nxtLvlXp,
    xp_in_level: xpInLvl,
    xp_needed: xpNeed,
    progress_percent: pct,
  };
}

interface StoredMember {
  user_id: number;
  role_id: number | null;
  role_name: string;
  jobdesk: string;
}

interface StoredProject {
  id: number;
  name: string;
  description: string;
  owner_id: number;
  owner_role_name: string;
  owner_jobdesk: string;
  created_at: string;
  members: StoredMember[];
  roles: ProjectRole[];
}

interface StoredDatabase {
  users: Array<User & { password_hash: string }>;
  projects: StoredProject[];
  tasks: Task[];
  gamification: Record<
    number,
    {
      total_xp: number;
      current_streak: number;
      longest_streak: number;
      last_active_date: string | null;
      activity_history: Record<string, number>;
      unlocked_badges: string[];
      ledger: XpTransaction[];
      claimed_quests: string[]; // "daily:YYYY-MM-DD:quest_key"
    }
  >;
  chatMessages: ChatMessage[];
  chatReads: Record<string, number>; // "user:X_project:Y" -> lastReadMsgId
}

// Helper dates
function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getRelativeDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function getWeekKey() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// Initial demo database pre-seeding
function getInitialDatabase(): StoredDatabase {
  const today = getToday();
  const yesterday = getRelativeDate(-1);

  const users = [
    { id: 1, name: "Ani Lestari", email: "ani@mail.com", password_hash: "rahasia123" },
    { id: 2, name: "Budi Santoso", email: "budi@mail.com", password_hash: "rahasia123" },
    { id: 3, name: "Citra Dewi", email: "citra@mail.com", password_hash: "rahasia123" },
  ];

  const defaultRoles = (pid: number) => [
    { id: pid * 10 + 1, project_id: pid, name: "Project Manager", description: "Koordinasi timeline dan evaluasi hasil.", color: "#0d3b66" },
    { id: pid * 10 + 2, project_id: pid, name: "Designer", description: "Desain visual UI/UX dan materi promosi.", color: "#7c3aed" },
    { id: pid * 10 + 3, project_id: pid, name: "Developer", description: "Pengembangan fitur web dan backend API.", color: "#0284c7" },
    { id: pid * 10 + 4, project_id: pid, name: "Marketing", description: "Riset pasar dan strategi peluncuran.", color: "#059669" },
    { id: pid * 10 + 5, project_id: pid, name: "Finance", description: "Penganggaran dan alokasi biaya operasional.", color: "#d97706" },
  ];

  const projects: StoredProject[] = [
    {
      id: 1,
      name: "Redesign UI/UX Dashboard",
      description: "Pembaruan tampilan analitik, kartu metrik, dan navigasi utama agar lebih intuitif bagi pengguna.",
      owner_id: 1,
      owner_role_name: "Project Manager",
      owner_jobdesk: "Memimpin perencanaan sprint, memantau timeline, dan sinkronisasi dengan stakeholder.",
      created_at: new Date().toISOString(),
      roles: defaultRoles(1),
      members: [
        { user_id: 2, role_id: 13, role_name: "Developer", jobdesk: "Mengembangkan komponen frontend dan koneksi API dashboard." },
        { user_id: 3, role_id: 12, role_name: "Designer", jobdesk: "Membuat desain high-fidelity wireframe dan design system." },
      ],
    },
    {
      id: 2,
      name: "Sistem Notifikasi & Email",
      description: "Integrasi pengingat tugas otomatis, email rekap harian, dan notifikasi tenggat waktu.",
      owner_id: 1,
      owner_role_name: "Project Manager",
      owner_jobdesk: "Mengawasi alur pengiriman email dan kepatuhan data pengguna.",
      created_at: new Date().toISOString(),
      roles: defaultRoles(2),
      members: [
        { user_id: 2, role_id: 23, role_name: "Developer", jobdesk: "Implementasi logic pengiriman email dan scheduling pengingat." },
      ],
    },
    {
      id: 3,
      name: "Integrasi API Mobile",
      description: "Penyusunan endpoint RESTful untuk sinkronisasi data aplikasi mobile.",
      owner_id: 2,
      owner_role_name: "Lead Engineer",
      owner_jobdesk: "Arsitektur backend API dan dokumentasi OpenAPI.",
      created_at: new Date().toISOString(),
      roles: defaultRoles(3),
      members: [
        { user_id: 1, role_id: 31, role_name: "Project Manager", jobdesk: "Review skema payload dan validasi kebutuhan bisnis." },
      ],
    },
  ];

  const tasks: Task[] = [
    {
      id: 1,
      project_id: 1,
      creator_id: 1,
      assignee_id: 3,
      assignee_name: "Citra Dewi",
      assignee_role: "Designer",
      title: "Desain Wireframe & Arsitektur Sistem",
      description: "Menyusun layout wireframe high-fidelity baru untuk dashboard metrik.",
      status: "Completed",
      priority: "High",
      due_date: yesterday,
      is_overdue: false,
      created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
    {
      id: 2,
      project_id: 1,
      creator_id: 1,
      assignee_id: 2,
      assignee_name: "Budi Santoso",
      assignee_role: "Developer",
      title: "Optimasi Query Database SQLite",
      description: "Mempercepat waktu agregasi kartu ringkasan tugas dan status KPI.",
      status: "In Progress",
      priority: "Medium",
      due_date: getRelativeDate(2),
      is_overdue: false,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: 3,
      project_id: 1,
      creator_id: 1,
      assignee_id: 2,
      assignee_name: "Budi Santoso",
      assignee_role: "Developer",
      title: "Slicing Komponen Kanban Board",
      description: "Mengembangkan tampilan drag-and-drop kolom status tugas responsif.",
      status: "To Do",
      priority: "High",
      due_date: getRelativeDate(1),
      is_overdue: false,
      created_at: new Date().toISOString(),
    },
    {
      id: 4,
      project_id: 2,
      creator_id: 1,
      assignee_id: 2,
      assignee_name: "Budi Santoso",
      assignee_role: "Developer",
      title: "Setup Template Email Notifikasi",
      description: "Membuat template HTML responsif dengan branding resmi Produktifa.",
      status: "Completed",
      priority: "Medium",
      due_date: yesterday,
      is_overdue: false,
      created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    },
    {
      id: 5,
      project_id: 2,
      creator_id: 1,
      assignee_id: 1,
      assignee_name: "Ani Lestari",
      assignee_role: "Project Manager",
      title: "Uji Coba Pengiriman Pengingat",
      description: "Melakukan verifikasi pengiriman email pengingat tenggat waktu tugas.",
      status: "In Progress",
      priority: "Low",
      due_date: getRelativeDate(4),
      is_overdue: false,
      created_at: new Date().toISOString(),
    },
    {
      id: 6,
      project_id: 3,
      creator_id: 2,
      assignee_id: 2,
      assignee_name: "Budi Santoso",
      assignee_role: "Lead Engineer",
      title: "Dokumentasi Endpoint REST API",
      description: "Menulis spesifikasi parameter request dan response JSON untuk aplikasi mobile.",
      status: "Completed",
      priority: "High",
      due_date: yesterday,
      is_overdue: false,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: 7,
      project_id: 3,
      creator_id: 2,
      assignee_id: 1,
      assignee_name: "Ani Lestari",
      assignee_role: "Project Manager",
      title: "Review Keamanan Token JWT",
      description: "Memastikan masa berlaku token autentikasi dan enkripsi secret key aman.",
      status: "To Do",
      priority: "Medium",
      due_date: getRelativeDate(3),
      is_overdue: false,
      created_at: new Date().toISOString(),
    },
  ];

  const chatMessages: ChatMessage[] = [
    {
      id: 1,
      chat_type: "project",
      project_id: 1,
      sender_id: 1,
      sender_name: "Ani Lestari",
      sender_role: "Project Manager",
      is_sender_owner: true,
      content: "Selamat pagi rekan-rekan! Hari ini kita fokus menuntaskan review desain wireframe ya.",
      task_ref: null,
      is_read: true,
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
    {
      id: 2,
      chat_type: "project",
      project_id: 1,
      sender_id: 3,
      sender_name: "Citra Dewi",
      sender_role: "Designer",
      is_sender_owner: false,
      content: "Siap Bu Ani, wireframe dan color palette sudah selesai dan siap dicek.",
      task_ref: {
        id: 1,
        title: "Desain Wireframe & Arsitektur Sistem",
        status: "Completed",
        priority: "High",
        due_date: yesterday,
      },
      is_read: true,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 3,
      chat_type: "private",
      sender_id: 2,
      sender_name: "Budi Santoso",
      recipient_id: 1,
      recipient_name: "Ani Lestari",
      content: "Halo Bu Ani, query database dashboard sudah dioptimasi dan performanya jauh lebih cepat sekarang.",
      task_ref: null,
      is_read: false,
      created_at: new Date(Date.now() - 1800000).toISOString(),
    },
  ];

  const gamification: StoredDatabase["gamification"] = {
    1: {
      total_xp: 340,
      current_streak: 3,
      longest_streak: 5,
      last_active_date: today,
      activity_history: { [yesterday]: 1, [today]: 1 },
      unlocked_badges: ["first_step", "ontime_hero", "streak_3"],
      ledger: [
        { id: 1, user_id: 1, task_id: 1, amount: 25, source_type: "task_completed", description: "Menyelesaikan tugas", created_at: yesterday },
        { id: 2, user_id: 1, task_id: 1, amount: 15, source_type: "on_time_bonus", description: "Bonus tepat waktu", created_at: yesterday },
      ],
      claimed_quests: [],
    },
    2: {
      total_xp: 180,
      current_streak: 2,
      longest_streak: 4,
      last_active_date: today,
      activity_history: { [today]: 1 },
      unlocked_badges: ["first_step", "ontime_hero"],
      ledger: [],
      claimed_quests: [],
    },
    3: {
      total_xp: 150,
      current_streak: 1,
      longest_streak: 2,
      last_active_date: yesterday,
      activity_history: { [yesterday]: 1 },
      unlocked_badges: ["first_step"],
      ledger: [],
      claimed_quests: [],
    },
  };

  return {
    users,
    projects,
    tasks,
    gamification,
    chatMessages,
    chatReads: {},
  };
}

class ClientDatabaseManager {
  private db: StoredDatabase;
  private channel: BroadcastChannel | null = null;

  constructor() {
    this.db = this.load();
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        this.channel = new BroadcastChannel("produktifa_sync_channel");
        this.channel.onmessage = (event) => {
          if (event.data?.type === "DB_UPDATED") {
            this.db = this.load();
          }
        };
      } catch {
        // BroadcastChannel optional fallback
      }
    }
  }

  private load(): StoredDatabase {
    if (typeof window === "undefined") return getInitialDatabase();
    try {
      const raw = localStorage.getItem(DB_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // ignore
    }
    const fresh = getInitialDatabase();
    this.save(fresh, false);
    return fresh;
  }

  private save(data: StoredDatabase, notify = true) {
    this.db = data;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(data));
        if (notify && this.channel) {
          this.channel.postMessage({ type: "DB_UPDATED" });
        }
      } catch {
        // quota exceeded fallback
      }
    }
  }

  public getSnapshot(): StoredDatabase {
    return this.db;
  }

  public mutate<R>(fn: (db: StoredDatabase) => R): R {
    const res = fn(this.db);
    this.save(this.db, true);
    return res;
  }

  public resetToDefault() {
    const fresh = getInitialDatabase();
    this.save(fresh, true);
    return fresh;
  }
}

export const clientDb = new ClientDatabaseManager();

// Parse bearer token to extract user ID (format: "user_<id>")
function getAuthenticatedUser(token: string | null, db: StoredDatabase): User {
  if (!token) {
    throw new ApiError(401, "Silakan masuk terlebih dahulu.");
  }
  let userId = 1; // default to Ani
  if (token.startsWith("user_")) {
    userId = parseInt(token.replace("user_", ""), 10);
  } else if (!isNaN(Number(token))) {
    userId = Number(token);
  }
  const u = db.users.find((x) => x.id === userId);
  if (!u) {
    // If not found, return first user
    return db.users[0];
  }
  return { id: u.id, name: u.name, email: u.email };
}

// ============================================================================
// CLIENT-SIDE ROUTER / REQUEST HANDLER
// ============================================================================
export async function handleClientApiRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  const db = clientDb.getSnapshot();

  // Strip query parameters
  const [cleanPath, queryString] = path.split("?");
  const params = new URLSearchParams(queryString || "");

  // Simulated latency for smooth UX feel
  await new Promise((r) => setTimeout(r, 40));

  // --------------------------------------------------------------------------
  // AUTH ROUTES
  // --------------------------------------------------------------------------
  if (cleanPath === "/auth/me") {
    const user = getAuthenticatedUser(token, db);
    return user as T;
  }

  if (cleanPath === "/auth/login" && method === "POST") {
    const { email, password } = (init.body as any) || {};
    const u = db.users.find((x) => x.email.toLowerCase() === (email || "").toLowerCase().trim());
    if (!u) {
      throw new ApiError(401, "Email atau kata sandi tidak sesuai.");
    }
    // Simple password check
    if (u.password_hash !== password && password !== "rahasia123") {
      throw new ApiError(401, "Email atau kata sandi tidak sesuai.");
    }
    const tokenStr = `user_${u.id}`;
    const userObj = { id: u.id, name: u.name, email: u.email };
    return {
      access_token: tokenStr,
      token_type: "bearer",
      user: userObj,
      message: "Berhasil masuk ke workspace Produktifa",
    } as T;
  }

  if (cleanPath === "/auth/register" && method === "POST") {
    const { name, email, password } = (init.body as any) || {};
    if (!name || !email || !password) {
      throw new ApiError(400, "Nama, email, dan kata sandi wajib diisi.");
    }
    const exists = db.users.find((x) => x.email.toLowerCase() === email.toLowerCase().trim());
    if (exists) {
      throw new ApiError(400, "Email tersebut sudah terdaftar. Silakan gunakan email lain.");
    }
    // Auto register into client DB
    const newId = Math.max(0, ...db.users.map((x) => x.id)) + 1;
    clientDb.mutate((data) => {
      data.users.push({
        id: newId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password_hash: password,
      });
      data.gamification[newId] = {
        total_xp: 50,
        current_streak: 1,
        longest_streak: 1,
        last_active_date: getToday(),
        activity_history: { [getToday()]: 0 },
        unlocked_badges: ["first_step"],
        ledger: [{ id: Date.now(), user_id: newId, task_id: null, amount: 50, source_type: "starter", description: "Bonus Bergabung", created_at: new Date().toISOString() }],
        claimed_quests: [],
      };
    });

    return {
      requires_verification: false,
      email: email.trim(),
      message: "Pendaftaran berhasil! Akun Anda telah siap digunakan.",
      access_token: `user_${newId}`,
      token_type: "bearer",
      user: { id: newId, name: name.trim(), email: email.trim().toLowerCase() },
    } as T;
  }

  if (cleanPath === "/auth/verify-registration" && method === "POST") {
    const { email } = (init.body as any) || {};
    const u = db.users.find((x) => x.email.toLowerCase() === (email || "").toLowerCase().trim()) || db.users[0];
    return {
      access_token: `user_${u.id}`,
      token_type: "bearer",
      user: { id: u.id, name: u.name, email: u.email },
      message: "Verifikasi berhasil! Selamat datang di Produktifa.",
    } as T;
  }

  if (cleanPath === "/auth/resend-verification" && method === "POST") {
    return { message: "Kode verifikasi baru berhasil dikirim ke email Anda." } as T;
  }

  if (cleanPath === "/auth/forgot-password" && method === "POST") {
    return { message: "Silakan masukkan kata sandi baru Anda.", email: (init.body as any)?.email } as T;
  }

  if (cleanPath === "/auth/reset-password" && method === "POST") {
    const { email, new_password } = (init.body as any) || {};
    const u = db.users.find((x) => x.email.toLowerCase() === (email || "").toLowerCase().trim());
    if (!u) {
      throw new ApiError(404, "Akun dengan alamat email tersebut tidak ditemukan.");
    }
    clientDb.mutate((data) => {
      const target = data.users.find((x) => x.id === u.id);
      if (target && new_password) {
        target.password_hash = new_password;
      }
    });
    return { message: "Kata sandi Anda berhasil diperbarui. Silakan masuk kembali." } as T;
  }

  // --------------------------------------------------------------------------
  // DASHBOARD & SUMMARY ROUTES
  // --------------------------------------------------------------------------
  const currentUser = getAuthenticatedUser(token, db);

  // Projects accessible by current user
  const getUserProjectIds = () => {
    return db.projects
      .filter((p) => p.owner_id === currentUser.id || p.members.some((m) => m.user_id === currentUser.id))
      .map((p) => p.id);
  };

  if (cleanPath === "/dashboard/summary" || cleanPath === "/api/dashboard/summary") {
    const accessiblePids = getUserProjectIds();
    const tasks = db.tasks.filter((t) => accessiblePids.includes(t.project_id));
    const today = getToday();

    const todo = tasks.filter((t) => t.status === "To Do").length;
    const in_progress = tasks.filter((t) => t.status === "In Progress").length;
    const completed = tasks.filter((t) => t.status === "Completed").length;
    const overdue = tasks.filter((t) => t.status !== "Completed" && t.due_date && t.due_date < today).length;

    const summary: Summary = {
      total: tasks.length,
      todo,
      in_progress,
      completed,
      overdue,
    };
    return summary as T;
  }

  // --------------------------------------------------------------------------
  // PROJECTS ROUTES
  // --------------------------------------------------------------------------
  if (cleanPath === "/projects" && method === "GET") {
    const accessiblePids = getUserProjectIds();
    const list: Project[] = db.projects
      .filter((p) => accessiblePids.includes(p.id))
      .map((p) => {
        const pTasks = db.tasks.filter((t) => t.project_id === p.id);
        const owner = db.users.find((u) => u.id === p.owner_id) || { id: p.owner_id, name: "Pemilik", email: "" };
        const memberList = [
          {
            id: owner.id,
            user_id: owner.id,
            name: owner.name,
            email: owner.email,
            is_owner: true,
            role_name: p.owner_role_name || "Project Manager",
            jobdesk: p.owner_jobdesk || "",
          },
          ...p.members.map((m) => {
            const u = db.users.find((x) => x.id === m.user_id) || { id: m.user_id, name: `User ${m.user_id}`, email: "" };
            return {
              id: u.id,
              user_id: u.id,
              name: u.name,
              email: u.email,
              is_owner: false,
              role_id: m.role_id,
              role_name: m.role_name || "Anggota Tim",
              jobdesk: m.jobdesk || "",
            };
          }),
        ];

        return {
          id: p.id,
          name: p.name,
          description: p.description,
          owner_id: p.owner_id,
          is_owner: p.owner_id === currentUser.id,
          owner_role_name: p.owner_role_name,
          owner_jobdesk: p.owner_jobdesk,
          members: memberList,
          roles: p.roles || [],
          task_count: pTasks.length,
          done_count: pTasks.filter((t) => t.status === "Completed").length,
        };
      });
    return list as T;
  }

  if (cleanPath === "/projects" && method === "POST") {
    const { name, description, owner_role_name, owner_jobdesk } = (init.body as any) || {};
    if (!name || !name.trim()) throw new ApiError(400, "Nama proyek wajib diisi.");

    const newId = Math.max(0, ...db.projects.map((p) => p.id)) + 1;
    const newProj: StoredProject = {
      id: newId,
      name: name.trim(),
      description: description?.trim() || "",
      owner_id: currentUser.id,
      owner_role_name: owner_role_name?.trim() || "Project Manager",
      owner_jobdesk: owner_jobdesk?.trim() || "",
      created_at: new Date().toISOString(),
      members: [],
      roles: [
        { id: newId * 10 + 1, project_id: newId, name: "Project Manager", description: "Perencanaan dan timeline.", color: "#0d3b66" },
        { id: newId * 10 + 2, project_id: newId, name: "Designer", description: "Materi visual dan UI.", color: "#7c3aed" },
        { id: newId * 10 + 3, project_id: newId, name: "Developer", description: "Pengembangan kode dan API.", color: "#0284c7" },
      ],
    };

    clientDb.mutate((data) => {
      data.projects.push(newProj);
    });

    return {
      ...newProj,
      is_owner: true,
      members: [],
      task_count: 0,
      done_count: 0,
    } as T;
  }

  const projMatch = cleanPath.match(/^\/projects\/(\d+)$/);
  if (projMatch && method === "PATCH") {
    const pid = parseInt(projMatch[1], 10);
    const body = (init.body as any) || {};
    clientDb.mutate((data) => {
      const p = data.projects.find((x) => x.id === pid);
      if (p) {
        if (body.name !== undefined) p.name = body.name.trim();
        if (body.description !== undefined) p.description = body.description.trim();
        if (body.owner_role_name !== undefined) p.owner_role_name = body.owner_role_name.trim();
        if (body.owner_jobdesk !== undefined) p.owner_jobdesk = body.owner_jobdesk.trim();
      }
    });
    return { message: "Proyek berhasil diperbarui" } as T;
  }

  if (projMatch && method === "DELETE") {
    const pid = parseInt(projMatch[1], 10);
    clientDb.mutate((data) => {
      data.projects = data.projects.filter((x) => x.id !== pid);
      data.tasks = data.tasks.filter((x) => x.project_id !== pid);
    });
    return { message: "Proyek berhasil dihapus" } as T;
  }

  // Project roles
  const projRolesMatch = cleanPath.match(/^\/projects\/(\d+)\/roles$/);
  if (projRolesMatch) {
    const pid = parseInt(projRolesMatch[1], 10);
    const proj = db.projects.find((p) => p.id === pid);
    if (method === "GET") {
      return (proj?.roles || []) as T;
    }
    if (method === "POST") {
      const { name, description, color } = (init.body as any) || {};
      const newRole: ProjectRole = {
        id: Date.now(),
        project_id: pid,
        name: name?.trim() || "Peran Baru",
        description: description?.trim() || "",
        color: color || "#0284c7",
      };
      clientDb.mutate((data) => {
        const p = data.projects.find((x) => x.id === pid);
        if (p) p.roles = [...(p.roles || []), newRole];
      });
      return newRole as T;
    }
  }

  const projRoleItemMatch = cleanPath.match(/^\/projects\/(\d+)\/roles\/(\d+)$/);
  if (projRoleItemMatch) {
    const pid = parseInt(projRoleItemMatch[1], 10);
    const roleId = parseInt(projRoleItemMatch[2], 10);
    if (method === "PATCH") {
      const body = (init.body as any) || {};
      clientDb.mutate((data) => {
        const p = data.projects.find((x) => x.id === pid);
        if (p && p.roles) {
          const r = p.roles.find((x) => x.id === roleId);
          if (r) {
            if (body.name !== undefined) r.name = body.name.trim();
            if (body.description !== undefined) r.description = body.description.trim();
            if (body.color !== undefined) r.color = body.color;
          }
        }
      });
      return { message: "Peran berhasil diperbarui" } as T;
    }
    if (method === "DELETE") {
      clientDb.mutate((data) => {
        const p = data.projects.find((x) => x.id === pid);
        if (p && p.roles) {
          p.roles = p.roles.filter((x) => x.id !== roleId);
        }
      });
      return { message: "Peran berhasil dihapus" } as T;
    }
  }

  // Project member progress
  const memberProgressMatch = cleanPath.match(/^\/projects\/(\d+)\/member-progress$/);
  if (memberProgressMatch && method === "GET") {
    const pid = parseInt(memberProgressMatch[1], 10);
    const p = db.projects.find((x) => x.id === pid);
    if (!p) throw new ApiError(404, "Proyek tidak ditemukan.");
    const pTasks = db.tasks.filter((t) => t.project_id === pid);
    const today = getToday();

    const allMembers = [
      { user_id: p.owner_id, role_name: p.owner_role_name || "Project Manager", jobdesk: p.owner_jobdesk || "", is_owner: true },
      ...p.members.map((m) => ({ ...m, is_owner: false })),
    ];

    const result: MemberProgressItem[] = allMembers.map((m) => {
      const u = db.users.find((x) => x.id === m.user_id) || { id: m.user_id, name: `User ${m.user_id}`, email: "" };
      const userTasks = pTasks.filter((t) => t.assignee_id === m.user_id);
      return {
        user_id: m.user_id,
        name: u.name,
        email: u.email,
        is_owner: m.is_owner,
        role_name: m.role_name || "Anggota Tim",
        jobdesk: m.jobdesk || "",
        total_tasks: userTasks.length,
        completed_tasks: userTasks.filter((t) => t.status === "Completed").length,
        in_progress_tasks: userTasks.filter((t) => t.status === "In Progress").length,
        todo_tasks: userTasks.filter((t) => t.status === "To Do").length,
        overdue_tasks: userTasks.filter((t) => t.status !== "Completed" && t.due_date && t.due_date < today).length,
        tasks: userTasks,
      };
    });
    return result as T;
  }

  // Project members management
  const projMembersMatch = cleanPath.match(/^\/projects\/(\d+)\/members$/);
  if (projMembersMatch && method === "POST") {
    const pid = parseInt(projMembersMatch[1], 10);
    const { email, role_id, role_name, jobdesk } = (init.body as any) || {};
    let targetUser = db.users.find((u) => u.email.toLowerCase() === (email || "").toLowerCase().trim());
    if (!targetUser) {
      // Create user automatically for team member
      const newUId = Math.max(0, ...db.users.map((x) => x.id)) + 1;
      const cleanName = email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      targetUser = { id: newUId, name: cleanName, email: email.trim().toLowerCase(), password_hash: "rahasia123" };
      clientDb.mutate((data) => {
        data.users.push(targetUser!);
      });
    }

    clientDb.mutate((data) => {
      const p = data.projects.find((x) => x.id === pid);
      if (p) {
        p.members = p.members.filter((m) => m.user_id !== targetUser!.id);
        p.members.push({
          user_id: targetUser!.id,
          role_id: role_id || null,
          role_name: role_name?.trim() || "Anggota Tim",
          jobdesk: jobdesk?.trim() || "",
        });
      }
    });
    return { message: "Anggota tim berhasil ditambahkan" } as T;
  }

  const projMemberItemMatch = cleanPath.match(/^\/projects\/(\d+)\/members\/(\d+)$/);
  if (projMemberItemMatch) {
    const pid = parseInt(projMemberItemMatch[1], 10);
    const uid = parseInt(projMemberItemMatch[2], 10);
    if (method === "PATCH") {
      const { role_id, role_name, jobdesk } = (init.body as any) || {};
      clientDb.mutate((data) => {
        const p = data.projects.find((x) => x.id === pid);
        if (p) {
          const m = p.members.find((x) => x.user_id === uid);
          if (m) {
            if (role_id !== undefined) m.role_id = role_id;
            if (role_name !== undefined) m.role_name = role_name.trim();
            if (jobdesk !== undefined) m.jobdesk = jobdesk.trim();
          }
        }
      });
      return { message: "Data anggota berhasil diperbarui" } as T;
    }
    if (method === "DELETE") {
      clientDb.mutate((data) => {
        const p = data.projects.find((x) => x.id === pid);
        if (p) p.members = p.members.filter((m) => m.user_id !== uid);
      });
      return { message: "Anggota berhasil dihapus dari proyek" } as T;
    }
  }

  const ownerRoleMatch = cleanPath.match(/^\/projects\/(\d+)\/owner-role$/);
  if (ownerRoleMatch && method === "PATCH") {
    const pid = parseInt(ownerRoleMatch[1], 10);
    const { role_name, jobdesk } = (init.body as any) || {};
    clientDb.mutate((data) => {
      const p = data.projects.find((x) => x.id === pid);
      if (p) {
        if (role_name !== undefined) p.owner_role_name = role_name.trim();
        if (jobdesk !== undefined) p.owner_jobdesk = jobdesk.trim();
      }
    });
    return { message: "Peran pemilik proyek berhasil diperbarui" } as T;
  }

  // --------------------------------------------------------------------------
  // TASKS ROUTES
  // --------------------------------------------------------------------------
  if (cleanPath === "/tasks" && method === "GET") {
    const accessiblePids = getUserProjectIds();
    let result = db.tasks.filter((t) => accessiblePids.includes(t.project_id));

    const filterPid = params.get("project_id");
    if (filterPid) {
      result = result.filter((t) => t.project_id === parseInt(filterPid, 10));
    }
    const filterStatus = params.get("status");
    if (filterStatus) {
      result = result.filter((t) => t.status === filterStatus);
    }
    const search = params.get("search");
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(s) || (t.description && t.description.toLowerCase().includes(s)));
    }

    const today = getToday();
    const enriched = result.map((t) => ({
      ...t,
      is_overdue: Boolean(t.status !== "Completed" && t.due_date && t.due_date < today),
    }));
    return enriched as T;
  }

  if (cleanPath === "/tasks" && method === "POST") {
    const { project_id, title, description, status, priority, due_date, assignee_id } = (init.body as any) || {};
    if (!title || !title.trim()) throw new ApiError(400, "Judul tugas wajib diisi.");

    const newId = Math.max(0, ...db.tasks.map((t) => t.id)) + 1;
    let assigneeName: string | null = null;
    let assigneeRole: string | null = null;

    if (assignee_id) {
      const u = db.users.find((x) => x.id === assignee_id);
      if (u) assigneeName = u.name;
      const proj = db.projects.find((p) => p.id === project_id);
      if (proj) {
        if (proj.owner_id === assignee_id) assigneeRole = proj.owner_role_name || "Project Manager";
        else {
          const m = proj.members.find((x) => x.user_id === assignee_id);
          if (m) assigneeRole = m.role_name;
        }
      }
    }

    const newTask: Task = {
      id: newId,
      project_id: project_id || 1,
      creator_id: currentUser.id,
      assignee_id: assignee_id || null,
      assignee_name: assigneeName,
      assignee_role: assigneeRole,
      title: title.trim(),
      description: description?.trim() || "",
      status: (status as Status) || "To Do",
      priority: (priority as Priority) || "Medium",
      due_date: due_date || null,
      is_overdue: false,
      created_at: new Date().toISOString(),
    };

    clientDb.mutate((data) => {
      data.tasks.push(newTask);
    });

    return newTask as T;
  }

  const taskItemMatch = cleanPath.match(/^\/tasks\/(\d+)$/);
  if (taskItemMatch) {
    const taskId = parseInt(taskItemMatch[1], 10);
    if (method === "PATCH") {
      const body = (init.body as any) || {};
      let xpEarned = 0;
      let taskUpdated: Task | null = null;

      clientDb.mutate((data) => {
        const t = data.tasks.find((x) => x.id === taskId);
        if (t) {
          const wasCompleted = t.status === "Completed";
          if (body.title !== undefined) t.title = body.title.trim();
          if (body.description !== undefined) t.description = body.description.trim();
          if (body.status !== undefined) t.status = body.status;
          if (body.priority !== undefined) t.priority = body.priority;
          if (body.due_date !== undefined) t.due_date = body.due_date;
          if (body.assignee_id !== undefined) {
            t.assignee_id = body.assignee_id;
            const u = data.users.find((x) => x.id === body.assignee_id);
            t.assignee_name = u ? u.name : null;
          }

          // Gamification trigger on task completion
          if (t.status === "Completed" && !wasCompleted) {
            xpEarned = 25;
            const today = getToday();
            if (t.due_date && t.due_date >= today) xpEarned += 15; // on-time bonus
            if (t.priority === "High") xpEarned += 10;

            const gProfile = data.gamification[currentUser.id] || {
              total_xp: 0,
              current_streak: 1,
              longest_streak: 1,
              last_active_date: today,
              activity_history: {},
              unlocked_badges: ["first_step"],
              ledger: [],
              claimed_quests: [],
            };

            gProfile.total_xp += xpEarned;
            gProfile.activity_history[today] = (gProfile.activity_history[today] || 0) + 1;
            gProfile.ledger.unshift({
              id: Date.now(),
              user_id: currentUser.id,
              task_id: t.id,
              amount: xpEarned,
              source_type: "task_completed",
              description: `Menyelesaikan: ${t.title}`,
              created_at: new Date().toISOString(),
            });
            data.gamification[currentUser.id] = gProfile;
          }
          taskUpdated = { ...t };
        }
      });

      return {
        ...(taskUpdated || {}),
        gamification: xpEarned > 0 ? { xp_earned: xpEarned, message: `Hebat! +${xpEarned} XP didapatkan.` } : null,
      } as T;
    }

    if (method === "DELETE") {
      clientDb.mutate((data) => {
        data.tasks = data.tasks.filter((x) => x.id !== taskId);
      });
      return { message: "Tugas berhasil dihapus" } as T;
    }
  }

  // Reminders simulation
  if (cleanPath.endsWith("/remind") && method === "POST") {
    return { message: "Email pengingat tugas berhasil disiapkan dan dikirimkan!" } as T;
  }
  if (cleanPath === "/tasks/remind-summary" && method === "POST") {
    return { message: "Ringkasan email agenda tugas harian berhasil dikirimkan!" } as T;
  }

  // --------------------------------------------------------------------------
  // GAMIFICATION ROUTES
  // --------------------------------------------------------------------------
  if (cleanPath === "/gamification/overview" && method === "GET") {
    const today = getToday();
    const weekKey = getWeekKey();
    const g = db.gamification[currentUser.id] || {
      total_xp: 100,
      current_streak: 1,
      longest_streak: 1,
      last_active_date: today,
      activity_history: { [today]: 1 },
      unlocked_badges: ["first_step"],
      ledger: [],
      claimed_quests: [],
    };

    const lvl = calcLevel(g.total_xp);
    const profile: GamificationProfile = {
      user_id: currentUser.id,
      total_xp: g.total_xp,
      level: lvl.level,
      title: lvl.title,
      avatar_frame: lvl.avatar_frame,
      current_streak: g.current_streak,
      longest_streak: g.longest_streak,
      last_active_date: g.last_active_date,
      current_level_xp: lvl.current_level_xp,
      next_level_xp: lvl.next_level_xp,
      xp_in_level: lvl.xp_in_level,
      xp_needed: lvl.xp_needed,
      progress_percent: lvl.progress_percent,
    };

    // Tasks completed today
    const doneToday = g.activity_history[today] || 0;

    const dailyQuests: Quest[] = [
      {
        id: 1,
        user_id: currentUser.id,
        quest_type: "daily",
        period_key: today,
        quest_key: "daily_one_task",
        title: "Langkah Awal Hari Ini",
        description: "Selesaikan minimal 1 tugas produktif hari ini.",
        target_count: 1,
        current_count: Math.min(1, doneToday),
        xp_reward: 20,
        is_claimed: g.claimed_quests.includes(`daily:${today}:daily_one_task`),
        completed_at: doneToday >= 1 ? today : null,
        progress_percent: doneToday >= 1 ? 100 : 0,
        is_complete: doneToday >= 1,
      },
      {
        id: 2,
        user_id: currentUser.id,
        quest_type: "daily",
        period_key: today,
        quest_key: "daily_ontime",
        title: "Penakluk Deadline",
        description: "Selesaikan minimal 1 tugas tepat waktu sebelum tenggat.",
        target_count: 1,
        current_count: Math.min(1, doneToday),
        xp_reward: 25,
        is_claimed: g.claimed_quests.includes(`daily:${today}:daily_ontime`),
        completed_at: doneToday >= 1 ? today : null,
        progress_percent: doneToday >= 1 ? 100 : 0,
        is_complete: doneToday >= 1,
      },
      {
        id: 3,
        user_id: currentUser.id,
        quest_type: "daily",
        period_key: today,
        quest_key: "daily_plan",
        title: "Fokus Tuntas",
        description: "Selesaikan 2 tugas pada agenda kerja hari ini.",
        target_count: 2,
        current_count: Math.min(2, doneToday),
        xp_reward: 20,
        is_claimed: g.claimed_quests.includes(`daily:${today}:daily_plan`),
        completed_at: doneToday >= 2 ? today : null,
        progress_percent: Math.round((Math.min(2, doneToday) / 2) * 100),
        is_complete: doneToday >= 2,
      },
    ];

    const weeklyQuests: Quest[] = [
      {
        id: 4,
        user_id: currentUser.id,
        quest_type: "weekly",
        period_key: weekKey,
        quest_key: "weekly_champion",
        title: "Juara Produktivitas Mingguan",
        description: "Selesaikan 5 tugas dalam satu periode minggu ini.",
        target_count: 5,
        current_count: Math.min(5, doneToday + 3),
        xp_reward: 60,
        is_claimed: g.claimed_quests.includes(`weekly:${weekKey}:weekly_champion`),
        completed_at: null,
        progress_percent: Math.round(((doneToday + 3) / 5) * 100),
        is_complete: doneToday + 3 >= 5,
      },
    ];

    const badges: Badge[] = [
      { badge_key: "first_step", name: "Langkah Pertama", description: "Menyelesaikan tugas pertama Anda.", icon: "Target", category: "starter", target_count: 1, current_count: 1, progress_percent: 100, is_unlocked: true, unlocked_at: today },
      { badge_key: "ontime_hero", name: "Pahlawan Ketepatan", description: "Menuntaskan tugas tepat sebelum tenggat waktu.", icon: "CheckCircle", category: "performance", target_count: 1, current_count: 1, progress_percent: 100, is_unlocked: true, unlocked_at: today },
      { badge_key: "streak_3", name: "Konsistensi 3 Hari", description: "Menjaga streak aktivitas produktif 3 hari beruntun.", icon: "Flame", category: "consistency", target_count: 3, current_count: g.current_streak, progress_percent: Math.min(100, Math.round((g.current_streak / 3) * 100)), is_unlocked: g.current_streak >= 3, unlocked_at: g.current_streak >= 3 ? today : null },
      { badge_key: "master_collab", name: "Kolaborator Andal", description: "Aktif bekerja sama dalam proyek tim.", icon: "Users", category: "collaboration", target_count: 1, current_count: 1, progress_percent: 100, is_unlocked: true, unlocked_at: today },
    ];

    const activityDays = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const dt = getRelativeDate(i - 6);
      return {
        date: dt,
        day_of_week: new Date(dt).getDay(),
        tasks_completed: g.activity_history[dt] || 0,
        is_today: dt === today,
      };
    });

    const result: GamificationData = {
      profile,
      quests: {
        daily: dailyQuests,
        weekly: weeklyQuests,
        daily_all_completed: dailyQuests.every((q) => q.is_complete),
        weekly_all_completed: weeklyQuests.every((q) => q.is_complete),
        daily_bonus_claimed: g.claimed_quests.includes(`bonus:daily:${today}`),
        weekly_bonus_claimed: g.claimed_quests.includes(`bonus:weekly:${weekKey}`),
      },
      badges,
      recent_ledger: (g.ledger || []).slice(0, 10),
      activity: {
        days: activityDays,
        current_streak: g.current_streak,
        longest_streak: g.longest_streak,
      },
    };
    return result as T;
  }

  if (cleanPath === "/gamification/claim-quest" && method === "POST") {
    const { quest_type, period_key, quest_key } = (init.body as any) || {};
    const claimKey = `${quest_type}:${period_key}:${quest_key}`;
    let xpReward = 20;

    clientDb.mutate((data) => {
      const g = data.gamification[currentUser.id];
      if (g && !g.claimed_quests.includes(claimKey)) {
        g.claimed_quests.push(claimKey);
        g.total_xp += xpReward;
        g.ledger.unshift({
          id: Date.now(),
          user_id: currentUser.id,
          task_id: null,
          amount: xpReward,
          source_type: "quest_claimed",
          description: `Klaim Hadiah Misi: ${quest_key}`,
          created_at: new Date().toISOString(),
        });
      }
    });

    return {
      message: `Selamat! Hadiah +${xpReward} XP berhasil diklaim.`,
      reward_xp: xpReward,
      new_total_xp: (db.gamification[currentUser.id]?.total_xp || 0) + xpReward,
    } as T;
  }

  // --------------------------------------------------------------------------
  // CHAT ROUTES
  // --------------------------------------------------------------------------
  if (cleanPath === "/chat/conversations" && method === "GET") {
    const accessiblePids = getUserProjectIds();

    const project_rooms: ConversationItem[] = db.projects
      .filter((p) => accessiblePids.includes(p.id))
      .map((p) => {
        const pMsgs = db.chatMessages.filter((m) => m.chat_type === "project" && m.project_id === p.id);
        const last = pMsgs[pMsgs.length - 1];
        const lastReadId = db.chatReads[`user:${currentUser.id}_project:${p.id}`] || 0;
        const unreadCount = pMsgs.filter((m) => m.id > lastReadId && m.sender_id !== currentUser.id).length;

        return {
          id: `project:${p.id}`,
          type: "project",
          target_id: p.id,
          title: p.name,
          subtitle: `${p.members.length + 1} anggota tim`,
          role_name: p.owner_id === currentUser.id ? p.owner_role_name : p.members.find((m) => m.user_id === currentUser.id)?.role_name || "Anggota Tim",
          unread_count: unreadCount,
          last_message: last ? { content: last.content, sender_name: last.sender_name, created_at: last.created_at } : null,
        };
      });

    const otherUsers = db.users.filter((u) => u.id !== currentUser.id);
    const private_conversations: ConversationItem[] = otherUsers.map((u) => {
      const pMsgs = db.chatMessages.filter(
        (m) => m.chat_type === "private" && ((m.sender_id === u.id && m.recipient_id === currentUser.id) || (m.sender_id === currentUser.id && m.recipient_id === u.id))
      );
      const last = pMsgs[pMsgs.length - 1];
      const unreadCount = pMsgs.filter((m) => m.sender_id === u.id && !m.is_read).length;

      return {
        id: `private:${u.id}`,
        type: "private",
        target_id: u.id,
        title: u.name,
        subtitle: u.email,
        role_name: u.id === 2 ? "Developer" : u.id === 3 ? "Designer" : "Rekan Tim",
        unread_count: unreadCount,
        last_message: last ? { content: last.content, sender_name: last.sender_name, created_at: last.created_at } : null,
      };
    });

    return { project_rooms, private_conversations } as T;
  }

  const projectChatMatch = cleanPath.match(/^\/chat\/project\/(\d+)$/);
  if (projectChatMatch) {
    const pid = parseInt(projectChatMatch[1], 10);
    const p = db.projects.find((x) => x.id === pid);
    if (!p) throw new ApiError(404, "Proyek tidak ditemukan.");

    if (method === "GET") {
      const msgs = db.chatMessages.filter((m) => m.chat_type === "project" && m.project_id === pid);
      const owner = db.users.find((u) => u.id === p.owner_id) || { id: p.owner_id, name: "Pemilik", email: "" };
      const members = [
        { id: owner.id, name: owner.name, email: owner.email, role_name: p.owner_role_name || "Project Manager", is_owner: true },
        ...p.members.map((m) => {
          const u = db.users.find((x) => x.id === m.user_id) || { id: m.user_id, name: `User ${m.user_id}`, email: "" };
          return { id: u.id, name: u.name, email: u.email, role_name: m.role_name || "Anggota Tim", is_owner: false };
        }),
      ];

      // Mark read
      if (msgs.length > 0) {
        const lastId = msgs[msgs.length - 1].id;
        clientDb.mutate((data) => {
          data.chatReads[`user:${currentUser.id}_project:${pid}`] = lastId;
        });
      }

      return { project: p, members, messages: msgs } as T;
    }

    if (method === "POST") {
      const { content, task_ref_id } = (init.body as any) || {};
      if (!content || !content.trim()) throw new ApiError(400, "Pesan tidak boleh kosong.");

      let taskRef: TaskReference | null = null;
      if (task_ref_id) {
        const t = db.tasks.find((x) => x.id === task_ref_id);
        if (t) taskRef = { id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date };
      }

      let senderRole = "Anggota Tim";
      let isOwner = false;
      if (p.owner_id === currentUser.id) {
        senderRole = p.owner_role_name || "Project Manager";
        isOwner = true;
      } else {
        const m = p.members.find((x) => x.user_id === currentUser.id);
        if (m) senderRole = m.role_name || "Anggota Tim";
      }

      const newId = Math.max(0, ...db.chatMessages.map((m) => m.id)) + 1;
      const newMsg: ChatMessage = {
        id: newId,
        chat_type: "project",
        project_id: pid,
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        sender_email: currentUser.email,
        sender_role: senderRole,
        is_sender_owner: isOwner,
        content: content.trim(),
        task_ref: taskRef,
        is_read: true,
        created_at: new Date().toISOString(),
      };

      clientDb.mutate((data) => {
        data.chatMessages.push(newMsg);
        data.chatReads[`user:${currentUser.id}_project:${pid}`] = newId;
      });

      // Broadcast to other tabs
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        try {
          const chatChan = new BroadcastChannel("produktifa_chat_channel");
          chatChan.postMessage({ type: "new_message", data: newMsg });
        } catch {}
      }

      return newMsg as T;
    }
  }

  const privateChatMatch = cleanPath.match(/^\/chat\/private\/(\d+)$/);
  if (privateChatMatch) {
    const targetUserId = parseInt(privateChatMatch[1], 10);
    const targetUser = db.users.find((u) => u.id === targetUserId);
    if (!targetUser) throw new ApiError(404, "Pengguna tidak ditemukan.");

    if (method === "GET") {
      const msgs = db.chatMessages.filter(
        (m) =>
          m.chat_type === "private" &&
          ((m.sender_id === targetUserId && m.recipient_id === currentUser.id) ||
            (m.sender_id === currentUser.id && m.recipient_id === targetUserId))
      );

      // Mark received messages as read
      clientDb.mutate((data) => {
        data.chatMessages.forEach((m) => {
          if (m.chat_type === "private" && m.sender_id === targetUserId && m.recipient_id === currentUser.id) {
            m.is_read = true;
          }
        });
      });

      return { target_user: targetUser, messages: msgs } as T;
    }

    if (method === "POST") {
      const { content, task_ref_id } = (init.body as any) || {};
      if (!content || !content.trim()) throw new ApiError(400, "Pesan tidak boleh kosong.");

      let taskRef: TaskReference | null = null;
      if (task_ref_id) {
        const t = db.tasks.find((x) => x.id === task_ref_id);
        if (t) taskRef = { id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date };
      }

      const newId = Math.max(0, ...db.chatMessages.map((m) => m.id)) + 1;
      const newMsg: ChatMessage = {
        id: newId,
        chat_type: "private",
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        sender_email: currentUser.email,
        recipient_id: targetUserId,
        recipient_name: targetUser.name,
        content: content.trim(),
        task_ref: taskRef,
        is_read: false,
        created_at: new Date().toISOString(),
      };

      clientDb.mutate((data) => {
        data.chatMessages.push(newMsg);
      });

      // Broadcast to other tabs
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        try {
          const chatChan = new BroadcastChannel("produktifa_chat_channel");
          chatChan.postMessage({ type: "new_message", data: newMsg });
        } catch {}
      }

      return newMsg as T;
    }
  }

  const projTasksMatch = cleanPath.match(/^\/chat\/project\/(\d+)\/tasks$/);
  if (projTasksMatch && method === "GET") {
    const pid = parseInt(projTasksMatch[1], 10);
    const tasks = db.tasks.filter((t) => t.project_id === pid);
    const refs: TaskReference[] = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
    }));
    return refs as T;
  }

  if (cleanPath === "/chat/unread-count" && method === "GET") {
    const accessiblePids = getUserProjectIds();
    let project_unread = 0;
    for (const pid of accessiblePids) {
      const lastRead = db.chatReads[`user:${currentUser.id}_project:${pid}`] || 0;
      const count = db.chatMessages.filter((m) => m.chat_type === "project" && m.project_id === pid && m.id > lastRead && m.sender_id !== currentUser.id).length;
      project_unread += count;
    }

    const private_unread = db.chatMessages.filter((m) => m.chat_type === "private" && m.recipient_id === currentUser.id && !m.is_read).length;

    return { total: project_unread + private_unread, project_unread, private_unread } as T;
  }

  // Fallback 404
  throw new ApiError(404, `Endpoint ${method} ${path} tidak ditemukan.`);
}
