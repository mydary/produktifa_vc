import React, { useState } from "react";
import {
  Mail,
  Lock,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

const LOGO_SRC = "/assets/aistudio/file_000000003f108207860b8aedad3cf931_53da58af.png";

type AuthMode = "login" | "register" | "forgot_password";

export const AuthView: React.FC = () => {
  const { login, register } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Forgot password & reset state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const isLoginOrReg = mode === "login" || mode === "register";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setSuccessMsg("");

    try {
      if (mode === "register") {
        if (!name.trim()) throw new Error("Nama lengkap wajib diisi");
        if (!email.trim()) throw new Error("Alamat email wajib diisi");
        if (password.length < 8) throw new Error("Kata sandi minimal 8 karakter");

        // Direct registration and auto-login
        await register(name.trim(), email.trim(), password);
        toast.success("Akun berhasil dibuat! Selamat datang di Produktifa.", "Pendaftaran Berhasil");
      } else if (mode === "login") {
        await login(email.trim(), password);
        toast.success("Selamat datang kembali di workspace Produktifa!", "Masuk Berhasil");
      } else if (mode === "forgot_password") {
        if (!email.trim()) throw new Error("Masukkan alamat email akun Anda");
        if (newPassword.length < 8) throw new Error("Kata sandi baru minimal 8 karakter");
        if (newPassword !== confirmPassword) throw new Error("Konfirmasi kata sandi baru tidak cocok");

        const res = await api<{ message: string }>("/auth/reset-password", {
          method: "POST",
          body: {
            email: email.trim(),
            new_password: newPassword,
          },
        });

        toast.success("Kata sandi berhasil diperbarui! Silakan masuk.", "Sandi Diperbarui");
        setSuccessMsg(res.message || "Kata sandi berhasil diperbarui! Silakan masuk.");
        setPassword(newPassword);
        setNewPassword("");
        setConfirmPassword("");
        setMode("login");
      }
    } catch (err) {
      const msg = (err as Error).message;
      setErr(msg);
      toast.error(msg, "Terjadi Kesalahan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Official Website Logo */}
        <div className="flex justify-center mb-3">
          <img
            src={LOGO_SRC}
            alt="Produktifa Logo"
            className="h-24 w-auto object-contain"
          />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-[#0d3b66]">
          PRODUKTIFA
        </h1>
        <p className="text-xs font-semibold tracking-wider uppercase text-slate-500 mt-0.5">
          Aplikasi Manajemen Tugas & Proyek
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="card border-slate-300 bg-white !p-6 sm:!p-8 shadow-sm">
          {/* Segmented Mode Switcher (only for login & register) */}
          {isLoginOrReg && (
            <div className="flex border border-slate-200 rounded-lg p-1 bg-slate-100 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setErr("");
                  setSuccessMsg("");
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  mode === "login"
                    ? "bg-white text-[#0d3b66] shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setErr("");
                  setSuccessMsg("");
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  mode === "register"
                    ? "bg-white text-[#0d3b66] shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Daftar Akun Baru
              </button>
            </div>
          )}

          {/* FORGOT PASSWORD HEADER */}
          {mode === "forgot_password" && (
            <div className="mb-5 space-y-1 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-[#0d3b66]">
                <KeyRound className="h-5 w-5 text-[#0284c7]" />
                <h2 className="text-base font-bold text-slate-900">
                  Atur Ulang Kata Sandi
                </h2>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Masukkan email akun Anda dan buat kata sandi baru untuk melanjutkan.
              </p>
            </div>
          )}

          {/* SUCCESS MESSAGE */}
          {successMsg && (
            <div className="mb-4 flex items-start gap-2 rounded-md bg-emerald-50 border border-emerald-300 p-3 text-xs text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ERROR MESSAGE */}
          {err && (
            <div className="mb-4 flex items-start gap-2 rounded-md bg-rose-50 border border-rose-300 p-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{err}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* REGISTER: FULL NAME */}
            {mode === "register" && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Lengkap
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    maxLength={80}
                    className="input pl-9"
                    placeholder="Masukkan nama lengkap Anda"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* EMAIL (FOR ALL MODES) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Alamat Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  className="input pl-9"
                  placeholder="nama@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* PASSWORD (LOGIN & REGISTER) */}
            {isLoginOrReg && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Kata Sandi
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot_password");
                        setErr("");
                        setSuccessMsg("");
                      }}
                      className="text-xs font-semibold text-[#0284c7] hover:text-[#0369a1] hover:underline cursor-pointer"
                    >
                      Lupa password?
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={mode === "register" ? 8 : 1}
                    className="input pl-9"
                    placeholder={
                      mode === "register"
                        ? "Minimal 8 karakter"
                        : "Masukkan kata sandi Anda"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {mode === "register" && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Gunakan minimal 8 karakter untuk keamanan akun Anda.
                  </p>
                )}

                {/* QUICK DEMO ACCOUNT CHIPS ON LOGIN */}
                {mode === "login" && (
                  <div className="pt-2.5">
                    <p className="text-[11px] font-semibold text-slate-500 mb-1.5">
                      Pilihan Cepat Akun Demo:
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEmail("ani@mail.com");
                          setPassword("rahasia123");
                        }}
                        className="btn-ghost py-1 px-1.5 text-[10px] font-bold border-slate-300 hover:border-[#0d3b66] hover:bg-slate-50 text-slate-700 truncate cursor-pointer"
                        title="Ani Lestari - Project Manager"
                      >
                        Ani (PM)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail("budi@mail.com");
                          setPassword("rahasia123");
                        }}
                        className="btn-ghost py-1 px-1.5 text-[10px] font-bold border-slate-300 hover:border-[#0d3b66] hover:bg-slate-50 text-slate-700 truncate cursor-pointer"
                        title="Budi Santoso - Developer"
                      >
                        Budi (Dev)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail("citra@mail.com");
                          setPassword("rahasia123");
                        }}
                        className="btn-ghost py-1 px-1.5 text-[10px] font-bold border-slate-300 hover:border-[#0d3b66] hover:bg-slate-50 text-slate-700 truncate cursor-pointer"
                        title="Citra Dewi - Designer"
                      >
                        Citra (UI)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* FORGOT PASSWORD RESET FIELDS */}
            {mode === "forgot_password" && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kata Sandi Baru
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      className="input pl-9"
                      placeholder="Minimal 8 karakter baru"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Konfirmasi Kata Sandi Baru
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      className="input pl-9"
                      placeholder="Ketik ulang kata sandi baru"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* ACTION SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={busy}
              className="btn w-full py-2.5 text-xs font-bold uppercase tracking-wider mt-2 flex items-center justify-center gap-2 cursor-pointer"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin text-white" />}
              <span>
                {busy
                  ? mode === "register"
                    ? "Mendaftarkan Akun..."
                    : mode === "forgot_password"
                    ? "Menyimpan Sandi Baru..."
                    : "Memproses..."
                  : mode === "login"
                  ? "Masuk"
                  : mode === "register"
                  ? "Daftar Akun Baru"
                  : "Simpan Kata Sandi Baru"}
              </span>
            </button>
          </form>

          {/* FOOTER SWITCH */}
          <div className="mt-6 pt-5 border-t border-slate-200 text-center">
            {isLoginOrReg ? (
              <p className="text-xs text-slate-500">
                {mode === "register"
                  ? "Sudah memiliki akun? "
                  : "Belum memiliki akun? "}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "register" ? "login" : "register");
                    setErr("");
                    setSuccessMsg("");
                  }}
                  className="font-bold text-[#0284c7] hover:text-[#0369a1] cursor-pointer"
                >
                  {mode === "register"
                    ? "Masuk ke akun Anda"
                    : "Daftar gratis di sini"}
                </button>
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setErr("");
                  setSuccessMsg("");
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#0d3b66] cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Kembali ke Halaman Masuk</span>
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © 2026 Produktifa. Seluruh hak cipta dilindungi.
        </p>
      </div>
    </div>
  );
};
