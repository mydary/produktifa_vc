import React, { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { AuthView } from "./components/AuthView";
import { Navbar } from "./components/Navbar";
import { DashboardView } from "./components/DashboardView";
import { ProjectsView } from "./components/ProjectsView";
import { TasksView } from "./components/TasksView";
import { CalendarView } from "./components/CalendarView";
import { GamificationView } from "./components/GamificationView";
import { ChatView } from "./components/ChatView";
import { SplashScreen } from "./components/SplashScreen";

function MainApp() {
  const { user, loading } = useAuth();
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    try {
      return !sessionStorage.getItem("produktifa_splash_seen");
    } catch {
      return true;
    }
  });
  const [activeTab, setActiveTab] = useState<"dashboard" | "projects" | "tasks" | "calendar" | "gamification" | "chat">("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  if (showSplash) {
    return (
      <SplashScreen
        onComplete={() => {
          try {
            sessionStorage.setItem("produktifa_splash_seen", "true");
          } catch {}
          setShowSplash(false);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6f8]">
        <div className="text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#0d3b66] border-t-transparent" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Memuat workspace Produktifa...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  const handleNavigateToTasks = (projectId?: number) => {
    setSelectedProjectId(projectId ?? null);
    setActiveTab("tasks");
  };

  const handleNavigateToProjects = () => {
    setActiveTab("projects");
  };

  const handleNavigateToCalendar = () => {
    setActiveTab("calendar");
  };

  const handleNavigateToGamification = () => {
    setActiveTab("gamification");
  };

  const handleNavigateToChat = (projectId?: number) => {
    if (projectId) {
      setSelectedProjectId(projectId);
    }
    setActiveTab("chat");
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f4f6f8] flex flex-col justify-between">
      <div className="w-full">
        <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
          {activeTab === "dashboard" && (
            <DashboardView
              onNavigateToTasks={handleNavigateToTasks}
              onNavigateToProjects={handleNavigateToProjects}
              onNavigateToCalendar={handleNavigateToCalendar}
              onNavigateToGamification={handleNavigateToGamification}
            />
          )}

          {activeTab === "projects" && (
            <ProjectsView
              onNavigateToTasks={handleNavigateToTasks}
              onOpenProjectChat={handleNavigateToChat}
            />
          )}

          {activeTab === "tasks" && (
            <TasksView
              initialProjectId={selectedProjectId}
              onClearInitialProject={() => setSelectedProjectId(null)}
              onNavigateToProjects={handleNavigateToProjects}
              onNavigateToCalendar={handleNavigateToCalendar}
            />
          )}

          {activeTab === "calendar" && (
            <CalendarView
              onNavigateToTasks={handleNavigateToTasks}
              onNavigateToProjects={handleNavigateToProjects}
            />
          )}

          {activeTab === "gamification" && (
            <GamificationView
              onNavigateToTasks={handleNavigateToTasks}
              onNavigateToProjects={handleNavigateToProjects}
            />
          )}

          {activeTab === "chat" && (
            <ChatView
              initialProjectId={selectedProjectId}
              onNavigateToTasks={handleNavigateToTasks}
              onNavigateToProjects={handleNavigateToProjects}
            />
          )}
        </main>
      </div>


      {/* Production Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <p>© 2026 Produktifa. Seluruh hak cipta dilindungi.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Aplikasi Manajemen Tugas & Kolaborasi Tim</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ToastProvider>
  );
}
