import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const SECRET_KEY = process.env.SECRET_KEY || process.env.JWT_SECRET || 'produktifa-super-secret-key-2026';
const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'data', 'produktifa.db');
const DB_DIR = path.dirname(DB_FILE);

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initialize SQLite database
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');

export type Status = 'To Do' | 'In Progress' | 'Completed';
export type Priority = 'Low' | 'Medium' | 'High';

export interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface ProjectRow {
  id: number;
  owner_id: number;
  name: string;
  description: string;
  owner_role_name?: string;
  owner_jobdesk?: string;
  created_at: string;
}

export interface TaskRow {
  id: number;
  project_id: number;
  creator_id: number;
  assignee_id?: number | null;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRoleRow {
  id: number;
  project_id: number;
  name: string;
  description: string;
  color: string;
  created_at: string;
}

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function getRelativeDate(daysOffset: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

function initDatabase() {
  // 1. Create Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // 2. Create Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name VARCHAR(120) NOT NULL,
      description TEXT DEFAULT '',
      owner_role_name VARCHAR(80) DEFAULT 'Project Manager',
      owner_jobdesk TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
  `);

  // 3. Create Project Members table (many-to-many relationship with role & jobdesk)
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role_id INTEGER,
      role_name VARCHAR(80) DEFAULT '',
      jobdesk TEXT DEFAULT '',
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 3b. Create Project Roles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name VARCHAR(80) NOT NULL,
      description TEXT DEFAULT '',
      color VARCHAR(20) DEFAULT '#0284c7',
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_project_roles_project ON project_roles(project_id);
  `);

  // 4. Create Tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      creator_id INTEGER NOT NULL,
      assignee_id INTEGER,
      title VARCHAR(160) NOT NULL,
      description TEXT DEFAULT '',
      status VARCHAR(20) DEFAULT 'To Do',
      priority VARCHAR(20) DEFAULT 'Medium',
      due_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (creator_id) REFERENCES users(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  `);

  // Safe migrations for existing SQLite file
  try { db.exec("ALTER TABLE project_members ADD COLUMN role_id INTEGER;"); } catch {}
  try { db.exec("ALTER TABLE project_members ADD COLUMN role_name TEXT DEFAULT '';"); } catch {}
  try { db.exec("ALTER TABLE project_members ADD COLUMN jobdesk TEXT DEFAULT '';"); } catch {}
  try { db.exec("ALTER TABLE projects ADD COLUMN owner_role_name TEXT DEFAULT 'Project Manager';"); } catch {}
  try { db.exec("ALTER TABLE tasks ADD COLUMN assignee_id INTEGER;"); } catch {}
  try {
    db.exec(`
      UPDATE project_members SET role_name = 'Developer' WHERE user_id = 2 AND (role_name IS NULL OR role_name = '');
      UPDATE project_members SET role_name = 'Designer' WHERE user_id = 3 AND (role_name IS NULL OR role_name = '');
      UPDATE project_members SET role_name = 'Project Manager' WHERE user_id = 1 AND (role_name IS NULL OR role_name = '');
      UPDATE user_quests SET title = 'Penakluk Deadline' WHERE quest_key = 'daily_ontime';
    `);
  } catch {}

  // 5. GAMIFICATION TABLES
  db.exec(`
    CREATE TABLE IF NOT EXISTS gamification_profiles (
      user_id INTEGER PRIMARY KEY,
      total_xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_active_date TEXT,
      avatar_frame VARCHAR(50) DEFAULT 'bronze',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS xp_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER,
      amount INTEGER NOT NULL,
      source_type VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_xp_ledger_user ON xp_ledger(user_id);

    CREATE TABLE IF NOT EXISTS completed_task_xp (
      task_id INTEGER PRIMARY KEY,
      awarded_user_id INTEGER NOT NULL,
      base_xp INTEGER NOT NULL,
      bonus_xp INTEGER DEFAULT 0,
      awarded_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_activity_days (
      user_id INTEGER NOT NULL,
      activity_date TEXT NOT NULL,
      tasks_completed INTEGER DEFAULT 1,
      PRIMARY KEY (user_id, activity_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      badge_key VARCHAR(50) NOT NULL,
      unlocked_at TEXT NOT NULL,
      UNIQUE(user_id, badge_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      quest_type VARCHAR(20) NOT NULL,
      period_key VARCHAR(30) NOT NULL,
      quest_key VARCHAR(50) NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      target_count INTEGER NOT NULL,
      current_count INTEGER NOT NULL DEFAULT 0,
      xp_reward INTEGER NOT NULL,
      is_claimed INTEGER DEFAULT 0,
      completed_at TEXT,
      UNIQUE(user_id, period_key, quest_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_user_quests_user_period ON user_quests(user_id, period_key);

    -- 6. CHAT TABLES (PRIVATE & PROJECT CHAT)
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_type VARCHAR(20) NOT NULL,
      project_id INTEGER,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER,
      content TEXT NOT NULL,
      task_ref_id INTEGER,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_ref_id) REFERENCES tasks(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_project ON chat_messages(chat_type, project_id, id);
    CREATE INDEX IF NOT EXISTS idx_chat_private ON chat_messages(chat_type, sender_id, recipient_id, id);
    CREATE INDEX IF NOT EXISTS idx_chat_recipient_unread ON chat_messages(recipient_id, is_read);

    CREATE TABLE IF NOT EXISTS project_chat_reads (
      user_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      last_read_message_id INTEGER DEFAULT 0,
      last_read_at TEXT NOT NULL,
      PRIMARY KEY (user_id, project_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  // Seed default demo accounts and projects if table is empty
  const userCount = (db.prepare('SELECT count(*) as count FROM users').get() as { count: number }).count;
  if (userCount === 0) {
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync('rahasia123', salt);
    const now = new Date().toISOString();

    const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)');
    insertUser.run('Ani Lestari', 'ani@mail.com', passwordHash, now); // id 1
    insertUser.run('Budi Santoso', 'budi@mail.com', passwordHash, now); // id 2
    insertUser.run('Citra Dewi', 'citra@mail.com', passwordHash, now); // id 3

    const insertProj = db.prepare('INSERT INTO projects (owner_id, name, description, owner_role_name, owner_jobdesk, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    insertProj.run(1, 'Peluncuran Website Produktifa', 'Pengembangan platform manajemen proyek tim dan peluncuran MVP publik.', 'Project Manager', 'Memimpin perencanaan produk, alokasi sumber daya tim, dan mengawal timeline rilis.', now); // id 1
    insertProj.run(1, 'Riset Desain UI/UX 2026', 'Analisis kebutuhan pengguna, wireframe, dan uji kegunaan prototipe aplikasi.', 'Product Lead', 'Menentukan metodologi riset pengguna dan mengarahkan validasi desain antarmuka.', now); // id 2
    insertProj.run(2, 'Integrasi API Mobile Budi', 'Sinkronisasi backend FastAPI dengan modul notifikasi mobile push.', 'Lead Architect', 'Merancang arsitektur microservices dan skema token push notification.', now); // id 3

    const insertMember = db.prepare('INSERT INTO project_members (project_id, user_id, role_name, jobdesk) VALUES (?, ?, ?, ?)');
    insertMember.run(1, 2, 'Developer', 'Mengembangkan fitur backend, integrasi REST API, modul autentikasi JWT, dan query database.'); // Budi
    insertMember.run(1, 3, 'Designer', 'Membuat logo, poster promosi, desain media sosial, dan materi wireframe antarmuka UI/UX.'); // Citra
    insertMember.run(3, 1, 'Project Manager', 'Mengawasi jadwal sprint, memfasilitasi kebutuhan integrasi, dan review capaian mingguan.'); // Ani

    const insertTask = db.prepare(`
      INSERT INTO tasks (project_id, creator_id, assignee_id, title, description, status, priority, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertTask.run(1, 1, 3, 'Desain Wireframe & Arsitektur Sistem', 'Menyusun alur pengguna untuk dashboard, halaman proyek, dan kanban tugas sesuai brand guidelines.', 'Completed', 'High', getRelativeDate(-4), now, now);
    insertTask.run(1, 1, 2, 'Implementasi Autentikasi JWT & Role Access', 'Isolasi akses proyek: data milik akun lain tidak bocor (404), hak owner vs anggota.', 'Completed', 'High', getRelativeDate(-1), now, now);
    insertTask.run(1, 2, 2, 'Filter & Pencarian Tugas Interaktif', 'Pencarian kata kunci q, filter status, filter prioritas, dan tenggat waktu terlambat.', 'In Progress', 'Medium', getRelativeDate(2), now, now);
    insertTask.run(1, 1, 1, 'Finalisasi Uji Integrasi & QA', 'Menjalankan skenario pengujian unit pytest dan end-to-end responsivitas layar.', 'To Do', 'High', getRelativeDate(5), now, now);
    insertTask.run(2, 1, 1, 'Kuesioner Pengalaman Pengguna', 'Kumpulkan tanggapan dari 20 responden awal mengenai kemudahan antarmuka.', 'In Progress', 'Medium', getRelativeDate(-2), now, now);
    insertTask.run(2, 1, 3, 'Penyusunan Desain Sistem & Typography', 'Palet warna slate + indigo dan tipografi ramah pembaca.', 'Completed', 'Low', getRelativeDate(7), now, now);
    insertTask.run(3, 2, 2, 'Audit Endpoint REST & Optimasi Query', 'Pemeriksaan performa kalkulasi summary dashboard dan filter index.', 'To Do', 'Medium', getRelativeDate(3), now, now);

    console.log('SQLite database initialized and seeded with demo accounts.');
  }

  // Ensure default roles exist for any existing projects
  const allProjects = db.prepare('SELECT id FROM projects').all() as { id: number }[];
  allProjects.forEach((p) => seedDefaultProjectRoles(p.id));

  // Run Gamification initialization and bootstrap
  migrateGamification();

  // Run Chat initialization & demo seeding
  seedDemoChat();
}


function seedDefaultProjectRoles(projectId: number) {
  const existingCount = (db.prepare('SELECT count(*) as c FROM project_roles WHERE project_id = ?').get(projectId) as { c: number }).c;
  if (existingCount === 0) {
    const now = new Date().toISOString();
    const insertRole = db.prepare('INSERT INTO project_roles (project_id, name, description, color, created_at) VALUES (?, ?, ?, ?, ?)');
    insertRole.run(projectId, 'Project Manager', 'Menentukan arah proyek, timeline, koordinasi antar anggota, dan evaluasi hasil.', '#0d3b66', now);
    insertRole.run(projectId, 'Designer', 'Membuat logo, poster promosi, desain media sosial, dan materi visual UI/UX.', '#7c3aed', now);
    insertRole.run(projectId, 'Developer', 'Mengembangkan fitur aplikasi, integrasi backend API, dan perbaikan bug.', '#0284c7', now);
    insertRole.run(projectId, 'Marketing', 'Menyusun strategi promosi produk, materi rilis publik, dan riset pasar.', '#059669', now);
    insertRole.run(projectId, 'Finance', 'Mengelola alokasi anggaran operasional proyek dan laporan biaya.', '#d97706', now);
  }
}

// ============================================================================
// GAMIFICATION CORE LOGIC: XP, LEVEL, STREAK, QUEST, & BADGES
// ============================================================================

export const LEVEL_THRESHOLDS = [
  { level: 1, xp: 0, title: 'Pemula', frame: 'bronze' },
  { level: 2, xp: 100, title: 'Pemula', frame: 'bronze' },
  { level: 3, xp: 250, title: 'Pemula', frame: 'bronze' },
  { level: 4, xp: 450, title: 'Pemula', frame: 'bronze' },
  { level: 5, xp: 700, title: 'Konsisten', frame: 'silver' },
  { level: 6, xp: 1000, title: 'Konsisten', frame: 'silver' },
  { level: 7, xp: 1350, title: 'Konsisten', frame: 'silver' },
  { level: 8, xp: 1750, title: 'Konsisten', frame: 'silver' },
  { level: 9, xp: 2200, title: 'Konsisten', frame: 'silver' },
  { level: 10, xp: 2700, title: 'Produktif', frame: 'gold' },
  { level: 11, xp: 3250, title: 'Produktif', frame: 'gold' },
  { level: 12, xp: 3850, title: 'Produktif', frame: 'gold' },
  { level: 13, xp: 4500, title: 'Produktif', frame: 'gold' },
  { level: 14, xp: 5200, title: 'Produktif', frame: 'gold' },
  { level: 15, xp: 5950, title: 'Produktif', frame: 'gold' },
  { level: 16, xp: 6750, title: 'Produktif', frame: 'gold' },
  { level: 17, xp: 7600, title: 'Produktif', frame: 'gold' },
  { level: 18, xp: 8500, title: 'Produktif', frame: 'gold' },
  { level: 19, xp: 9450, title: 'Produktif', frame: 'gold' },
  { level: 20, xp: 10500, title: 'Master Produktivitas', frame: 'diamond' },
];

function calculateLevelDetails(totalXp: number) {
  let currentTier = LEVEL_THRESHOLDS[0];
  let nextTier = LEVEL_THRESHOLDS[1];

  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i].xp) {
      currentTier = LEVEL_THRESHOLDS[i];
      nextTier = LEVEL_THRESHOLDS[i + 1] || null;
      break;
    }
  }

  const currentLevelXp = currentTier.xp;
  const nextLevelXp = nextTier ? nextTier.xp : currentTier.xp + 1500;
  const xpInLevel = Math.max(0, totalXp - currentLevelXp);
  const xpNeeded = nextTier ? nextLevelXp - currentLevelXp : 1500;
  const progressPercent = nextTier ? Math.min(100, Math.round((xpInLevel / xpNeeded) * 100)) : 100;

  return {
    level: currentTier.level,
    title: currentTier.title,
    avatar_frame: currentTier.frame,
    total_xp: totalXp,
    current_level_xp: currentLevelXp,
    next_level_xp: nextLevelXp,
    xp_in_level: xpInLevel,
    xp_needed: xpNeeded,
    progress_percent: progressPercent,
  };
}

function getWeekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function ensureGamificationProfile(userId: number) {
  const existing = db.prepare('SELECT * FROM gamification_profiles WHERE user_id = ?').get(userId);
  if (!existing) {
    db.prepare(`
      INSERT INTO gamification_profiles (user_id, total_xp, level, current_streak, longest_streak, avatar_frame)
      VALUES (?, 0, 1, 0, 0, 'bronze')
    `).run(userId);
  }
}

function calculateUserStreak(userId: number) {
  ensureGamificationProfile(userId);
  const profile = db.prepare('SELECT * FROM gamification_profiles WHERE user_id = ?').get(userId) as any;

  const activeDays = db.prepare(`
    SELECT activity_date, tasks_completed 
    FROM user_activity_days 
    WHERE user_id = ? AND tasks_completed > 0 
    ORDER BY activity_date DESC
  `).all(userId) as { activity_date: string; tasks_completed: number }[];

  const dateSet = new Set(activeDays.map((d) => d.activity_date));
  let currentStreak = 0;

  let checkDate = new Date();
  const todayStr = checkDate.toISOString().split('T')[0];

  if (dateSet.has(todayStr)) {
    while (true) {
      const dStr = checkDate.toISOString().split('T')[0];
      if (dateSet.has(dStr)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  } else {
    // Check if streak was active yesterday
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterdayStr = checkDate.toISOString().split('T')[0];
    if (dateSet.has(yesterdayStr)) {
      while (true) {
        const dStr = checkDate.toISOString().split('T')[0];
        if (dateSet.has(dStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    } else {
      currentStreak = 0;
    }
  }

  const prevLongest = profile ? profile.longest_streak : 0;
  const longestStreak = Math.max(prevLongest, currentStreak);

  return { currentStreak, longestStreak };
}

function ensureUserQuests(userId: number) {
  const today = getTodayString();
  const week = getWeekKey();

  // Daily Quests definition
  const dailyQuests = [
    {
      key: 'daily_one_task',
      title: 'Langkah Awal Hari Ini',
      description: 'Selesaikan minimal 1 tugas produktif hari ini.',
      target: 1,
      xp: 20,
    },
    {
      key: 'daily_ontime',
      title: 'Penakluk Deadline',
      description: 'Selesaikan minimal 1 tugas tepat waktu sebelum tenggat.',
      target: 1,
      xp: 25,
    },
    {
      key: 'daily_plan',
      title: 'Fokus Tuntas',
      description: 'Selesaikan 2 tugas pada agenda kerja hari ini.',
      target: 2,
      xp: 20,
    },
  ];

  for (const q of dailyQuests) {
    const existing = db.prepare('SELECT 1 FROM user_quests WHERE user_id = ? AND period_key = ? AND quest_key = ?').get(userId, today, q.key);
    if (!existing) {
      db.prepare(`
        INSERT INTO user_quests (user_id, quest_type, period_key, quest_key, title, description, target_count, current_count, xp_reward, is_claimed)
        VALUES (?, 'daily', ?, ?, ?, ?, ?, 0, ?, 0)
      `).run(userId, today, q.key, q.title, q.description, q.target, q.xp);
    }
  }

  // Weekly Quests definition
  const weeklyQuests = [
    {
      key: 'weekly_five_tasks',
      title: 'Pekerja Keras Mingguan',
      description: 'Selesaikan minimal 5 tugas produktif dalam minggu ini.',
      target: 5,
      xp: 50,
    },
    {
      key: 'weekly_ontime',
      title: 'Disiplin Tenggat Andal',
      description: 'Selesaikan minimal 2 tugas tepat waktu sepanjang minggu ini.',
      target: 2,
      xp: 35,
    },
    {
      key: 'weekly_project_progress',
      title: 'Akselerasi Proyek',
      description: 'Selesaikan tugas pada minimal 2 proyek berbeda minggu ini.',
      target: 2,
      xp: 40,
    },
  ];

  for (const q of weeklyQuests) {
    const existing = db.prepare('SELECT 1 FROM user_quests WHERE user_id = ? AND period_key = ? AND quest_key = ?').get(userId, week, q.key);
    if (!existing) {
      db.prepare(`
        INSERT INTO user_quests (user_id, quest_type, period_key, quest_key, title, description, target_count, current_count, xp_reward, is_claimed)
        VALUES (?, 'weekly', ?, ?, ?, ?, ?, 0, ?, 0)
      `).run(userId, week, q.key, q.title, q.description, q.target, q.xp);
    }
  }
}

function updateQuestProgressOnTaskComplete(userId: number, task: TaskRow, isOnTime: boolean) {
  ensureUserQuests(userId);
  const today = getTodayString();
  const week = getWeekKey();

  // Daily quests increment
  db.prepare(`
    UPDATE user_quests 
    SET current_count = min(target_count, current_count + 1)
    WHERE user_id = ? AND period_key = ? AND quest_key = 'daily_one_task'
  `).run(userId, today);

  if (isOnTime) {
    db.prepare(`
      UPDATE user_quests 
      SET current_count = min(target_count, current_count + 1)
      WHERE user_id = ? AND period_key = ? AND quest_key = 'daily_ontime'
    `).run(userId, today);
  }

  db.prepare(`
    UPDATE user_quests 
    SET current_count = min(target_count, current_count + 1)
    WHERE user_id = ? AND period_key = ? AND quest_key = 'daily_plan'
  `).run(userId, today);

  // Weekly quests increment
  db.prepare(`
    UPDATE user_quests 
    SET current_count = min(target_count, current_count + 1)
    WHERE user_id = ? AND period_key = ? AND quest_key = 'weekly_five_tasks'
  `).run(userId, week);

  if (isOnTime) {
    db.prepare(`
      UPDATE user_quests 
      SET current_count = min(target_count, current_count + 1)
      WHERE user_id = ? AND period_key = ? AND quest_key = 'weekly_ontime'
    `).run(userId, week);
  }

  // Count distinct projects with completed tasks this week
  const projectCount = (db.prepare(`
    SELECT count(DISTINCT t.project_id) as c
    FROM completed_task_xp cx
    JOIN tasks t ON cx.task_id = t.id
    WHERE cx.awarded_user_id = ? AND cx.awarded_at >= date('now', '-7 days')
  `).get(userId) as { c: number }).c;

  db.prepare(`
    UPDATE user_quests 
    SET current_count = min(target_count, ?)
    WHERE user_id = ? AND period_key = ? AND quest_key = 'weekly_project_progress'
  `).run(projectCount, userId, week);
}

export const BADGE_DEFINITIONS = [
  { key: 'first_step', name: 'First Step', description: 'Menyelesaikan tugas pertama Anda.', icon: 'Footprints', category: 'starter' as const, target: 1 },
  { key: 'project_starter', name: 'Project Starter', description: 'Menyelesaikan seluruh tugas dalam 1 proyek hingga 100%.', icon: 'FolderCheck', category: 'starter' as const, target: 1 },
  { key: 'on_fire', name: 'On Fire', description: 'Mempertahankan streak produktif selama 3 hari berturut-turut.', icon: 'Flame', category: 'consistency' as const, target: 3 },
  { key: 'unstoppable', name: 'Unstoppable', description: 'Mempertahankan streak produktif selama 7 hari berturut-turut.', icon: 'Zap', category: 'consistency' as const, target: 7 },
  { key: 'deadline_hero', name: 'Deadline Hero', description: 'Menyelesaikan 5 tugas tepat waktu tanpa terlambat.', icon: 'ShieldCheck', category: 'performance' as const, target: 5 },
  { key: 'task_crusher', name: 'Task Crusher', description: 'Menyelesaikan 25 tugas nyata di seluruh proyek.', icon: 'Award', category: 'performance' as const, target: 25 },
  { key: 'project_finisher', name: 'Project Finisher', description: 'Menyelesaikan minimal 3 proyek secara tuntas 100%.', icon: 'Trophy', category: 'performance' as const, target: 3 },
  { key: 'team_player', name: 'Team Player', description: 'Berkontribusi menyelesaikan tugas dalam proyek kolaborasi tim.', icon: 'Users', category: 'collaboration' as const, target: 1 },
  { key: 'goal_getter', name: 'Goal Getter', description: 'Membantu tim mencapai target dengan menuntaskan 3 tugas dalam satu proyek tim.', icon: 'Target', category: 'collaboration' as const, target: 3 },
];

function evaluateAndGetBadges(userId: number) {
  ensureGamificationProfile(userId);
  const streakInfo = calculateUserStreak(userId);

  // 1. Total completed tasks by this user
  const totalCompleted = (db.prepare(`
    SELECT count(*) as c FROM tasks
    WHERE (assignee_id = ? OR (assignee_id IS NULL AND creator_id = ?))
    AND status = 'Completed'
  `).get(userId, userId) as { c: number }).c;

  // 2. Total on-time completed tasks
  const totalOnTime = (db.prepare(`
    SELECT count(*) as c FROM tasks
    WHERE (assignee_id = ? OR (assignee_id IS NULL AND creator_id = ?))
    AND status = 'Completed'
    AND (due_date IS NULL OR due_date >= date(updated_at))
  `).get(userId, userId) as { c: number }).c;

  // 3. 100% completed projects where user contributed or owned
  const completedProjects = (db.prepare(`
    SELECT count(*) as c FROM (
      SELECT p.id,
        count(*) as total_tasks,
        sum(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as done_tasks
      FROM projects p
      JOIN tasks t ON p.id = t.project_id
      WHERE (p.owner_id = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?))
      GROUP BY p.id
      HAVING total_tasks > 0 AND total_tasks = done_tasks
    )
  `).get(userId, userId) as { c: number }).c;

  // 4. Team player tasks (tasks in shared projects with multiple members)
  const teamTasks = (db.prepare(`
    SELECT count(*) as c FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE (t.assignee_id = ? OR (t.assignee_id IS NULL AND t.creator_id = ?))
    AND t.status = 'Completed'
    AND (
      (SELECT count(*) FROM project_members WHERE project_id = p.id) > 0
    )
  `).get(userId, userId) as { c: number }).c;

  // 5. Max tasks completed in a single team project
  const maxInProject = (db.prepare(`
    SELECT count(*) as c FROM tasks
    WHERE (assignee_id = ? OR (assignee_id IS NULL AND creator_id = ?))
    AND status = 'Completed'
    GROUP BY project_id
    ORDER BY c DESC LIMIT 1
  `).get(userId, userId) as { c: number } | undefined)?.c || 0;

  const unlockedBadges = db.prepare('SELECT badge_key, unlocked_at FROM user_badges WHERE user_id = ?').all(userId) as { badge_key: string; unlocked_at: string }[];
  const unlockedMap = new Map(unlockedBadges.map((b) => [b.badge_key, b.unlocked_at]));

  const result = BADGE_DEFINITIONS.map((def) => {
    let current = 0;
    switch (def.key) {
      case 'first_step':
        current = totalCompleted;
        break;
      case 'project_starter':
        current = completedProjects;
        break;
      case 'on_fire':
        current = streakInfo.longestStreak;
        break;
      case 'unstoppable':
        current = streakInfo.longestStreak;
        break;
      case 'deadline_hero':
        current = totalOnTime;
        break;
      case 'task_crusher':
        current = totalCompleted;
        break;
      case 'project_finisher':
        current = completedProjects;
        break;
      case 'team_player':
        current = teamTasks;
        break;
      case 'goal_getter':
        current = maxInProject;
        break;
    }

    const isUnlocked = unlockedMap.has(def.key) || current >= def.target;
    let unlockedAt = unlockedMap.get(def.key) || null;

    if (isUnlocked && !unlockedMap.has(def.key)) {
      unlockedAt = new Date().toISOString();
      try {
        db.prepare('INSERT INTO user_badges (user_id, badge_key, unlocked_at) VALUES (?, ?, ?)').run(userId, def.key, unlockedAt);
        // Bonus XP for achievement unlock (+25 XP)
        awardXp(userId, null, 25, 'achievement', `Membuka Badge Prestasi: "${def.name}"`);
      } catch {}
    }

    const progressPercent = Math.min(100, Math.round((current / def.target) * 100));

    return {
      badge_key: def.key,
      name: def.name,
      description: def.description,
      icon: def.icon,
      category: def.category,
      target_count: def.target,
      current_count: current,
      progress_percent: progressPercent,
      is_unlocked: Boolean(isUnlocked),
      unlocked_at: unlockedAt,
    };
  });

  return result;
}

function awardXp(userId: number, taskId: number | null, amount: number, sourceType: string, description: string) {
  ensureGamificationProfile(userId);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO xp_ledger (user_id, task_id, amount, source_type, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, taskId, amount, sourceType, description, now);

  const profile = db.prepare('SELECT total_xp FROM gamification_profiles WHERE user_id = ?').get(userId) as any;
  const newTotalXp = (profile ? profile.total_xp : 0) + amount;
  const levelDetails = calculateLevelDetails(newTotalXp);

  db.prepare(`
    UPDATE gamification_profiles
    SET total_xp = ?, level = ?, avatar_frame = ?
    WHERE user_id = ?
  `).run(newTotalXp, levelDetails.level, levelDetails.avatar_frame, userId);

  return { newTotalXp, levelDetails };
}

function handleTaskCompletionGamification(taskId: number, actingUserId: number) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
  if (!task) return null;

  // CRITICAL RULE 2: XP goes to the assignee doing the work, or creator if unassigned
  const earnerUserId = task.assignee_id ? task.assignee_id : task.creator_id;
  ensureGamificationProfile(earnerUserId);

  // CRITICAL RULE 1: XP only awarded ONCE per valid task completion!
  // If toggled completed -> incomplete -> completed, check completed_task_xp table
  const alreadyAwarded = db.prepare('SELECT 1 FROM completed_task_xp WHERE task_id = ?').get(taskId);
  if (alreadyAwarded) {
    return { alreadyAwarded: true, earnerUserId };
  }

  // Base XP: Low +10, Medium +20, High +30
  const baseMap: Record<string, number> = { Low: 10, Medium: 20, High: 30 };
  const baseXP = baseMap[task.priority] || 20;

  // CRITICAL RULE 3: On-time bonus awarded if not overdue.
  // Overdue tasks do not subtract XP, they just omit the on-time bonus.
  const today = getTodayString();
  const isOnTime = !task.due_date || task.due_date >= today;
  const onTimeBonus = isOnTime ? 10 : 0;
  const totalEarnedXP = baseXP + onTimeBonus;
  const now = new Date().toISOString();

  // Record in completed_task_xp so it can NEVER be awarded again
  db.prepare(`
    INSERT INTO completed_task_xp (task_id, awarded_user_id, base_xp, bonus_xp, awarded_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(taskId, earnerUserId, baseXP, onTimeBonus, now);

  // Ledger: base XP
  db.prepare(`
    INSERT INTO xp_ledger (user_id, task_id, amount, source_type, description, created_at)
    VALUES (?, ?, ?, 'task_completion', ?, ?)
  `).run(earnerUserId, taskId, baseXP, `Menyelesaikan tugas: "${task.title}" (Prioritas ${task.priority})`, now);

  // Ledger: on-time bonus
  if (onTimeBonus > 0) {
    db.prepare(`
      INSERT INTO xp_ledger (user_id, task_id, amount, source_type, description, created_at)
      VALUES (?, ?, ?, 'ontime_bonus', ?, ?)
    `).run(earnerUserId, taskId, onTimeBonus, `Bonus Ketepatan Waktu: "${task.title}"`, now);
  }

  // Update total_xp and recalculate level
  const profile = db.prepare('SELECT * FROM gamification_profiles WHERE user_id = ?').get(earnerUserId) as any;
  const prevLevel = profile ? profile.level : 1;
  const newTotalXp = (profile ? profile.total_xp : 0) + totalEarnedXP;
  const levelDetails = calculateLevelDetails(newTotalXp);
  const leveledUp = levelDetails.level > prevLevel;

  // Record activity day for streak
  const existingDay = db.prepare('SELECT tasks_completed FROM user_activity_days WHERE user_id = ? AND activity_date = ?').get(earnerUserId, today) as { tasks_completed: number } | undefined;
  if (existingDay) {
    db.prepare('UPDATE user_activity_days SET tasks_completed = tasks_completed + 1 WHERE user_id = ? AND activity_date = ?').run(earnerUserId, today);
  } else {
    db.prepare('INSERT INTO user_activity_days (user_id, activity_date, tasks_completed) VALUES (?, ?, 1)').run(earnerUserId, today);
  }

  const streakInfo = calculateUserStreak(earnerUserId);

  db.prepare(`
    UPDATE gamification_profiles
    SET total_xp = ?, level = ?, current_streak = ?, longest_streak = ?, last_active_date = ?, avatar_frame = ?
    WHERE user_id = ?
  `).run(
    newTotalXp,
    levelDetails.level,
    streakInfo.currentStreak,
    streakInfo.longestStreak,
    today,
    levelDetails.avatar_frame,
    earnerUserId
  );

  // Progress quests and check badges
  updateQuestProgressOnTaskComplete(earnerUserId, task, isOnTime);
  evaluateAndGetBadges(earnerUserId);

  return {
    alreadyAwarded: false,
    earnerUserId,
    baseXP,
    onTimeBonus,
    totalEarnedXP,
    newTotalXp,
    prevLevel,
    newLevel: levelDetails.level,
    leveledUp,
    levelDetails,
  };
}

function migrateGamification() {
  const users = db.prepare('SELECT id, name FROM users').all() as { id: number; name: string }[];
  const today = getTodayString();
  const now = new Date().toISOString();

  for (const u of users) {
    ensureGamificationProfile(u.id);
    ensureUserQuests(u.id);
  }

  // Check any existing Completed tasks that haven't been recorded in completed_task_xp yet
  const completedTasks = db.prepare(`
    SELECT * FROM tasks WHERE status = 'Completed'
  `).all() as unknown as TaskRow[];

  for (const t of completedTasks) {
    const existing = db.prepare('SELECT 1 FROM completed_task_xp WHERE task_id = ?').get(t.id);
    if (!existing) {
      const earnerId = t.assignee_id ? t.assignee_id : t.creator_id;
      ensureGamificationProfile(earnerId);

      const baseMap: Record<string, number> = { Low: 10, Medium: 20, High: 30 };
      const baseXP = baseMap[t.priority] || 20;
      const isOnTime = !t.due_date || t.due_date >= today;
      const onTimeBonus = isOnTime ? 10 : 0;
      const totalXP = baseXP + onTimeBonus;

      db.prepare(`
        INSERT INTO completed_task_xp (task_id, awarded_user_id, base_xp, bonus_xp, awarded_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(t.id, earnerId, baseXP, onTimeBonus, now);

      db.prepare(`
        INSERT INTO xp_ledger (user_id, task_id, amount, source_type, description, created_at)
        VALUES (?, ?, ?, 'task_completion', ?, ?)
      `).run(earnerId, t.id, baseXP, `Menyelesaikan tugas: "${t.title}" (Prioritas ${t.priority})`, now);

      if (onTimeBonus > 0) {
        db.prepare(`
          INSERT INTO xp_ledger (user_id, task_id, amount, source_type, description, created_at)
          VALUES (?, ?, ?, 'ontime_bonus', ?, ?)
        `).run(earnerId, t.id, onTimeBonus, `Bonus Ketepatan Waktu: "${t.title}"`, now);
      }

      // Add to user activity
      const activityDate = t.updated_at ? t.updated_at.split('T')[0] : today;
      const existDay = db.prepare('SELECT tasks_completed FROM user_activity_days WHERE user_id = ? AND activity_date = ?').get(earnerId, activityDate) as { tasks_completed: number } | undefined;
      if (existDay) {
        db.prepare('UPDATE user_activity_days SET tasks_completed = tasks_completed + 1 WHERE user_id = ? AND activity_date = ?').run(earnerId, activityDate);
      } else {
        db.prepare('INSERT INTO user_activity_days (user_id, activity_date, tasks_completed) VALUES (?, ?, 1)').run(earnerId, activityDate);
      }

      // Update profile
      const prof = db.prepare('SELECT total_xp FROM gamification_profiles WHERE user_id = ?').get(earnerId) as any;
      const newTotal = (prof ? prof.total_xp : 0) + totalXP;
      const lDetails = calculateLevelDetails(newTotal);

      db.prepare(`
        UPDATE gamification_profiles
        SET total_xp = ?, level = ?, last_active_date = ?, avatar_frame = ?
        WHERE user_id = ?
      `).run(newTotal, lDetails.level, activityDate, lDetails.avatar_frame, earnerId);
    }
  }

  // Recalculate streaks and badges for each user
  for (const u of users) {
    const s = calculateUserStreak(u.id);
    db.prepare(`
      UPDATE gamification_profiles
      SET current_streak = ?, longest_streak = ?
      WHERE user_id = ?
    `).run(s.currentStreak, s.longestStreak, u.id);

    evaluateAndGetBadges(u.id);
  }
}

// ============================================================================
// CHAT CORE LOGIC & REAL-TIME WEBSOCKET MANAGEMENT
// ============================================================================

interface AuthenticatedSocketData {
  userId: number;
  name: string;
  email: string;
}

const connectedSockets = new Map<WebSocket, AuthenticatedSocketData>();

function setupWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    let authedUser: AuthenticatedSocketData | null = null;
    try {
      const url = new URL(req.url || '', 'http://localhost:3000');
      const token = url.searchParams.get('token');
      if (token) {
        const payload = jwt.verify(token, SECRET_KEY) as { id: number; email: string; name: string };
        authedUser = { userId: payload.id, email: payload.email, name: payload.name };
        connectedSockets.set(ws, authedUser);
        ws.send(JSON.stringify({ type: 'authenticated', user: authedUser }));
      }
    } catch {}

    ws.on('message', (messageRaw) => {
      try {
        const data = JSON.parse(messageRaw.toString());
        if (data.type === 'auth' && data.token) {
          const payload = jwt.verify(data.token, SECRET_KEY) as { id: number; email: string; name: string };
          authedUser = { userId: payload.id, email: payload.email, name: payload.name };
          connectedSockets.set(ws, authedUser);
          ws.send(JSON.stringify({ type: 'authenticated', user: authedUser }));
        }
      } catch {}
    });

    ws.on('close', () => {
      connectedSockets.delete(ws);
    });

    ws.on('error', () => {
      connectedSockets.delete(ws);
    });
  });

  return wss;
}

function broadcastPrivateMessage(msg: any, senderId: number, recipientId: number) {
  const payload = JSON.stringify({ type: 'new_message', data: msg });
  connectedSockets.forEach((client, ws) => {
    if (ws.readyState === WebSocket.OPEN && (client.userId === senderId || client.userId === recipientId)) {
      ws.send(payload);
    }
  });
}

function broadcastProjectMessage(msg: any, projectId: number) {
  const payload = JSON.stringify({ type: 'new_message', data: msg });
  connectedSockets.forEach((client, ws) => {
    // Security check: only send to clients who are verified active members of the project!
    if (ws.readyState === WebSocket.OPEN && userHasProjectAccess(client.userId, projectId)) {
      ws.send(payload);
    }
  });
}

function formatChatMessage(row: any, currentUserId: number) {
  const sender = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(row.sender_id) as any;

  let senderRole = 'Anggota';
  let isSenderOwner = false;

  if (row.project_id) {
    const project = db.prepare('SELECT owner_id, owner_role_name FROM projects WHERE id = ?').get(row.project_id) as any;
    if (project) {
      if (project.owner_id === row.sender_id) {
        senderRole = project.owner_role_name || 'Project Manager';
        isSenderOwner = true;
      } else {
        const member = db.prepare('SELECT role_name FROM project_members WHERE project_id = ? AND user_id = ?').get(row.project_id, row.sender_id) as any;
        if (member && member.role_name && member.role_name.trim()) {
          senderRole = member.role_name.trim();
        } else {
          senderRole = row.sender_id === 2 ? 'Developer' : row.sender_id === 3 ? 'Designer' : 'Anggota Tim';
        }
      }
    }
  }

  let recipientName = null;
  if (row.recipient_id) {
    const recipient = db.prepare('SELECT name FROM users WHERE id = ?').get(row.recipient_id) as any;
    if (recipient) recipientName = recipient.name;
  }

  let taskRef = null;
  if (row.task_ref_id) {
    const task = db.prepare('SELECT id, title, status, priority, due_date FROM tasks WHERE id = ?').get(row.task_ref_id) as any;
    if (task) {
      taskRef = {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
      };
    }
  }

  return {
    id: row.id,
    chat_type: row.chat_type,
    project_id: row.project_id,
    sender_id: row.sender_id,
    sender_name: sender ? sender.name : 'Pengguna',
    sender_email: sender ? sender.email : '',
    sender_role: senderRole,
    is_sender_owner: isSenderOwner,
    recipient_id: row.recipient_id,
    recipient_name: recipientName,
    content: row.content,
    task_ref: taskRef,
    is_read: Boolean(row.is_read),
    created_at: row.created_at,
  };
}

function seedDemoChat() {
  const existing = (db.prepare('SELECT count(*) as count FROM chat_messages').get() as { count: number }).count;
  if (existing === 0) {
    const now = new Date();
    const tMinus = (mins: number) => new Date(now.getTime() - mins * 60000).toISOString();

    const insertMsg = db.prepare(`
      INSERT INTO chat_messages (chat_type, project_id, sender_id, recipient_id, content, task_ref_id, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Project 1 (Peluncuran Website Produktifa)
    insertMsg.run(
      'project',
      1,
      1,
      null,
      'Halo rekan-rekan tim! Selamat datang di chat ruang kerja Peluncuran Website Produktifa. Mari koordinasikan tugas dan progres sprint di sini ya.',
      null,
      1,
      tMinus(180)
    );

    insertMsg.run(
      'project',
      1,
      2,
      null,
      'Siap Bu Ani! Modul otentikasi JWT dan isolasi proyek sudah selesai diuji dan berjalan stabil.',
      2,
      1,
      tMinus(120)
    );

    insertMsg.run(
      'project',
      1,
      3,
      null,
      'Desain wireframe dan mockup antarmuka juga sudah final. Siap diintegrasikan ke komponen frontend.',
      1,
      1,
      tMinus(60)
    );

    // Private messages Ani (1) and Budi (2)
    insertMsg.run(
      'private',
      null,
      2,
      1,
      'Selamat siang Bu Ani, apakah ada catatan khusus untuk revisi endpoint pengingat email?',
      null,
      1,
      tMinus(90)
    );

    insertMsg.run(
      'private',
      null,
      1,
      2,
      'Siang Mas Budi. Format pengingatnya sudah sangat bagus dan informatif, terima kasih banyak ya!',
      null,
      1,
      tMinus(30)
    );

    // Private messages Ani (1) and Citra (3)
    insertMsg.run(
      'private',
      null,
      3,
      1,
      'Halo Bu Ani, palet warna dan komponen typography baru sudah saya update di sistem.',
      6,
      1,
      tMinus(45)
    );

    insertMsg.run(
      'private',
      null,
      1,
      3,
      'Bagus sekali Mbak Citra! Tampilannya bersih dan nyaman dibaca.',
      null,
      1,
      tMinus(15)
    );

    // Initial read status for Ani in Project 1
    db.prepare(`
      INSERT OR IGNORE INTO project_chat_reads (user_id, project_id, last_read_message_id, last_read_at)
      VALUES (1, 1, 3, ?)
    `).run(new Date().toISOString());

    console.log('Chat demo messages seeded successfully.');
  }
}

initDatabase();



// Access Control Helpers
function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate) return false;
  return dueDate < getTodayString() && status !== 'Completed';
}

function userHasProjectAccess(userId: number, projectId: number): boolean {
  const row = db.prepare(`
    SELECT 1 FROM projects WHERE id = ? AND (owner_id = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?))
  `).get(projectId, userId, userId);
  return Boolean(row);
}

function userIsProjectOwner(userId: number, projectId: number): boolean {
  const row = db.prepare('SELECT 1 FROM projects WHERE id = ? AND owner_id = ?').get(projectId, userId);
  return Boolean(row);
}

function formatProjectOut(p: ProjectRow, currentUserId: number) {
  seedDefaultProjectRoles(p.id);

  const stats = db.prepare(`
    SELECT 
      count(*) as total,
      sum(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as done
    FROM tasks WHERE project_id = ?
  `).get(p.id) as { total: number; done: number | null };

  const owner = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(p.owner_id) as { id: number; name: string; email: string } | undefined;

  const ownerTaskStats = db.prepare(`
    SELECT 
      count(*) as total,
      sum(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as done
    FROM tasks WHERE project_id = ? AND assignee_id = ?
  `).get(p.id, p.owner_id) as { total: number; done: number | null };

  const membersData = db.prepare(`
    SELECT 
      u.id as user_id, 
      u.name, 
      u.email,
      pm.role_id,
      pm.role_name,
      pm.jobdesk
    FROM users u
    JOIN project_members pm ON u.id = pm.user_id
    WHERE pm.project_id = ?
    ORDER BY u.name ASC
  `).all(p.id) as { user_id: number; name: string; email: string; role_id: number | null; role_name: string; jobdesk: string }[];

  const membersWithStats = membersData.map((m) => {
    const mStats = db.prepare(`
      SELECT 
        count(*) as total,
        sum(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as done
      FROM tasks WHERE project_id = ? AND assignee_id = ?
    `).get(p.id, m.user_id) as { total: number; done: number | null };

    return {
      id: m.user_id,
      user_id: m.user_id,
      name: m.name,
      email: m.email,
      is_owner: false,
      role_id: m.role_id,
      role_name: m.role_name || 'Anggota Tim',
      jobdesk: m.jobdesk || 'Menjalankan tugas proyek sesuai penugasan dari pengelola proyek.',
      task_count: mStats.total,
      done_count: mStats.done || 0,
    };
  });

  const allMembers = [
    {
      id: p.owner_id,
      user_id: p.owner_id,
      name: owner ? owner.name : 'Pemilik Proyek',
      email: owner ? owner.email : '',
      is_owner: true,
      role_id: null,
      role_name: p.owner_role_name || 'Project Manager',
      jobdesk: p.owner_jobdesk || 'Memimpin perencanaan proyek, koordinasi tim, dan memantau timeline target.',
      task_count: ownerTaskStats.total,
      done_count: ownerTaskStats.done || 0,
    },
    ...membersWithStats,
  ];

  const roles = db.prepare('SELECT id, project_id, name, description, color, created_at FROM project_roles WHERE project_id = ? ORDER BY id ASC').all(p.id) as unknown as ProjectRoleRow[];

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    owner_id: p.owner_id,
    owner_role_name: p.owner_role_name || 'Project Manager',
    owner_jobdesk: p.owner_jobdesk || '',
    is_owner: p.owner_id === currentUserId,
    members: allMembers,
    roles,
    task_count: stats.total,
    done_count: stats.done || 0,
  };
}

function formatTaskOut(t: TaskRow) {
  let assigneeName: string | null = null;
  let assigneeRole: string | null = null;

  if (t.assignee_id) {
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(t.assignee_id) as { name: string } | undefined;
    if (user) {
      assigneeName = user.name;
      const proj = db.prepare('SELECT owner_id, owner_role_name FROM projects WHERE id = ?').get(t.project_id) as { owner_id: number; owner_role_name?: string } | undefined;
      if (proj && proj.owner_id === t.assignee_id) {
        assigneeRole = proj.owner_role_name || 'Project Manager';
      } else {
        const member = db.prepare('SELECT role_name FROM project_members WHERE project_id = ? AND user_id = ?').get(t.project_id, t.assignee_id) as { role_name: string } | undefined;
        assigneeRole = member?.role_name || 'Anggota Tim';
      }
    }
  }

  return {
    id: t.id,
    project_id: t.project_id,
    creator_id: t.creator_id,
    assignee_id: t.assignee_id || null,
    assignee_name: assigneeName,
    assignee_role: assigneeRole,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    is_overdue: isOverdue(t.due_date, t.status),
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

// Authentication middleware
interface AuthenticatedRequest extends Request {
  currentUser?: UserRow;
}

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Tidak terautentikasi' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, SECRET_KEY) as { sub: string };
    const userId = parseInt(payload.sub, 10);
    const user = db.prepare('SELECT id, name, email, password_hash, created_at FROM users WHERE id = ?').get(userId) as unknown as UserRow | undefined;
    if (!user) {
      return res.status(401).json({ detail: 'Tidak terautentikasi' });
    }
    req.currentUser = user;
    next();
  } catch (err) {
    return res.status(401).json({ detail: 'Tidak terautentikasi' });
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // CORS support
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Health check endpoint
  const handleHealth = (_req: Request, res: Response) => {
    const userCount = (db.prepare('SELECT count(*) as c FROM users').get() as { c: number }).c;
    const taskCount = (db.prepare('SELECT count(*) as c FROM tasks').get() as { c: number }).c;
    const projectCount = (db.prepare('SELECT count(*) as c FROM projects').get() as { c: number }).c;
    res.json({
      status: 'ok',
      app: 'Produktifa',
      database: 'SQLite 3 (data/produktifa.db)',
      users: userCount,
      projects: projectCount,
      tasks: taskCount,
    });
  };
  app.get('/health', handleHealth);
  app.get('/api/health', handleHealth);

  // REGISTRATION & FORGOT PASSWORD IN-MEMORY STORES
  const pendingRegistrations = new Map<
    string,
    { name: string; email: string; password_hash: string; code: string; expiresAt: number }
  >();
  const resetCodes = new Map<string, { code: string; expiresAt: number }>();

  // SMTP Transporter setup (supporting Gmail App Password or custom SMTP)
  function createMailerTransport() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  // 1. Send Registration Verification Email
  async function sendRegisterVerificationEmail(toEmail: string, recipientName: string, code: string): Promise<boolean> {
    const transporter = createMailerTransport();
    const from = process.env.SMTP_FROM || `"Produktifa Security" <${process.env.SMTP_USER || 'no-reply@produktifa.com'}>`;

    if (!transporter) {
      console.log(`[SMTP DEV MODE] SMTP belum aktif (SMTP_USER / SMTP_PASS di .env). Kode Verifikasi Pendaftaran untuk ${toEmail}: [${code}]`);
      return false;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px; color: #1e293b; }
          .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .logo-title { font-size: 20px; font-weight: 900; color: #0d3b66; letter-spacing: -0.5px; text-transform: uppercase; margin-bottom: 4px; }
          .subtitle { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 24px; }
          .greeting { font-size: 15px; margin-bottom: 12px; font-weight: 600; color: #0f172a; }
          .desc { font-size: 13px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
          .code-box { background: #f8fafc; border: 2px dashed #0284c7; border-radius: 6px; padding: 18px; text-align: center; margin-bottom: 20px; }
          .code { font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0d3b66; margin: 0; }
          .expiry { font-size: 11px; color: #dc2626; margin-top: 8px; font-weight: 600; }
          .spam-alert { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px 14px; margin-bottom: 20px; font-size: 12px; line-height: 1.5; color: #92400e; }
          .note { font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo-title">PRODUKTIFA</div>
          <div class="subtitle">Platform Manajemen Tugas & Proyek</div>
          <div class="greeting">Halo ${recipientName || 'Pengguna Baru'}, selamat datang!</div>
          <div class="desc">
            Terima kasih telah mendaftar di Produktifa. Untuk menyelesaikan pendaftaran dan mengaktifkan akun Anda, masukkan 6-digit kode verifikasi di bawah ini:
          </div>
          <div class="code-box">
            <div class="code">${code}</div>
            <div class="expiry">⚠️ Kode ini berlaku selama 15 menit.</div>
          </div>
          <div class="spam-alert">
            <strong>📁 Perhatian Folder Spam:</strong> Jika Anda tidak melihat email ini di Kotak Masuk (Inbox) utama Anda di masa mendatang, mohon periksa folder <strong>Spam</strong> atau <strong>Promosi</strong> dan tandai sebagai <em>"Bukan Spam"</em> agar notifikasi penting tugas tidak terlewat.
          </div>
          <div class="desc">
            Jangan bagikan kode ini kepada siapa pun. Jika Anda tidak merasa mendaftar akun di Produktifa, Anda dapat mengabaikan email ini dengan aman.
          </div>
          <div class="note">
            Email ini dikirim otomatis oleh sistem verifikasi Produktifa. Mohon tidak membalas email ini secara langsung.
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const info = await transporter.sendMail({
        from,
        to: toEmail,
        subject: `Kode Verifikasi Pendaftaran: ${code} - Produktifa`,
        text: `Halo ${recipientName}, kode verifikasi pendaftaran akun Produktifa Anda adalah: ${code}. Kode ini berlaku selama 15 menit. Jika email tidak masuk di kotak masuk utama, mohon periksa folder Spam atau Promosi.`,
        html,
      });
      console.log(`[SMTP SUCCESS] Email verifikasi pendaftaran berhasil dikirim ke ${toEmail}. Message ID: ${info.messageId}`);
      return true;
    } catch (err) {
      console.error(`[SMTP ERROR] Gagal mengirim email ke ${toEmail}:`, err);
      return false;
    }
  }

  // 2. Send Reset Password Email
  async function sendResetCodeEmail(toEmail: string, recipientName: string, code: string): Promise<boolean> {
    const transporter = createMailerTransport();
    const from = process.env.SMTP_FROM || `"Produktifa Security" <${process.env.SMTP_USER || 'no-reply@produktifa.com'}>`;

    if (!transporter) {
      console.log(`[SMTP DEV MODE] SMTP belum aktif (SMTP_USER / SMTP_PASS di .env). Kode Reset Kata Sandi untuk ${toEmail}: [${code}]`);
      return false;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px; color: #1e293b; }
          .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .logo-title { font-size: 20px; font-weight: 900; color: #0d3b66; letter-spacing: -0.5px; text-transform: uppercase; margin-bottom: 4px; }
          .subtitle { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 24px; }
          .greeting { font-size: 15px; margin-bottom: 12px; font-weight: 600; color: #0f172a; }
          .desc { font-size: 13px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
          .code-box { background: #f8fafc; border: 2px dashed #0284c7; border-radius: 6px; padding: 18px; text-align: center; margin-bottom: 20px; }
          .code { font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0d3b66; margin: 0; }
          .expiry { font-size: 11px; color: #dc2626; margin-top: 8px; font-weight: 600; }
          .spam-alert { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px 14px; margin-bottom: 20px; font-size: 12px; line-height: 1.5; color: #92400e; }
          .note { font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo-title">PRODUKTIFA</div>
          <div class="subtitle">Platform Manajemen Tugas & Proyek</div>
          <div class="greeting">Halo ${recipientName || 'Pengguna Produktifa'},</div>
          <div class="desc">
            Kami menerima permintaan untuk mengatur ulang kata sandi akun Produktifa Anda. Silakan gunakan kode verifikasi 6-digit di bawah ini untuk melanjutkan pemulihan kata sandi:
          </div>
          <div class="code-box">
            <div class="code">${code}</div>
            <div class="expiry">⚠️ Kode ini berlaku selama 15 menit.</div>
          </div>
          <div class="spam-alert">
            <strong>📁 Penting: Periksa Folder Spam/Promosi:</strong> Jika email ini tidak muncul langsung di Kotak Masuk (Inbox), mohon periksa folder <strong>Spam</strong> atau <strong>Promosi</strong> di akun email Anda.
          </div>
          <div class="desc">
            Jika Anda tidak meminta perubahan kata sandi ini, mohon abaikan email ini. Akun dan kata sandi Anda tetap terlindungi dan aman.
          </div>
          <div class="note">
            Email ini dikirim otomatis oleh sistem keamanan Produktifa. Mohon jangan membalas langsung ke alamat email ini.
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const info = await transporter.sendMail({
        from,
        to: toEmail,
        subject: `Kode Verifikasi Pemulihan Kata Sandi: ${code} - Produktifa`,
        text: `Halo, kode verifikasi pengaturan ulang kata sandi Produktifa Anda adalah: ${code}. Berlaku 15 menit. Mohon cek folder Spam jika email tidak masuk ke inbox utama.`,
        html,
      });
      console.log(`[SMTP SUCCESS] Email pemulihan kata sandi berhasil dikirim ke ${toEmail}. Message ID: ${info.messageId}`);
      return true;
    } catch (err) {
      console.error(`[SMTP ERROR] Gagal mengirim email ke ${toEmail}:`, err);
      return false;
    }
  }

  // 3. Send Task Reminder Email
  async function sendTaskReminderEmail(toEmail: string, recipientName: string, task: TaskRow, projectName: string): Promise<boolean> {
    const transporter = createMailerTransport();
    const from = process.env.SMTP_FROM || `"Produktifa Pengingat" <${process.env.SMTP_USER || 'no-reply@produktifa.com'}>`;

    if (!transporter) {
      console.log(`[SMTP DEV MODE] SMTP belum aktif. Pengingat Tugas untuk ${toEmail}: "${task.title}" (Tenggat: ${task.due_date || 'Tanpa tenggat'}, Status: ${task.status})`);
      return false;
    }

    const isTaskOverdue = isOverdue(task.due_date, task.status);
    const badgeColor = isTaskOverdue ? '#dc2626' : task.priority === 'High' ? '#ea580c' : '#0284c7';
    const badgeText = isTaskOverdue ? '⚠️ TERLAMBAT' : task.priority === 'High' ? '🔥 PRIORITAS TINGGI' : '📌 PENGINGAT TUGAS';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px; color: #1e293b; }
          .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0d3b66; padding-bottom: 14px; margin-bottom: 20px; }
          .logo-title { font-size: 20px; font-weight: 900; color: #0d3b66; letter-spacing: -0.5px; }
          .tagline { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 800; color: #ffffff; background-color: ${badgeColor}; margin-bottom: 16px; }
          .task-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0d3b66; border-radius: 6px; padding: 18px; margin-bottom: 20px; }
          .task-title { font-size: 17px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
          .task-desc { font-size: 13px; color: #475569; line-height: 1.5; margin-bottom: 14px; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; }
          .meta-label { color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 2px; }
          .meta-val { font-weight: 700; color: #1e293b; }
          .quote-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 14px; margin-bottom: 20px; font-size: 12px; color: #166534; font-weight: 600; text-align: center; }
          .spam-alert { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 12px; margin-bottom: 20px; font-size: 11px; line-height: 1.4; color: #92400e; }
          .note { font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 20px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div>
              <div class="logo-title">PRODUKTIFA</div>
              <div class="tagline">Pengingat Tugas & Produktivitas</div>
            </div>
          </div>

          <div class="badge">${badgeText}</div>

          <div style="font-size: 14px; margin-bottom: 14px; color: #334155;">
            Halo <strong>${recipientName}</strong>, berikut pengingat untuk tugas Anda:
          </div>

          <div class="task-box">
            <div class="task-title">${task.title}</div>
            ${task.description ? `<div class="task-desc">${task.description}</div>` : ''}

            <div class="meta-grid">
              <div>
                <div class="meta-label">Proyek</div>
                <div class="meta-val">${projectName}</div>
              </div>
              <div>
                <div class="meta-label">Tenggat Waktu</div>
                <div class="meta-val" style="color: ${isTaskOverdue ? '#dc2626' : '#0284c7'};">
                  ${task.due_date || 'Tanpa tenggat'} ${isTaskOverdue ? '(Lewat Tenggat)' : ''}
                </div>
              </div>
              <div>
                <div class="meta-label">Status Saat Ini</div>
                <div class="meta-val">${task.status}</div>
              </div>
              <div>
                <div class="meta-label">Prioritas</div>
                <div class="meta-val">${task.priority}</div>
              </div>
            </div>
          </div>

          <div class="quote-box">
            ✨ "Stop Nunda-nunda, Saatnya Produktif! Selesaikan tugas ini untuk mencapai target proyek Anda."
          </div>

          <div class="spam-alert">
            📁 <strong>Catatan:</strong> Jika pengingat ini sempat masuk ke folder Spam/Promosi, mohon tandai sebagai <em>"Bukan Spam"</em> agar pengingat berikutnya masuk langsung ke Kotak Masuk Anda.
          </div>

          <div class="note">
            Email pengingat dikirim oleh sistem Produktifa sesuai jadwal dan permintaan aksi Anda.
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const info = await transporter.sendMail({
        from,
        to: toEmail,
        subject: `[Pengingat Tugas] ${task.title} (${projectName}) - Produktifa`,
        text: `Halo ${recipientName}, ini pengingat tugas Produktifa Anda: "${task.title}" pada proyek "${projectName}". Status: ${task.status}, Prioritas: ${task.priority}, Tenggat: ${task.due_date || 'Tanpa tenggat'}.`,
        html,
      });
      console.log(`[SMTP SUCCESS] Email pengingat tugas berhasil dikirim ke ${toEmail}. Message ID: ${info.messageId}`);
      return true;
    } catch (err) {
      console.error(`[SMTP ERROR] Gagal mengirim pengingat tugas ke ${toEmail}:`, err);
      return false;
    }
  }

  // 4. Send Task Summary Reminder Email
  async function sendTaskSummaryReminderEmail(toEmail: string, recipientName: string, tasks: TaskRow[], projectMap: Map<number, string>): Promise<boolean> {
    const transporter = createMailerTransport();
    const from = process.env.SMTP_FROM || `"Produktifa Pengingat" <${process.env.SMTP_USER || 'no-reply@produktifa.com'}>`;

    if (!transporter) {
      console.log(`[SMTP DEV MODE] SMTP belum aktif. Ringkasan ${tasks.length} Tugas untuk ${toEmail}`);
      return false;
    }

    const overdueCount = tasks.filter((t) => isOverdue(t.due_date, t.status)).length;
    const taskRowsHtml = tasks
      .map((t) => {
        const pName = projectMap.get(t.project_id) || 'Proyek Umum';
        const isTaskOverdue = isOverdue(t.due_date, t.status);
        return `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 8px; font-weight: 700; color: #0f172a; font-size: 13px;">
              ${t.title}
              <div style="font-size: 11px; color: #64748b; font-weight: normal;">${pName}</div>
            </td>
            <td style="padding: 10px 8px; font-size: 12px; color: #334155;">${t.status}</td>
            <td style="padding: 10px 8px; font-size: 12px; font-weight: 700; color: ${t.priority === 'High' ? '#dc2626' : t.priority === 'Medium' ? '#d97706' : '#059669'};">
              ${t.priority}
            </td>
            <td style="padding: 10px 8px; font-size: 12px; font-family: monospace; color: ${isTaskOverdue ? '#dc2626; font-weight: 700;' : '#475569;'}">
              ${t.due_date || '-'} ${isTaskOverdue ? '⚠️' : ''}
            </td>
          </tr>
        `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px; color: #1e293b; }
          .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { border-bottom: 2px solid #0d3b66; padding-bottom: 12px; margin-bottom: 20px; }
          .logo-title { font-size: 20px; font-weight: 900; color: #0d3b66; }
          .table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 20px; }
          .th { text-align: left; background: #f8fafc; padding: 8px; font-size: 11px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
          .stat-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; margin-right: 6px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div class="logo-title">PRODUKTIFA</div>
            <div style="font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase;">Ringkasan Tugas Aktif Anda</div>
          </div>

          <div style="font-size: 14px; margin-bottom: 12px;">
            Halo <strong>${recipientName}</strong>, berikut ringkasan <strong>${tasks.length}</strong> tugas aktif yang sedang Anda kelola:
          </div>

          <div style="margin-bottom: 16px;">
            <span class="stat-badge" style="background: #e0f2fe; color: #0369a1;">Total: ${tasks.length} Tugas</span>
            ${overdueCount > 0 ? `<span class="stat-badge" style="background: #fee2e2; color: #b91c1c;">⚠️ ${overdueCount} Terlambat</span>` : ''}
          </div>

          <table class="table">
            <thead>
              <tr>
                <th class="th">Judul & Proyek</th>
                <th class="th">Status</th>
                <th class="th">Prioritas</th>
                <th class="th">Tenggat</th>
              </tr>
            </thead>
            <tbody>
              ${taskRowsHtml}
            </tbody>
          </table>

          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 12px; font-size: 11px; color: #92400e; margin-bottom: 16px;">
            📁 <strong>Periksa Spam:</strong> Jika email notifikasi Produktifa masuk ke folder Spam/Promosi, mohon tandai sebagai <em>"Bukan Spam"</em> agar selalu muncul di Kotak Masuk utama Anda.
          </div>

          <div style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; text-align: center;">
            Produktifa — Stop Nunda-nunda, Saatnya Produktif!
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const info = await transporter.sendMail({
        from,
        to: toEmail,
        subject: `[Ringkasan Pengingat] ${tasks.length} Tugas Aktif Anda - Produktifa`,
        text: `Halo ${recipientName}, Anda memiliki ${tasks.length} tugas aktif di Produktifa. Periksa detailnya di dashboard Produktifa.`,
        html,
      });
      console.log(`[SMTP SUCCESS] Ringkasan pengingat berhasil dikirim ke ${toEmail}. Message ID: ${info.messageId}`);
      return true;
    } catch (err) {
      console.error(`[SMTP ERROR] Gagal mengirim ringkasan ke ${toEmail}:`, err);
      return false;
    }
  }

  // ==========================================
  // AUTH ROUTE 1: REGISTER WITH EMAIL VERIFICATION
  // ==========================================
  const handleRegister = async (req: Request, res: Response) => {
    const { name, email, password } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(422).json({ detail: 'Nama lengkap wajib diisi' });
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(422).json({ detail: 'Format email tidak valid' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(422).json({ detail: 'Kata sandi minimal 8 karakter' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({ detail: 'Email sudah terdaftar. Silakan masuk atau gunakan email lain.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password, salt);
    const cleanName = name.trim().slice(0, 80);

    // Generate 6-digit OTP code for registration
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

    pendingRegistrations.set(cleanEmail, {
      name: cleanName,
      email: cleanEmail,
      password_hash,
      code,
      expiresAt,
    });

    // Send verification email via SMTP
    await sendRegisterVerificationEmail(cleanEmail, cleanName, code);

    return res.status(200).json({
      requires_verification: true,
      email: cleanEmail,
      message: 'Kode verifikasi 6 digit telah dikirim ke email Anda. Silakan periksa Kotak Masuk atau folder Spam.',
    });
  };

  app.post('/auth/register', handleRegister);
  app.post('/api/auth/register', handleRegister);

  // ==========================================
  // AUTH ROUTE 2: VERIFY REGISTRATION CODE
  // ==========================================
  const handleVerifyRegistration = (req: Request, res: Response) => {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(422).json({ detail: 'Email dan kode verifikasi wajib diisi' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const pending = pendingRegistrations.get(cleanEmail);

    if (!pending) {
      // Check if user is already verified and exists in database
      const existing = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(cleanEmail) as UserRow | undefined;
      if (existing) {
        const access_token = jwt.sign({ sub: String(existing.id) }, SECRET_KEY, { expiresIn: '7d' });
        return res.json({
          access_token,
          token_type: 'bearer',
          user: { id: existing.id, name: existing.name, email: existing.email },
        });
      }
      return res.status(400).json({ detail: 'Sesi verifikasi tidak ditemukan atau telah kedaluwarsa. Silakan daftar ulang.' });
    }

    if (Date.now() > pending.expiresAt) {
      pendingRegistrations.delete(cleanEmail);
      return res.status(400).json({ detail: 'Kode verifikasi telah kedaluwarsa. Silakan klik "Kirim Ulang Kode".' });
    }

    if (pending.code !== String(code).trim()) {
      return res.status(400).json({ detail: 'Kode verifikasi salah. Mohon periksa kembali email Anda.' });
    }

    // Code is valid! Save user into SQLite database
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(pending.name, pending.email, pending.password_hash, now);

    const newUserId = Number(result.lastInsertRowid);
    pendingRegistrations.delete(cleanEmail);

    const access_token = jwt.sign({ sub: String(newUserId) }, SECRET_KEY, { expiresIn: '7d' });

    return res.status(201).json({
      access_token,
      token_type: 'bearer',
      user: { id: newUserId, name: pending.name, email: pending.email },
      message: 'Akun Anda berhasil diverifikasi dan diaktifkan!',
    });
  };

  app.post('/auth/verify-registration', handleVerifyRegistration);
  app.post('/api/auth/verify-registration', handleVerifyRegistration);

  // ==========================================
  // AUTH ROUTE 3: RESEND VERIFICATION CODE
  // ==========================================
  const handleResendVerification = async (req: Request, res: Response) => {
    const { email } = req.body || {};
    if (!email) {
      return res.status(422).json({ detail: 'Alamat email wajib diisi' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const pending = pendingRegistrations.get(cleanEmail);

    if (!pending) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
      if (existing) {
        return res.status(400).json({ detail: 'Akun ini sudah terverifikasi. Silakan masuk langsung.' });
      }
      return res.status(404).json({ detail: 'Data pendaftaran tidak ditemukan. Silakan isi form pendaftaran kembali.' });
    }

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    pending.code = newCode;
    pending.expiresAt = Date.now() + 15 * 60 * 1000;
    pendingRegistrations.set(cleanEmail, pending);

    await sendRegisterVerificationEmail(cleanEmail, pending.name, newCode);

    return res.json({
      message: 'Kode verifikasi baru telah dikirimkan ke email Anda. Silakan periksa Kotak Masuk atau folder Spam.',
      email: cleanEmail,
    });
  };

  app.post('/auth/resend-verification', handleResendVerification);
  app.post('/api/auth/resend-verification', handleResendVerification);

  // ==========================================
  // AUTH ROUTE 4: LOGIN
  // ==========================================
  const handleLogin = (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(401).json({ detail: 'Email atau kata sandi salah' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as UserRow | undefined;
    if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
      return res.status(401).json({ detail: 'Email atau kata sandi salah' });
    }

    const access_token = jwt.sign({ sub: String(user.id) }, SECRET_KEY, { expiresIn: '7d' });
    return res.json({
      access_token,
      token_type: 'bearer',
      user: { id: user.id, name: user.name, email: user.email },
    });
  };

  app.post('/auth/login', handleLogin);
  app.post('/api/auth/login', handleLogin);

  // ==========================================
  // AUTH ROUTE 5: FORGOT & RESET PASSWORD
  // ==========================================
  const handleForgotPassword = async (req: Request, res: Response) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(422).json({ detail: 'Format email tidak valid' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(cleanEmail) as { id: number; name: string; email: string } | undefined;
    if (!user) {
      return res.status(404).json({ detail: 'Email tidak ditemukan dalam sistem' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    resetCodes.set(cleanEmail, { code, expiresAt });

    // Send email via Gmail / SMTP if configured, or logs in server console
    await sendResetCodeEmail(cleanEmail, user.name, code);

    return res.json({
      message: 'Kode verifikasi pemulihan kata sandi telah dikirim ke email Anda. Silakan periksa Kotak Masuk atau folder Spam.',
      email: cleanEmail,
    });
  };

  app.post('/auth/forgot-password', handleForgotPassword);
  app.post('/api/auth/forgot-password', handleForgotPassword);

  const handleResetPassword = (req: Request, res: Response) => {
    const { email, code, new_password } = req.body || {};
    if (!email || !code || !new_password) {
      return res.status(422).json({ detail: 'Email, kode verifikasi, dan kata sandi baru wajib diisi' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    if (String(new_password).length < 8) {
      return res.status(422).json({ detail: 'Kata sandi baru minimal 8 karakter' });
    }

    const saved = resetCodes.get(cleanEmail);
    if (!saved || saved.code !== String(code).trim() || Date.now() > saved.expiresAt) {
      return res.status(400).json({ detail: 'Kode verifikasi tidak valid atau telah kedaluwarsa' });
    }

    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail) as { id: number } | undefined;
    if (!user) {
      return res.status(404).json({ detail: 'Pengguna tidak ditemukan' });
    }

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(String(new_password), salt);

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, user.id);
    resetCodes.delete(cleanEmail);

    return res.json({
      message: 'Kata sandi berhasil diperbarui. Silakan masuk menggunakan kata sandi baru Anda.',
    });
  };

  app.post('/auth/reset-password', handleResetPassword);
  app.post('/api/auth/reset-password', handleResetPassword);

  const handleMe = (req: AuthenticatedRequest, res: Response) => {
    const u = req.currentUser!;
    res.json({ id: u.id, name: u.name, email: u.email });
  };

  app.get('/auth/me', authMiddleware, handleMe);
  app.get('/api/auth/me', authMiddleware, handleMe);

  // PROJECTS ROUTES
  const handleListProjects = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projects = db.prepare(`
      SELECT * FROM projects 
      WHERE owner_id = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)
      ORDER BY created_at DESC
    `).all(user.id, user.id) as unknown as ProjectRow[];

    res.json(projects.map((p) => formatProjectOut(p, user.id)));
  };

  app.get('/projects', authMiddleware, handleListProjects);
  app.get('/api/projects', authMiddleware, handleListProjects);

  const handleCreateProject = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const { name, description } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(422).json({ detail: 'Nama proyek wajib diisi' });
    }

    const now = new Date().toISOString();
    const cleanName = name.trim().slice(0, 120);
    const cleanDesc = typeof description === 'string' ? description.trim().slice(0, 1000) : '';

    const result = db.prepare(`
      INSERT INTO projects (owner_id, name, description, created_at)
      VALUES (?, ?, ?, ?)
    `).run(user.id, cleanName, cleanDesc, now);

    const project: ProjectRow = {
      id: Number(result.lastInsertRowid),
      owner_id: user.id,
      name: cleanName,
      description: cleanDesc,
      created_at: now,
    };

    res.status(201).json(formatProjectOut(project, user.id));
  };

  app.post('/projects', authMiddleware, handleCreateProject);
  app.post('/api/projects', authMiddleware, handleCreateProject);

  const handleGetProject = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    if (!userHasProjectAccess(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRow | undefined;
    if (!project) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }
    res.json(formatProjectOut(project, user.id));
  };

  app.get('/projects/:id', authMiddleware, handleGetProject);
  app.get('/api/projects/:id', authMiddleware, handleGetProject);

  const handleUpdateProject = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    if (!userIsProjectOwner(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    const { name, description } = req.body || {};
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as unknown as ProjectRow;

    let newName = project.name;
    let newDesc = project.description;

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(422).json({ detail: 'Nama proyek tidak boleh kosong' });
      }
      newName = name.trim().slice(0, 120);
    }
    if (description !== undefined) {
      newDesc = String(description).trim().slice(0, 1000);
    }

    db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(newName, newDesc, projectId);
    const updated = { ...project, name: newName, description: newDesc };

    res.json(formatProjectOut(updated, user.id));
  };

  app.patch('/projects/:id', authMiddleware, handleUpdateProject);
  app.patch('/api/projects/:id', authMiddleware, handleUpdateProject);

  const handleDeleteProject = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    if (!userIsProjectOwner(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    // CASCADE delete removes project_members and tasks automatically
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    res.status(204).send();
  };

  app.delete('/projects/:id', authMiddleware, handleDeleteProject);
  app.delete('/api/projects/:id', authMiddleware, handleDeleteProject);

  const handleAddMember = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    if (!userIsProjectOwner(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    const { email, role_name, jobdesk, role_id } = req.body || {};
    if (!email) {
      return res.status(422).json({ detail: 'Email anggota wajib diisi' });
    }

    const targetEmail = String(email).toLowerCase().trim();
    const targetUser = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(targetEmail) as { id: number; name: string; email: string } | undefined;
    if (!targetUser) {
      return res.status(404).json({ detail: 'Pengguna dengan email tersebut tidak ditemukan' });
    }

    if (targetUser.id === user.id) {
      return res.status(409).json({ detail: 'Pengguna sudah menjadi pemilik proyek' });
    }

    const alreadyMember = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, targetUser.id);
    if (alreadyMember) {
      return res.status(409).json({ detail: 'Pengguna sudah menjadi anggota proyek' });
    }

    const cleanRole = role_name ? String(role_name).trim().slice(0, 80) : 'Anggota Tim';
    const cleanJobdesk = jobdesk ? String(jobdesk).trim().slice(0, 1000) : '';
    const cleanRoleId = role_id ? parseInt(String(role_id), 10) : null;

    db.prepare('INSERT INTO project_members (project_id, user_id, role_id, role_name, jobdesk) VALUES (?, ?, ?, ?, ?)').run(
      projectId,
      targetUser.id,
      cleanRoleId,
      cleanRole,
      cleanJobdesk
    );

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as unknown as ProjectRow;
    res.json(formatProjectOut(project, user.id));
  };

  app.post('/projects/:id/members', authMiddleware, handleAddMember);
  app.post('/api/projects/:id/members', authMiddleware, handleAddMember);

  const handleUpdateMember = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);

    if (!userIsProjectOwner(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    const { role_name, jobdesk, role_id } = req.body || {};
    const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, targetUserId);
    if (!member) {
      return res.status(404).json({ detail: 'Anggota tidak ditemukan dalam proyek ini' });
    }

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (role_name !== undefined) {
      updates.push('role_name = ?');
      params.push(String(role_name).trim().slice(0, 80));
    }
    if (jobdesk !== undefined) {
      updates.push('jobdesk = ?');
      params.push(String(jobdesk).trim().slice(0, 1000));
    }
    if (role_id !== undefined) {
      updates.push('role_id = ?');
      params.push(role_id ? parseInt(String(role_id), 10) : null);
    }

    if (updates.length > 0) {
      params.push(projectId, targetUserId);
      db.prepare(`UPDATE project_members SET ${updates.join(', ')} WHERE project_id = ? AND user_id = ?`).run(...params);
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as unknown as ProjectRow;
    res.json(formatProjectOut(project, user.id));
  };

  app.patch('/projects/:id/members/:userId', authMiddleware, handleUpdateMember);
  app.patch('/api/projects/:id/members/:userId', authMiddleware, handleUpdateMember);

  const handleUpdateOwnerRole = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    if (!userIsProjectOwner(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    const { role_name, jobdesk } = req.body || {};
    const cleanRole = role_name !== undefined ? String(role_name).trim().slice(0, 80) : 'Project Manager';
    const cleanJobdesk = jobdesk !== undefined ? String(jobdesk).trim().slice(0, 1000) : '';

    db.prepare('UPDATE projects SET owner_role_name = ?, owner_jobdesk = ? WHERE id = ?').run(cleanRole, cleanJobdesk, projectId);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as unknown as ProjectRow;
    res.json(formatProjectOut(project, user.id));
  };

  app.patch('/projects/:id/owner-role', authMiddleware, handleUpdateOwnerRole);
  app.patch('/api/projects/:id/owner-role', authMiddleware, handleUpdateOwnerRole);

  const handleRemoveMember = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);
    if (!userIsProjectOwner(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(projectId, targetUserId);
    // Unassign tasks assigned to this removed member
    db.prepare('UPDATE tasks SET assignee_id = NULL WHERE project_id = ? AND assignee_id = ?').run(projectId, targetUserId);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as unknown as ProjectRow;
    res.json(formatProjectOut(project, user.id));
  };

  app.delete('/projects/:id/members/:userId', authMiddleware, handleRemoveMember);
  app.delete('/api/projects/:id/members/:userId', authMiddleware, handleRemoveMember);

  // PROJECT ROLES MANAGEMENT
  const handleListRoles = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    if (!userHasProjectAccess(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    seedDefaultProjectRoles(projectId);
    const roles = db.prepare('SELECT id, project_id, name, description, color, created_at FROM project_roles WHERE project_id = ? ORDER BY id ASC').all(projectId);
    res.json(roles);
  };

  app.get('/projects/:id/roles', authMiddleware, handleListRoles);
  app.get('/api/projects/:id/roles', authMiddleware, handleListRoles);

  const handleCreateRole = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    if (!userIsProjectOwner(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    const { name, description, color } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(422).json({ detail: 'Nama role wajib diisi' });
    }

    const cleanName = name.trim().slice(0, 80);
    const cleanDesc = description ? String(description).trim().slice(0, 500) : '';
    const cleanColor = color ? String(color).trim().slice(0, 20) : '#0284c7';
    const now = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO project_roles (project_id, name, description, color, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(projectId, cleanName, cleanDesc, cleanColor, now);

    res.status(201).json({
      id: Number(result.lastInsertRowid),
      project_id: projectId,
      name: cleanName,
      description: cleanDesc,
      color: cleanColor,
      created_at: now,
    });
  };

  app.post('/projects/:id/roles', authMiddleware, handleCreateRole);
  app.post('/api/projects/:id/roles', authMiddleware, handleCreateRole);

  const handleUpdateRole = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    const roleId = parseInt(req.params.roleId, 10);

    if (!userIsProjectOwner(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    const { name, description, color } = req.body || {};
    const existing = db.prepare('SELECT * FROM project_roles WHERE id = ? AND project_id = ?').get(roleId, projectId) as ProjectRoleRow | undefined;
    if (!existing) {
      return res.status(404).json({ detail: 'Role tidak ditemukan' });
    }

    const cleanName = name !== undefined && String(name).trim() ? String(name).trim().slice(0, 80) : existing.name;
    const cleanDesc = description !== undefined ? String(description).trim().slice(0, 500) : existing.description;
    const cleanColor = color !== undefined ? String(color).trim().slice(0, 20) : existing.color;

    db.prepare('UPDATE project_roles SET name = ?, description = ?, color = ? WHERE id = ?').run(cleanName, cleanDesc, cleanColor, roleId);

    res.json({
      ...existing,
      name: cleanName,
      description: cleanDesc,
      color: cleanColor,
    });
  };

  app.patch('/projects/:id/roles/:roleId', authMiddleware, handleUpdateRole);
  app.patch('/api/projects/:id/roles/:roleId', authMiddleware, handleUpdateRole);

  const handleDeleteRole = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    const roleId = parseInt(req.params.roleId, 10);

    if (!userIsProjectOwner(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    db.prepare('DELETE FROM project_roles WHERE id = ? AND project_id = ?').run(roleId, projectId);
    res.status(204).send();
  };

  app.delete('/projects/:id/roles/:roleId', authMiddleware, handleDeleteRole);
  app.delete('/api/projects/:id/roles/:roleId', authMiddleware, handleDeleteRole);

  // MEMBER PROGRESS TRACKING ENDPOINT
  const handleGetMemberProgress = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.id, 10);
    if (!userHasProjectAccess(user.id, projectId)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as unknown as ProjectRow;
    const projectFormatted = formatProjectOut(project, user.id);

    const result = projectFormatted.members.map((m) => {
      const tasks = (db.prepare('SELECT * FROM tasks WHERE project_id = ? AND assignee_id = ? ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC').all(projectId, m.user_id) as unknown as TaskRow[]).map(formatTaskOut);

      const total = tasks.length;
      const completed = tasks.filter((t) => t.status === 'Completed').length;
      const inProgress = tasks.filter((t) => t.status === 'In Progress').length;
      const todo = tasks.filter((t) => t.status === 'To Do').length;
      const overdue = tasks.filter((t) => t.is_overdue && t.status !== 'Completed').length;

      return {
        user_id: m.user_id,
        name: m.name,
        email: m.email,
        is_owner: m.is_owner,
        role_name: m.role_name,
        jobdesk: m.jobdesk,
        total_tasks: total,
        completed_tasks: completed,
        in_progress_tasks: inProgress,
        todo_tasks: todo,
        overdue_tasks: overdue,
        tasks,
      };
    });

    res.json(result);
  };

  app.get('/projects/:id/member-progress', authMiddleware, handleGetMemberProgress);
  app.get('/api/projects/:id/member-progress', authMiddleware, handleGetMemberProgress);

  // TASKS ROUTES
  const handleListTasks = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const { q, status, priority, project_id, overdue, assignee_id } = req.query;

    const accessibleProjectIds = (db.prepare(`
      SELECT id FROM projects WHERE owner_id = ?
      UNION
      SELECT project_id as id FROM project_members WHERE user_id = ?
    `).all(user.id, user.id) as { id: number }[]).map((r) => r.id);

    if (accessibleProjectIds.length === 0) {
      return res.json([]);
    }

    let sql = `SELECT * FROM tasks WHERE project_id IN (${accessibleProjectIds.join(',')})`;
    const params: (string | number)[] = [];

    if (q && typeof q === 'string') {
      sql += ' AND (lower(title) LIKE ? OR lower(description) LIKE ?)';
      const needle = `%${q.toLowerCase().trim()}%`;
      params.push(needle, needle);
    }

    if (status && typeof status === 'string') {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (priority && typeof priority === 'string') {
      sql += ' AND priority = ?';
      params.push(priority);
    }

    if (project_id) {
      const pid = parseInt(String(project_id), 10);
      sql += ' AND project_id = ?';
      params.push(pid);
    }

    if (assignee_id) {
      const aid = parseInt(String(assignee_id), 10);
      sql += ' AND assignee_id = ?';
      params.push(aid);
    }

    if (overdue === 'true') {
      const today = getTodayString();
      sql += " AND due_date IS NOT NULL AND due_date < ? AND status != 'Completed'";
      params.push(today);
    }

    sql += ' ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, id DESC';

    const tasks = db.prepare(sql).all(...params) as unknown as TaskRow[];
    res.json(tasks.map(formatTaskOut));
  };

  app.get('/tasks', authMiddleware, handleListTasks);
  app.get('/api/tasks', authMiddleware, handleListTasks);

  const handleCreateTask = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const { project_id, title, description, status, priority, due_date, assignee_id } = req.body || {};

    if (!project_id) {
      return res.status(422).json({ detail: 'Proyek wajib dipilih' });
    }
    const pid = parseInt(String(project_id), 10);
    if (!userHasProjectAccess(user.id, pid)) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(422).json({ detail: 'Judul tugas wajib diisi' });
    }

    const now = new Date().toISOString();
    const cleanTitle = title.trim().slice(0, 160);
    const cleanDesc = typeof description === 'string' ? description.trim().slice(0, 2000) : '';
    const cleanStatus = ['To Do', 'In Progress', 'Completed'].includes(status) ? status : 'To Do';
    const cleanPriority = ['Low', 'Medium', 'High'].includes(priority) ? priority : 'Medium';
    const cleanDueDate = due_date ? String(due_date).trim() : null;
    const cleanAssigneeId = assignee_id ? parseInt(String(assignee_id), 10) : null;

    const result = db.prepare(`
      INSERT INTO tasks (project_id, creator_id, assignee_id, title, description, status, priority, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(pid, user.id, cleanAssigneeId, cleanTitle, cleanDesc, cleanStatus, cleanPriority, cleanDueDate, now, now);

    const task: TaskRow = {
      id: Number(result.lastInsertRowid),
      project_id: pid,
      creator_id: user.id,
      assignee_id: cleanAssigneeId,
      title: cleanTitle,
      description: cleanDesc,
      status: cleanStatus,
      priority: cleanPriority,
      due_date: cleanDueDate,
      created_at: now,
      updated_at: now,
    };

    let gamification = null;
    if (cleanStatus === 'Completed') {
      gamification = handleTaskCompletionGamification(task.id, user.id);
    }

    res.status(201).json({ ...formatTaskOut(task), gamification });
  };

  app.post('/tasks', authMiddleware, handleCreateTask);
  app.post('/api/tasks', authMiddleware, handleCreateTask);

  const handleGetTask = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const taskId = parseInt(req.params.id, 10);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as unknown as TaskRow | undefined;
    if (!task || !userHasProjectAccess(user.id, task.project_id)) {
      return res.status(404).json({ detail: 'Tugas tidak ditemukan' });
    }

    res.json(formatTaskOut(task));
  };

  app.get('/tasks/:id', authMiddleware, handleGetTask);
  app.get('/api/tasks/:id', authMiddleware, handleGetTask);

  const handleUpdateTask = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const taskId = parseInt(req.params.id, 10);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as unknown as TaskRow | undefined;
    if (!task || !userHasProjectAccess(user.id, task.project_id)) {
      return res.status(404).json({ detail: 'Tugas tidak ditemukan' });
    }

    const { project_id, title, description, status, priority, due_date, assignee_id } = req.body || {};

    let targetPid = task.project_id;
    if (project_id !== undefined) {
      targetPid = parseInt(String(project_id), 10);
      if (!userHasProjectAccess(user.id, targetPid)) {
        return res.status(404).json({ detail: 'Proyek tujuan tidak ditemukan' });
      }
    }

    let newTitle = task.title;
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(422).json({ detail: 'Judul tugas tidak boleh kosong' });
      }
      newTitle = title.trim().slice(0, 160);
    }

    let newDesc = task.description;
    if (description !== undefined) {
      newDesc = String(description).trim().slice(0, 2000);
    }

    let newStatus = task.status;
    if (status !== undefined && ['To Do', 'In Progress', 'Completed'].includes(status)) {
      newStatus = status;
    }

    let newPriority = task.priority;
    if (priority !== undefined && ['Low', 'Medium', 'High'].includes(priority)) {
      newPriority = priority;
    }

    let newDueDate = task.due_date;
    if (due_date !== undefined) {
      newDueDate = due_date ? String(due_date).trim() : null;
    }

    let newAssigneeId = task.assignee_id;
    if (assignee_id !== undefined) {
      newAssigneeId = assignee_id ? parseInt(String(assignee_id), 10) : null;
    }

    const now = new Date().toISOString();

    (db.prepare(`
      UPDATE tasks 
      SET project_id = ?, assignee_id = ?, title = ?, description = ?, status = ?, priority = ?, due_date = ?, updated_at = ?
      WHERE id = ?
    `) as any).run(targetPid, newAssigneeId, newTitle, newDesc, newStatus, newPriority, newDueDate, now, taskId);

    const updatedTask: TaskRow = {
      ...task,
      project_id: targetPid,
      assignee_id: newAssigneeId,
      title: newTitle,
      description: newDesc,
      status: newStatus,
      priority: newPriority,
      due_date: newDueDate,
      updated_at: now,
    };

    let gamification = null;
    if (task.status !== 'Completed' && newStatus === 'Completed') {
      gamification = handleTaskCompletionGamification(taskId, user.id);
    }

    res.json({ ...formatTaskOut(updatedTask), gamification });
  };

  app.patch('/tasks/:id', authMiddleware, handleUpdateTask);
  app.patch('/api/tasks/:id', authMiddleware, handleUpdateTask);


  const handleDeleteTask = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const taskId = parseInt(req.params.id, 10);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
    if (!task || !userHasProjectAccess(user.id, task.project_id)) {
      return res.status(404).json({ detail: 'Tugas tidak ditemukan' });
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    res.status(204).send();
  };

  app.delete('/tasks/:id', authMiddleware, handleDeleteTask);
  app.delete('/api/tasks/:id', authMiddleware, handleDeleteTask);

  // ==========================================
  // TASK REMINDER EMAIL ENDPOINTS
  // ==========================================
  const handleRemindTask = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const taskId = parseInt(req.params.id, 10);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
    if (!task || !userHasProjectAccess(user.id, task.project_id)) {
      return res.status(404).json({ detail: 'Tugas tidak ditemukan' });
    }

    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(task.project_id) as { name: string } | undefined;
    const projectName = project ? project.name : 'Proyek Produktifa';

    await sendTaskReminderEmail(user.email, user.name, task, projectName);

    return res.json({
      message: `Pengingat tugas "${task.title}" berhasil dikirim ke ${user.email}. Silakan cek kotak masuk atau folder spam.`,
      email: user.email,
      task_id: task.id,
    });
  };

  app.post('/tasks/:id/remind', authMiddleware, handleRemindTask);
  app.post('/api/tasks/:id/remind', authMiddleware, handleRemindTask);

  const handleRemindSummary = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;

    const accessibleProjects = db.prepare(`
      SELECT id, name FROM projects WHERE owner_id = ?
      UNION
      SELECT p.id, p.name FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = ?
    `).all(user.id, user.id) as { id: number; name: string }[];

    if (accessibleProjects.length === 0) {
      return res.json({ message: 'Anda belum memiliki proyek atau tugas untuk diingatkan.' });
    }

    const projectMap = new Map<number, string>();
    for (const p of accessibleProjects) {
      projectMap.set(p.id, p.name);
    }

    const projectIds = accessibleProjects.map((p) => p.id).join(',');
    const tasks = db.prepare(`
      SELECT * FROM tasks 
      WHERE project_id IN (${projectIds}) AND status != 'Completed'
      ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC
    `).all() as unknown as TaskRow[];

    if (tasks.length === 0) {
      return res.json({ message: 'Hebat! Semua tugas Anda telah selesai, tidak ada tugas tertunda untuk diingatkan.' });
    }

    await sendTaskSummaryReminderEmail(user.email, user.name, tasks, projectMap);

    return res.json({
      message: `Ringkasan ${tasks.length} tugas aktif berhasil dikirim ke ${user.email}. Silakan cek kotak masuk atau folder spam.`,
      email: user.email,
      total_tasks: tasks.length,
    });
  };

  app.post('/tasks/remind-summary', authMiddleware, handleRemindSummary);
  app.post('/api/tasks/remind-summary', authMiddleware, handleRemindSummary);

  // ==========================================
  // GAMIFICATION ROUTES
  // ==========================================
  const handleGamificationOverview = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    ensureGamificationProfile(user.id);
    ensureUserQuests(user.id);

    const profile = db.prepare('SELECT * FROM gamification_profiles WHERE user_id = ?').get(user.id) as any;
    const levelDetails = calculateLevelDetails(profile.total_xp);
    const streakInfo = calculateUserStreak(user.id);

    // Profile object
    const profileOut = {
      user_id: user.id,
      total_xp: profile.total_xp,
      level: levelDetails.level,
      title: levelDetails.title,
      avatar_frame: levelDetails.avatar_frame,
      current_streak: streakInfo.currentStreak,
      longest_streak: streakInfo.longestStreak,
      last_active_date: profile.last_active_date,
      current_level_xp: levelDetails.current_level_xp,
      next_level_xp: levelDetails.next_level_xp,
      xp_in_level: levelDetails.xp_in_level,
      xp_needed: levelDetails.xp_needed,
      progress_percent: levelDetails.progress_percent,
    };

    // Quests
    const today = getTodayString();
    const week = getWeekKey();

    const dailyRows = db.prepare(`
      SELECT * FROM user_quests WHERE user_id = ? AND period_key = ? AND quest_type = 'daily' ORDER BY id ASC
    `).all(user.id, today) as any[];

    const weeklyRows = db.prepare(`
      SELECT * FROM user_quests WHERE user_id = ? AND period_key = ? AND quest_type = 'weekly' ORDER BY id ASC
    `).all(user.id, week) as any[];

    const formatQuest = (q: any) => ({
      id: q.id,
      user_id: q.user_id,
      quest_type: q.quest_type,
      period_key: q.period_key,
      quest_key: q.quest_key,
      title: q.title,
      description: q.description,
      target_count: q.target_count,
      current_count: q.current_count,
      xp_reward: q.xp_reward,
      is_claimed: Boolean(q.is_claimed),
      completed_at: q.completed_at,
      progress_percent: Math.min(100, Math.round((q.current_count / q.target_count) * 100)),
      is_complete: q.current_count >= q.target_count,
    });

    const dailyQuests = dailyRows.map(formatQuest);
    const weeklyQuests = weeklyRows.map(formatQuest);

    const dailyAllCompleted = dailyQuests.length > 0 && dailyQuests.every((q) => q.is_complete);
    const weeklyAllCompleted = weeklyQuests.length > 0 && weeklyQuests.every((q) => q.is_complete);
    const dailyBonusClaimed = dailyQuests.length > 0 && dailyQuests.every((q) => q.is_claimed);
    const weeklyBonusClaimed = weeklyQuests.length > 0 && weeklyQuests.every((q) => q.is_claimed);

    // Badges
    const badges = evaluateAndGetBadges(user.id);

    // Recent XP transactions ledger (last 15)
    const recentLedger = db.prepare(`
      SELECT id, user_id, task_id, amount, source_type, description, created_at
      FROM xp_ledger
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 15
    `).all(user.id) as any[];

    // 30-Day Activity Calendar
    const activityDays: any[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();

      const act = db.prepare('SELECT tasks_completed FROM user_activity_days WHERE user_id = ? AND activity_date = ?').get(user.id, dateStr) as { tasks_completed: number } | undefined;

      activityDays.push({
        date: dateStr,
        day_of_week: dayOfWeek,
        tasks_completed: act ? act.tasks_completed : 0,
        is_today: dateStr === today,
      });
    }

    res.json({
      profile: profileOut,
      quests: {
        daily: dailyQuests,
        weekly: weeklyQuests,
        daily_all_completed: dailyAllCompleted,
        weekly_all_completed: weeklyAllCompleted,
        daily_bonus_claimed: dailyBonusClaimed,
        weekly_bonus_claimed: weeklyBonusClaimed,
      },
      badges,
      recent_ledger: recentLedger,
      activity: {
        days: activityDays,
        current_streak: streakInfo.currentStreak,
        longest_streak: streakInfo.longestStreak,
      },
    });
  };

  app.get('/gamification/overview', authMiddleware, handleGamificationOverview);
  app.get('/api/gamification/overview', authMiddleware, handleGamificationOverview);

  const handleClaimQuest = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const questId = parseInt(req.params.id, 10);

    const quest = db.prepare('SELECT * FROM user_quests WHERE id = ? AND user_id = ?').get(questId, user.id) as any;
    if (!quest) {
      return res.status(404).json({ detail: 'Misi tidak ditemukan' });
    }

    if (quest.current_count < quest.target_count) {
      return res.status(400).json({ detail: 'Target misi belum tercapai' });
    }

    if (quest.is_claimed) {
      return res.status(400).json({ detail: 'Hadiah misi ini sudah pernah diklaim' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE user_quests SET is_claimed = 1, completed_at = ? WHERE id = ?').run(now, questId);

    // Award XP
    const sourceType = quest.quest_type === 'daily' ? 'daily_quest' : 'weekly_quest';
    const { newTotalXp, levelDetails } = awardXp(
      user.id,
      null,
      quest.xp_reward,
      sourceType,
      `Klaim Hadiah Misi: "${quest.title}"`
    );

    let allPeriodBonus = 0;
    // Check if all quests of this type for this period are now claimed
    const siblingQuests = db.prepare(`
      SELECT * FROM user_quests WHERE user_id = ? AND period_key = ? AND quest_type = ?
    `).all(user.id, quest.period_key, quest.quest_type) as any[];

    const allClaimed = siblingQuests.length > 0 && siblingQuests.every((q) => q.is_claimed || q.id === questId);

    if (allClaimed) {
      const bonusAmount = quest.quest_type === 'daily' ? 15 : 50;
      allPeriodBonus = bonusAmount;
      awardXp(
        user.id,
        null,
        bonusAmount,
        quest.quest_type === 'daily' ? 'daily_bonus' : 'weekly_bonus',
        quest.quest_type === 'daily'
          ? 'Bonus Sempurna: Menyelesaikan Seluruh Misi Harian!'
          : 'Bonus Sempurna: Menyelesaikan Seluruh Target Mingguan!'
      );
    }

    res.json({
      success: true,
      quest_id: questId,
      xp_gained: quest.xp_reward + allPeriodBonus,
      all_period_bonus: allPeriodBonus,
      new_total_xp: newTotalXp + allPeriodBonus,
      level: levelDetails.level,
      title: levelDetails.title,
    });
  };

  app.post('/gamification/quests/:id/claim', authMiddleware, handleClaimQuest);
  app.post('/api/gamification/quests/:id/claim', authMiddleware, handleClaimQuest);

  // ==========================================
  // CHAT ROUTES (PRIVATE & PROJECT CHAT)
  // ==========================================

  // 1. List conversations (Project rooms & Private contacts)
  const handleListConversations = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;

    // A. Project Rooms accessible by user
    const accessibleProjects = db.prepare(`
      SELECT p.id, p.name, p.description
      FROM projects p
      WHERE p.owner_id = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
      ORDER BY p.id ASC
    `).all(user.id, user.id) as { id: number; name: string; description: string }[];

    const projectRooms = accessibleProjects.map((p) => {
      const lastMsg = db.prepare(`
        SELECT m.id, m.content, m.sender_id, m.created_at, u.name as sender_name
        FROM chat_messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.chat_type = 'project' AND m.project_id = ?
        ORDER BY m.id DESC LIMIT 1
      `).get(p.id) as any;

      const readStatus = db.prepare('SELECT last_read_message_id FROM project_chat_reads WHERE user_id = ? AND project_id = ?').get(user.id, p.id) as any;
      const lastReadId = readStatus ? readStatus.last_read_message_id : 0;

      const unreadCount = (db.prepare(`
        SELECT count(*) as c
        FROM chat_messages
        WHERE chat_type = 'project' AND project_id = ? AND id > ? AND sender_id != ?
      `).get(p.id, lastReadId, user.id) as { c: number }).c;

      const memberCount = (db.prepare('SELECT count(*) as c FROM project_members WHERE project_id = ?').get(p.id) as { c: number }).c + 1;

      return {
        id: `project:${p.id}`,
        type: 'project',
        target_id: p.id,
        title: p.name,
        subtitle: `${memberCount} Anggota Tim`,
        unread_count: unreadCount,
        last_message: lastMsg
          ? {
              content: lastMsg.content,
              sender_name: lastMsg.sender_name,
              created_at: lastMsg.created_at,
            }
          : null,
      };
    });

    // B. Private Contacts: Users sharing projects or having prior messages
    const accessibleProjectIds = accessibleProjects.map((p) => p.id);
    const pidClause = accessibleProjectIds.length > 0 ? `p.id IN (${accessibleProjectIds.join(',')})` : '1=0';

    const colleagues = db.prepare(`
      SELECT DISTINCT u.id, u.name, u.email
      FROM users u
      WHERE u.id != ? AND (
        u.id IN (
          SELECT pm.user_id FROM project_members pm
          JOIN projects p ON pm.project_id = p.id
          WHERE ${pidClause}
        ) OR u.id IN (
          SELECT p.owner_id FROM projects p WHERE ${pidClause}
        ) OR u.id IN (
          SELECT sender_id FROM chat_messages WHERE recipient_id = ?
        ) OR u.id IN (
          SELECT recipient_id FROM chat_messages WHERE sender_id = ?
        )
      )
      ORDER BY u.name ASC
    `).all(user.id, user.id, user.id) as { id: number; name: string; email: string }[];

    const privateConversations = colleagues.map((c) => {
      const lastMsg = db.prepare(`
        SELECT m.id, m.content, m.sender_id, m.created_at, u.name as sender_name
        FROM chat_messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.chat_type = 'private' AND (
          (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
        )
        ORDER BY m.id DESC LIMIT 1
      `).get(user.id, c.id, c.id, user.id) as any;

      const unreadCount = (db.prepare(`
        SELECT count(*) as c
        FROM chat_messages
        WHERE chat_type = 'private' AND sender_id = ? AND recipient_id = ? AND is_read = 0
      `).get(c.id, user.id) as { c: number }).c;

      return {
        id: `private:${c.id}`,
        type: 'private',
        target_id: c.id,
        title: c.name,
        subtitle: c.email,
        unread_count: unreadCount,
        last_message: lastMsg
          ? {
              content: lastMsg.content,
              sender_name: lastMsg.sender_name,
              created_at: lastMsg.created_at,
            }
          : null,
      };
    });

    res.json({
      project_rooms: projectRooms,
      private_conversations: privateConversations,
    });
  };

  app.get('/chat/conversations', authMiddleware, handleListConversations);
  app.get('/api/chat/conversations', authMiddleware, handleListConversations);

  // 2. Private chat messages
  const handleGetPrivateMessages = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const targetUserId = parseInt(req.params.userId, 10);

    const targetUser = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(targetUserId) as any;
    if (!targetUser) {
      return res.status(404).json({ detail: 'Pengguna tujuan tidak ditemukan' });
    }

    // Mark messages sent by targetUserId to current user as read
    db.prepare(`
      UPDATE chat_messages
      SET is_read = 1
      WHERE chat_type = 'private' AND sender_id = ? AND recipient_id = ? AND is_read = 0
    `).run(targetUserId, user.id);

    const rows = db.prepare(`
      SELECT * FROM chat_messages
      WHERE chat_type = 'private' AND (
        (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      )
      ORDER BY id ASC
    `).all(user.id, targetUserId, targetUserId, user.id) as any[];

    const messages = rows.map((r) => formatChatMessage(r, user.id));

    res.json({
      target_user: targetUser,
      messages,
    });
  };

  app.get('/chat/private/:userId', authMiddleware, handleGetPrivateMessages);
  app.get('/api/chat/private/:userId', authMiddleware, handleGetPrivateMessages);

  const handleSendPrivateMessage = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const targetUserId = parseInt(req.params.userId, 10);

    const targetUser = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(targetUserId) as any;
    if (!targetUser) {
      return res.status(404).json({ detail: 'Pengguna tujuan tidak ditemukan' });
    }

    const { content, task_ref_id } = req.body || {};
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(422).json({ detail: 'Pesan teks tidak boleh kosong' });
    }

    const cleanContent = content.trim().slice(0, 4000);
    const cleanTaskRefId = task_ref_id ? parseInt(String(task_ref_id), 10) : null;
    const now = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO chat_messages (chat_type, project_id, sender_id, recipient_id, content, task_ref_id, is_read, created_at)
      VALUES ('private', null, ?, ?, ?, ?, 0, ?)
    `).run(user.id, targetUserId, cleanContent, cleanTaskRefId, now);

    const newMsgRow = {
      id: Number(result.lastInsertRowid),
      chat_type: 'private',
      project_id: null,
      sender_id: user.id,
      recipient_id: targetUserId,
      content: cleanContent,
      task_ref_id: cleanTaskRefId,
      is_read: 0,
      created_at: now,
    };

    const formatted = formatChatMessage(newMsgRow, user.id);
    broadcastPrivateMessage(formatted, user.id, targetUserId);

    res.status(201).json(formatted);
  };

  app.post('/chat/private/:userId', authMiddleware, handleSendPrivateMessage);
  app.post('/api/chat/private/:userId', authMiddleware, handleSendPrivateMessage);

  // 3. Project chat messages
  const handleGetProjectMessages = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.projectId, 10);

    // SECURITY CHECK: Pengguna harus anggota atau pemilik proyek aktif!
    if (!userHasProjectAccess(user.id, projectId)) {
      return res.status(403).json({ detail: 'Akses ditolak: Anda bukan anggota proyek ini' });
    }

    const project = db.prepare('SELECT id, name, description, owner_id, owner_role_name FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) {
      return res.status(404).json({ detail: 'Proyek tidak ditemukan' });
    }

    const rows = db.prepare(`
      SELECT * FROM chat_messages
      WHERE chat_type = 'project' AND project_id = ?
      ORDER BY id ASC
    `).all(projectId) as any[];

    // Update last read message ID for this user in this project
    const lastMsgId = rows.length > 0 ? rows[rows.length - 1].id : 0;
    if (lastMsgId > 0) {
      db.prepare(`
        INSERT INTO project_chat_reads (user_id, project_id, last_read_message_id, last_read_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, project_id) DO UPDATE SET
          last_read_message_id = max(excluded.last_read_message_id, project_chat_reads.last_read_message_id),
          last_read_at = excluded.last_read_at
      `).run(user.id, projectId, lastMsgId, new Date().toISOString());
    }

    const messages = rows.map((r) => formatChatMessage(r, user.id));

    // Get members list with their role_name
    const members = db.prepare(`
      SELECT u.id, u.name, u.email, pm.role_name
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
    `).all(projectId) as any[];

    const owner = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(project.owner_id) as any;
    const allMembers = [
      {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role_name: project.owner_role_name || 'Project Manager',
        is_owner: true,
      },
      ...members.map((m) => ({
        ...m,
        role_name: m.role_name && m.role_name.trim() ? m.role_name.trim() : m.id === 2 ? 'Developer' : m.id === 3 ? 'Designer' : 'Anggota Tim',
        is_owner: false,
      })),
    ];

    res.json({
      project,
      members: allMembers,
      messages,
    });
  };

  app.get('/chat/project/:projectId', authMiddleware, handleGetProjectMessages);
  app.get('/api/chat/project/:projectId', authMiddleware, handleGetProjectMessages);

  const handleSendProjectMessage = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.projectId, 10);

    // SECURITY CHECK: Pengguna harus anggota atau pemilik proyek aktif!
    if (!userHasProjectAccess(user.id, projectId)) {
      return res.status(403).json({ detail: 'Akses ditolak: Anda bukan anggota proyek ini' });
    }

    const { content, task_ref_id } = req.body || {};
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(422).json({ detail: 'Pesan teks tidak boleh kosong' });
    }

    const cleanContent = content.trim().slice(0, 4000);
    const cleanTaskRefId = task_ref_id ? parseInt(String(task_ref_id), 10) : null;
    const now = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO chat_messages (chat_type, project_id, sender_id, recipient_id, content, task_ref_id, is_read, created_at)
      VALUES ('project', ?, ?, null, ?, ?, 1, ?)
    `).run(projectId, user.id, cleanContent, cleanTaskRefId, now);

    const newId = Number(result.lastInsertRowid);

    // Update sender's read status
    db.prepare(`
      INSERT INTO project_chat_reads (user_id, project_id, last_read_message_id, last_read_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, project_id) DO UPDATE SET
        last_read_message_id = max(excluded.last_read_message_id, project_chat_reads.last_read_message_id),
        last_read_at = excluded.last_read_at
    `).run(user.id, projectId, newId, now);

    const newMsgRow = {
      id: newId,
      chat_type: 'project',
      project_id: projectId,
      sender_id: user.id,
      recipient_id: null,
      content: cleanContent,
      task_ref_id: cleanTaskRefId,
      is_read: 1,
      created_at: now,
    };

    const formatted = formatChatMessage(newMsgRow, user.id);
    broadcastProjectMessage(formatted, projectId);

    res.status(201).json(formatted);
  };

  app.post('/chat/project/:projectId', authMiddleware, handleSendProjectMessage);
  app.post('/api/chat/project/:projectId', authMiddleware, handleSendProjectMessage);

  // 4. Tasks list for reference selection in project chat
  const handleGetProjectTasksForChat = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const projectId = parseInt(req.params.projectId, 10);
    if (!userHasProjectAccess(user.id, projectId)) {
      return res.status(403).json({ detail: 'Akses ditolak' });
    }

    const tasks = db.prepare(`
      SELECT id, title, status, priority, due_date
      FROM tasks
      WHERE project_id = ?
      ORDER BY id DESC
    `).all(projectId);

    res.json(tasks);
  };

  app.get('/chat/project/:projectId/tasks', authMiddleware, handleGetProjectTasksForChat);
  app.get('/api/chat/project/:projectId/tasks', authMiddleware, handleGetProjectTasksForChat);

  // 5. Total unread messages count for badges
  const handleGetChatUnreadCount = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;

    const pUnread = (db.prepare(`
      SELECT count(*) as c FROM chat_messages
      WHERE chat_type = 'private' AND recipient_id = ? AND is_read = 0
    `).get(user.id) as { c: number }).c;

    const accessibleProjectIds = (db.prepare(`
      SELECT id FROM projects WHERE owner_id = ?
      UNION
      SELECT project_id as id FROM project_members WHERE user_id = ?
    `).all(user.id, user.id) as { id: number }[]).map((r) => r.id);

    let prUnread = 0;
    for (const pid of accessibleProjectIds) {
      const readStatus = db.prepare('SELECT last_read_message_id FROM project_chat_reads WHERE user_id = ? AND project_id = ?').get(user.id, pid) as any;
      const lastReadId = readStatus ? readStatus.last_read_message_id : 0;
      const count = (db.prepare(`
        SELECT count(*) as c FROM chat_messages
        WHERE chat_type = 'project' AND project_id = ? AND id > ? AND sender_id != ?
      `).get(pid, lastReadId, user.id) as { c: number }).c;
      prUnread += count;
    }

    res.json({
      total: pUnread + prUnread,
      private_unread: pUnread,
      project_unread: prUnread,
    });
  };

  app.get('/chat/unread-count', authMiddleware, handleGetChatUnreadCount);
  app.get('/api/chat/unread-count', authMiddleware, handleGetChatUnreadCount);

  // DASHBOARD SUMMARY ROUTE
  const handleSummary = (req: AuthenticatedRequest, res: Response) => {
    const user = req.currentUser!;
    const today = getTodayString();

    const accessibleProjectIds = (db.prepare(`
      SELECT id FROM projects WHERE owner_id = ?
      UNION
      SELECT project_id as id FROM project_members WHERE user_id = ?
    `).all(user.id, user.id) as { id: number }[]).map((r) => r.id);

    if (accessibleProjectIds.length === 0) {
      return res.json({ total: 0, todo: 0, in_progress: 0, completed: 0, overdue: 0 });
    }

    const inList = accessibleProjectIds.join(',');

    const stats = db.prepare(`
      SELECT 
        sum(CASE WHEN status = 'To Do' THEN 1 ELSE 0 END) as todo,
        sum(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
        sum(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
        sum(CASE WHEN due_date IS NOT NULL AND due_date < ? AND status != 'Completed' THEN 1 ELSE 0 END) as overdue
      FROM tasks
      WHERE project_id IN (${inList})
    `).get(today) as { todo: number | null; in_progress: number | null; completed: number | null; overdue: number | null };

    const todo = stats.todo || 0;
    const in_progress = stats.in_progress || 0;
    const completed = stats.completed || 0;
    const overdue = stats.overdue || 0;
    const total = todo + in_progress + completed;

    res.json({ total, todo, in_progress, completed, overdue });
  };

  app.get('/dashboard/summary', authMiddleware, handleSummary);
  app.get('/api/dashboard/summary', authMiddleware, handleSummary);

  // Endpoint to download the entire project zip archive
  app.get('/api/download-project', (_req, res) => {
    const zipPath = path.join(__dirname, 'public', 'produktifa-project.zip');
    if (fs.existsSync(zipPath)) {
      res.download(zipPath, 'produktifa-project.zip');
    } else {
      res.status(404).json({ error: 'Paket unduhan proyek sedang dipersiapkan' });
    }
  });

  // VITE DEV MIDDLEWARE
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  setupWebSocket(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Produktifa server running with SQLite 3 and WebSockets on http://localhost:${PORT}`);
  });
}


startServer().catch((err) => {
  console.error('Failed to start Produktifa server:', err);
  process.exit(1);
});
