"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; citations?: Citation[] };
export type Citation = { source: string; page: number; score: number };

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
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 sm:p-6">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-neutral-400 text-sm">
              Ask something like:{" "}
              <em>“Are sprinklers required in closets in NFPA 13R?”</em>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "text-neutral-100" : "text-neutral-200"}
            >
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                {m.role}
              </div>
              <div className="prose prose-invert max-w-none whitespace-pre-wrap">
                {m.content}
              </div>
              {m.citations?.length ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-400">
                  {m.citations.map((c, idx) => (
                    <span
                      key={idx}
                      className="rounded-full bg-neutral-800 px-2 py-1"
                    >
                      {c.source} p.{c.page} · {c.score.toFixed(2)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          <div ref={endRef} />
        </div>
      </div>

      <form onSubmit={ask} className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Type your NFPA question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          disabled={loading}
          className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
