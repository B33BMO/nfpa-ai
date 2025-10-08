"use client";
import Chat from "@/components/Chat";

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 space-y-2">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          NFPA 13 (2022) & NFPA 13R RAG Chat
        </h1>
        <p className="text-sm text-neutral-400">
          Answers come strictly from the two source PDFs with page citations.
          No hallucinated nonsense.
        </p>
      </header>

      <Chat />

      <footer className="mt-10 text-xs text-neutral-500">
        Sources: NFPA 13 (2022) and PCI NFPA 13R (PDFs). This tool fragments the
        PDFs, embeds, retrieves, and constrains the model to the retrieved
        context.
      </footer>
    </main>
  );
}
