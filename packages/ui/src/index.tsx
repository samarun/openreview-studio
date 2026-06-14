import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2 ${className}`}
      {...props}
    />
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warning" }) {
  const tones = {
    default: "border-white/10 bg-white/10 text-slate-200",
    success: "border-emerald-300/30 bg-emerald-500/10 text-emerald-200",
    warning: "border-amber-300/30 bg-amber-500/10 text-amber-200"
  };

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#10121c] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
          <button className="rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/10" onClick={onClose} type="button">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
