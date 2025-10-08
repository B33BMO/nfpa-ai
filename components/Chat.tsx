"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; citations?: Citation[] };
export type Citation = { source: string; page: number; score: number };

function GhostSpinner() {
  return (
    <div className="flex items-center gap-3 text-cyan-300/80">
      <svg
        className="h-5 w-5 animate-spin-slow"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="12" cy="12" r="9" className="opacity-20" strokeWidth="1.2" />
        <path d="M12 3v3M21 12h-3M12 21v-3M6 12H3" strokeWidth="1.2" />
        <path d="M8.5 8.5l-2-2M15.5 8.5l2-2M8.5 15.5l-2 2M15.5 15.5l2 2" strokeWidth="1.2" />
      </svg>
      <span className="text-[12px] tracking-wider">Thinking...</span>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    const q = input.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, citations: data.citations },
      ]);
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="hud-card relative rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 backdrop-blur-md shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_40px_120px_rgba(2,6,23,0.6)]">
        {/* chrome corners */}
        <div className="hud-corners pointer-events-none absolute inset-0" aria-hidden />
        <div className="space-y-5">
          {messages.length === 0 && (
            <div className="text-white/60 text-[13px] tracking-wide">
              Try: <em>“Trapeze size for 6&quot; main, span 8 ft”</em> or{" "}
              <em>“Are sprinklers required in 13R closets?”</em>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "msg-row border-l-2 border-cyan-400/50 pl-3"
                  : "msg-row border-l-2 border-indigo-400/50 pl-3"
              }
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">
                {m.role}
              </div>
              <div className="prose prose-invert max-w-none whitespace-pre-wrap text-[15px] leading-relaxed">
                {m.content}
              </div>
              {m.citations?.length ? (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  {m.citations.map((c, idx) => (
                    <span
                      key={idx}
                      className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-cyan-200/90"
                    >
                      {c.source} p.{c.page} • {c.score.toFixed(2)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {loading && <GhostSpinner />}

          <div ref={endRef} />
        </div>
      </div>

      <form onSubmit={ask} className="flex gap-2">
        <div className="relative flex-1">
          <input
            className="hud-input w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 outline-none placeholder:text-white/35 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/30"
            placeholder="Query // type your command…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tracking-widest text-cyan-200/80">
            ⏎ SEND
          </div>
        </div>
        <button
          disabled={loading}
          className="rounded-xl bg-gradient-to-br from-cyan-400/90 to-indigo-500/90 px-4 py-3 text-sm font-medium tracking-wide text-black shadow-[0_10px_30px_rgba(56,189,248,0.25)] hover:brightness-110 disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>
    </div>
  );
}
