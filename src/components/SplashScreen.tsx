import React, { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

interface SplashScreenProps {
  onComplete: () => void;
}

const LOGO_SRC = "/assets/aistudio/file_000000003f108207860b8aedad3cf931_53da58af.png";

// Text segments for point C separated by commas and periods
const C_SEGMENTS = [
  "Kelola tugas,",
  "susun proyek,",
  "pantau progres,",
  "dan capai target dalam satu tempat.",
  "Produktifa membantumu bekerja lebih terorganisir",
  "dan fokus pada prioritas.",
];

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  // phase:
  // 'A' : Logo + Identitas ("Produktifa" & "Stop Nunda-nunda, Saatnya Produktif!")
  // 'transition_A_B' : Fading out text A while keeping logo
  // 'B' : Headline Utama ("Ubah Rencana Menjadi Pencapaian.")
  // 'C' : Sequential reveal of text C segments under headline B
  // 'DONE' : Everything revealed, show "Mulai Produktif" button
  const [phase, setPhase] = useState<"A" | "transition_A_B" | "B" | "C" | "DONE">("A");
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [revealedSegments, setRevealedSegments] = useState<number[]>([]);
  const [isExiting, setIsExiting] = useState(false);

  // Play animation sequence
  useEffect(() => {
    let isCancelled = false;

    // Timeline:
    // 0ms -> Phase A (Logo + Identitas)
    // 2400ms -> transition_A_B (fade text A out, maintain logo)
    // 2900ms -> Phase B (Headline Utama enters)
    // 3900ms -> Phase C begins (revealing segments one by one)

    const timerA = setTimeout(() => {
      if (isCancelled) return;
      setPhase("transition_A_B");
    }, 2400);

    const timerB = setTimeout(() => {
      if (isCancelled) return;
      setPhase("B");
    }, 2900);

    const timerCStart = setTimeout(() => {
      if (isCancelled) return;
      setPhase("C");
      setActiveSegmentIndex(0);
      setRevealedSegments([0]);
    }, 3900);

    return () => {
      isCancelled = true;
      clearTimeout(timerA);
      clearTimeout(timerB);
      clearTimeout(timerCStart);
    };
  }, []);

  // Handle sequential progression through C segments (separated by comma & period)
  useEffect(() => {
    if (phase !== "C") return;

    if (activeSegmentIndex >= 0 && activeSegmentIndex < C_SEGMENTS.length - 1) {
      const nextTimer = setTimeout(() => {
        const nextIdx = activeSegmentIndex + 1;
        setActiveSegmentIndex(nextIdx);
        setRevealedSegments((prev) => [...prev, nextIdx]);
      }, 700);

      return () => clearTimeout(nextTimer);
    } else if (activeSegmentIndex === C_SEGMENTS.length - 1) {
      // Reached the end of segments -> Transition to DONE to show "Mulai Produktif"
      const doneTimer = setTimeout(() => {
        setPhase("DONE");
      }, 600);

      return () => clearTimeout(doneTimer);
    }
  }, [phase, activeSegmentIndex]);

  const handleFinish = () => {
    setIsExiting(true);
    setTimeout(() => {
      onComplete();
    }, 400);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-center items-center overflow-hidden bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] px-4 py-8 sm:px-8 transition-opacity duration-500 ${
        isExiting ? "opacity-0 scale-98 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Main Center Stage */}
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center text-center">
        {/* LOGO CONTAINER: PERMANENTLY MAINTAINED ACROSS ALL PHASES */}
        <div className="relative mb-6 flex flex-col items-center justify-center">
          <div className="absolute h-36 w-36 rounded-full bg-sky-200/40 blur-xl pointer-events-none" />
          <img
            src={LOGO_SRC}
            alt="Logo Produktifa"
            className="relative z-10 h-28 w-auto object-contain transition-all duration-700 sm:h-32 drop-shadow-xs"
          />
        </div>

        {/* DYNAMIC CONTENT AREA */}
        <div className="relative min-h-[220px] sm:min-h-[190px] w-full flex flex-col items-center justify-center px-2">
          {/* FASE A: NAMA APLIKASI & TAGLINE */}
          {(phase === "A" || phase === "transition_A_B") && (
            <div
              className={`space-y-3 transition-all duration-500 transform ${
                phase === "transition_A_B"
                  ? "opacity-0 -translate-y-4 scale-95"
                  : "opacity-100 translate-y-0 scale-100"
              }`}
            >
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-[#0d3b66]">
                Produktifa
              </h1>
              <div className="inline-block rounded-md border border-amber-300/80 bg-amber-50/90 px-3.5 py-1.5 shadow-2xs">
                <p className="text-xs sm:text-sm font-bold text-amber-900 tracking-wide">
                  Stop Nunda-nunda, Saatnya Produktif!
                </p>
              </div>
            </div>
          )}

          {/* FASE B & C & DONE: HEADLINE UTAMA + DESKRIPSI SINGKAT */}
          {(phase === "B" || phase === "C" || phase === "DONE") && (
            <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
              {/* POIN B: HEADLINE UTAMA */}
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-[#0d3b66] leading-snug">
                Ubah Rencana Menjadi Pencapaian.
              </h2>

              {/* POIN C: DESKRIPSI BERGANTIAN TIAP KOMA & TITIK */}
              <div className="min-h-[80px] max-w-xl mx-auto flex flex-col items-center justify-center">
                <p className="text-xs sm:text-sm md:text-base text-slate-700 leading-relaxed font-normal">
                  {C_SEGMENTS.map((seg, idx) => {
                    const isRevealed = revealedSegments.includes(idx);
                    const isCurrent = activeSegmentIndex === idx && phase === "C";

                    return (
                      <span
                        key={idx}
                        className={`inline-block mr-1.5 transition-all duration-300 ${
                          !isRevealed
                            ? "opacity-0 translate-y-1 invisible"
                            : isCurrent
                            ? "opacity-100 translate-y-0 text-[#0d3b66] font-bold bg-sky-100/80 px-1 rounded-xs"
                            : "opacity-100 translate-y-0 text-slate-700 font-medium"
                        }`}
                      >
                        {seg}
                      </span>
                    );
                  })}
                </p>
              </div>

              {/* TOMBOL "MULAI PRODUKTIF": MUNCUL SETELAH SEMUA TEKS SELESAI */}
              {phase === "DONE" && (
                <div className="pt-3 animate-in zoom-in-95 fade-in duration-500 flex items-center justify-center">
                  <button
                    onClick={handleFinish}
                    autoFocus
                    className="btn-accent group flex items-center justify-center gap-2 py-3 px-8 text-sm font-bold shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer"
                  >
                    <span>Mulai Produktif</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
