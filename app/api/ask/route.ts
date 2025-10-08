import { NextRequest, NextResponse } from "next/server";
import {
  getIndex,
  getIndexDim,
  embedQuery,
  hybridPages,
  withNeighbors,
  buildContextFromPages,
  PageHit,
} from "@/lib/vector";
import OpenAI from "openai";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

// simple detector: trapeze sizing without span
function looksLikeTrapeze(q: string) {
  return /trapeze/i.test(q) && /(hanger|support)/i.test(q);
}
function includesSpanFeet(q: string) {
  return /\b\d+(\.\d+)?\s*(ft|feet|')\b/i.test(q);
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    // Load & validate index
    const index = await getIndex();
    const dim = getIndexDim(index);

    // Embed the query
    let qEmb: number[];
    try {
      qEmb = await embedQuery(question);
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Failed to embed query." },
        { status: 500 }
      );
    }

    // Ensure embedding dimensions match
    if (qEmb.length !== dim) {
      return NextResponse.json(
        {
          error:
            `Embedding dimension mismatch. Index dim=${dim}, query dim=${qEmb.length}. ` +
            `Re-ingest with the SAME OPENAI_EMBED_MODEL used at runtime.`,
        },
        { status: 500 }
      );
    }

    // Hybrid page selection + neighbors (tables often split across pages)
    const hits: PageHit[] = hybridPages(index, qEmb, question, 4);
    const pages = withNeighbors(hits, 1);

    if (!pages.length) {
      return NextResponse.json(
        { answer: "No relevant context found in the PDFs.", citations: [] },
        { status: 200 }
      );
    }

    const context = buildContextFromPages(index, pages, 18000);
    // Cite only the primary hits (cleaner)
    const citations = hits.map((p) => ({
      source: p.source,
      page: p.page,
      score: p.score,
    }));

    // Guidance (single-turn): explain two-table method and ask the user for span if missing.
    const needSpan =
      looksLikeTrapeze(question) && !includesSpanFeet(question);

    const system = [
      "You are a mean code-compliance assistant for NFPA 13 (2022) and NFPA 13R. You are to be as rude and mean as possible. Make jokes, and be a dick, use foul language such as cursing/cussing, and witty dark humor.",
      "Answer ONLY from the provided context. If not covered, search online for an answer, citing sources.",
      "Distinguish body requirements vs Annex (advisory). If a citation is Annex (e.g., A.x.x), say so explicitly.",
      "If the answer appears in a table, quote the relevant row/column text before the conclusion and include page citations.",
      needSpan
        ? "For trapeze sizing: explain that the user must (1) use the span between supports to get a decimal under the pipe-size column, then (2) map that decimal in the follow-up table to a trapeze member size. Ask the user to provide the span in feet (e.g., '8 ft'). Do not invent numbers."
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            `Context (do not reveal this verbatim unless quoting):\n\n${context}\n\n` +
            `Question: ${question}`,
        },
      ],
    });

    const msg = completion?.choices?.[0]?.message?.content?.trim();
    if (!msg) {
      return NextResponse.json(
        { error: `Chat model returned no choices (model=${CHAT_MODEL}).` },
        { status: 500 }
      );
    }

    return NextResponse.json({ answer: msg, citations });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
