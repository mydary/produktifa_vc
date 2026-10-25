export const STATUSES = ["To Do", "In Progress", "Completed"] as const;
export const PRIORITIES = ["Low", "Medium", "High"] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface ProjectRole {
  id: number;
  project_id: number;
  name: string;
  description: string;
  color?: string;
  created_at?: string;
}

export interface ProjectMember {
  id: number;
  user_id: number;
  name: string;
  email: string;
  is_owner: boolean;
  role_id?: number | null;
  role_name?: string;
  jobdesk?: string;
  task_count?: number;
  done_count?: number;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  owner_id: number;
  is_owner: boolean;
  owner_role_name?: string;
  owner_jobdesk?: string;
  members: ProjectMember[];
  roles?: ProjectRole[];
  task_count: number;
  done_count: number;
}

export interface Task {
  id: number;
  project_id: number;
  creator_id?: number;
  assignee_id?: number | null;
  assignee_name?: string | null;
  assignee_role?: string | null;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  due_date: string | null;
  is_overdue: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Summary {
  total: number;
  todo: number;
  in_progress: number;
  completed: number;
  overdue: number;
}

export interface MemberProgressItem {
  user_id: number;
  name: string;
  email: string;
  is_owner: boolean;
  role_name: string;
  jobdesk: string;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  todo_tasks: number;
  overdue_tasks: number;
  tasks: Task[];
}

export interface GamificationProfile {
  user_id: number;
  total_xp: number;
  level: number;
  title: string;
  avatar_frame: string;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  current_level_xp: number;
  next_level_xp: number;
  xp_in_level: number;
  xp_needed: number;
  progress_percent: number;
}

export interface XpTransaction {
  id: number;
  user_id: number;
  task_id: number | null;
  amount: number;
  source_type: string;
  description: string;
  created_at: string;
}

export interface Quest {
  id: number;
  user_id: number;
  quest_type: "daily" | "weekly";
  period_key: string;
  quest_key: string;
  title: string;
  description: string;
  target_count: number;
  current_count: number;
  xp_reward: number;
  is_claimed: boolean;
  completed_at: string | null;
  progress_percent: number;
  is_complete: boolean;
}

export interface Badge {
  badge_key: string;
  name: string;
  description: string;
  icon: string;
  category: "starter" | "consistency" | "performance" | "collaboration";
  target_count: number;
  current_count: number;
  progress_percent: number;
  is_unlocked: boolean;
  unlocked_at: string | null;
}

export interface ActivityDay {
  date: string;
  day_of_week: number;
  tasks_completed: number;
  is_today: boolean;
}

export interface GamificationData {
  profile: GamificationProfile;
  quests: {
    daily: Quest[];
    weekly: Quest[];
    daily_all_completed: boolean;
    weekly_all_completed: boolean;
    daily_bonus_claimed: boolean;
    weekly_bonus_claimed: boolean;
  };
  badges: Badge[];
  recent_ledger: XpTransaction[];
  activity: {
    days: ActivityDay[];
    current_streak: number;
    longest_streak: number;
  };
}

export interface TaskReference {
  id: number;
  title: string;
  priority?: Priority;
  status?: Status;
  due_date?: string | null;
}

export interface ChatMessage {
  id: number;
  chat_type: "private" | "project";
  project_id?: number | null;
  sender_id: number;
  sender_name: string;
  sender_email?: string;
  sender_role?: string;
  is_sender_owner?: boolean;
  recipient_id?: number | null;
  recipient_name?: string;
  content: string;
  task_ref?: TaskReference | null;
  is_read: boolean;
  created_at: string;
}

export interface ConversationItem {
  id: string; // "private:<userId>" or "project:<projectId>"
  type: "private" | "project";
  target_id: number; // userId or projectId
  title: string;
  subtitle: string;
  role_name?: string;
  unread_count: number;
  last_message?: {
    content: string;
    sender_name: string;
    created_at: string;
  } | null;
}


