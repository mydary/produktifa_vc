import React, { useEffect } from "react";
import { BookOpen, CheckCircle2, HelpCircle, Lightbulb, X } from "lucide-react";

export interface GuideStep {
  title: string;
  desc: string;
}

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  steps: GuideStep[];
  tips?: string[];
}

export const GuideModal: React.FC<GuideModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  steps,
  tips,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div
        className="w-full max-w-lg card border-slate-300 bg-white p-5 sm:p-6 shadow-md space-y-4 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-[#0d3b66] text-white flex items-center justify-center shrink-0">
              <HelpCircle className="h-4 w-4" />
            </div>
            <div>
              <h3 id="guide-title" className="font-black text-slate-900 text-base leading-tight">
                {title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            aria-label="Tutup panduan"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Steps List */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-[#0284c7]" />
            Petunjuk Langkah demi Langkah
          </h4>
          <div className="space-y-2.5">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-slate-700"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs bg-[#0d3b66] text-white font-mono font-bold text-[11px]">
                  {idx + 1}
                </span>
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900">{step.title}</div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tips section if available */}
        {tips && tips.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-1.5 text-xs">
            <h5 className="font-bold text-amber-900 flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
              <Lightbulb className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              Tips Penggunaan
            </h5>
            <ul className="space-y-1 text-slate-700 text-[11px] pl-5 list-disc">
              {tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="btn text-xs py-1.5 px-4 font-semibold"
          >
            Mengerti & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
