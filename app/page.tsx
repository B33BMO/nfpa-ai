"use client";
import Chat from "@/components/Chat";

export default function Page() {
  return (
    <main className="relative mx-auto max-w-5xl px-4 py-10">
      {/* Background layers */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        {/* deep space gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_-10%,rgba(56,189,248,0.08),transparent_60%),radial-gradient(900px_600px_at_10%_110%,rgba(99,102,241,0.08),transparent_60%),#07090f]" />
        {/* starfield */}
        <div className="starfield absolute inset-0 opacity-70" />
        {/* subtle grid */}
        <div className="hud-grid absolute inset-0 opacity-[0.12]" />
        {/* scanlines/vignette */}
        <div className="scanlines absolute inset-0 mix-blend-overlay opacity-30" />
        <div className="vignette absolute inset-0" />
      </div>

      <header className="mb-8 space-y-2">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-[0.12em] uppercase text-white/95 drop-shadow-[0_0_20px_rgba(99,102,241,0.25)]">
          NFPA 13 (2022) &amp; 13R // Compliance Console
        </h1>
        <p className="text-[13px] text-white/60 tracking-wide">
          Answers are restricted to the two source PDFs with page citations.
          No lore, no hallucinations—just rules.
        </p>
      </header>

      <Chat />

      <footer className="mt-10 text-[11px] text-white/40 tracking-wider">
        Sources: NFPA 13 (2022) and PCI NFPA 13R. The console embeds and retrieves from
        these documents and constrains responses to that context.
      </footer>
    </main>
  );
}
