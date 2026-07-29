// app/api/competitive-intel/route.ts
//
// Competitive Intel Lite — qualitative competitor read without spending
// Brand24 keyword slots. Sources: Grok (X/Twitter), Perplexity (news/
// LinkedIn/YouTube), Gemini (Google web/YouTube), Meta AI (manual paste —
// see note below). Synthesized into directional signal by Claude.
//
// This is a SEPARATE, lighter path from the main 6-agent pipeline's
// Competitive step (which uses brand24_quick_popularity_comparison for
// projects you DO track in Brand24, e.g. EastWest itself). Use this route
// for competitors you're deliberately NOT giving a Brand24 project slot to.

import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const XAI_API_KEY = process.env.XAI_API_KEY!;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_429_RETRIES = 2;

interface CompetitorInput {
  name: string;
  // Manual paste from a meta.ai browser session. Meta's Muse Spark / Model
  // API is US-developer-only public preview as of July 2026 — not available
  // from the Philippines yet. Revisit once that opens up regionally.
  metaAINotes?: string;
}

interface SourcePull {
  source: string;
  themes: string;
}

async function readJsonResponse(res: Response): Promise<any> {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function sourceError(source: string, message: string): SourcePull {
  return {
    source,
    themes: `[${source} error: ${message}]`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pullGrok(competitor: string, dateRange: string): Promise<SourcePull> {
  const source = 'Grok (X/Twitter)';
  try {
    if (!XAI_API_KEY) return sourceError(source, 'XAI_API_KEY is not set');

    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4.3',
        input: `Search X/Twitter for mentions of "${competitor}" (Philippine bank) during ${dateRange}. Summarize: top 3 themes/topics people are discussing, overall sentiment tone (positive/neutral/negative lean), and any notable spikes or viral moments. Do not invent numbers — describe qualitatively only.`,
        tools: [{ type: 'x_search' }, { type: 'web_search' }],
      }),
    });
    const data = await readJsonResponse(res);
    console.log('competitive-intel Grok response', {
      competitor,
      status: res.status,
      ok: res.ok,
      outputBlocks: Array.isArray(data?.output) ? data.output.length : 0,
      error: data?.error,
    });
    if (!res.ok) {
      return sourceError(source, `HTTP ${res.status} ${res.statusText}: ${data?.error?.message || data?.error || data?.raw || 'unknown response'}`);
    }
    // output[0] is the reasoning block, output[1] is the text response —
    // same quirk noted in the main Signal Intel v3 handoff.
    const text = data?.output?.[1]?.content?.[0]?.text ?? '';
    if (!text.trim()) return sourceError(source, 'empty response text');
    return { source, themes: text };
  } catch (err: any) {
    console.error('competitive-intel Grok error', { competitor, error: err?.message });
    return sourceError(source, err?.message || 'unknown failure');
  }
}

async function pullPerplexity(competitor: string, dateRange: string): Promise<SourcePull> {
  // Key not provisioned yet (pending) — skip cleanly instead of breaking the
  // whole competitor lookup. Remove this guard once PERPLEXITY_API_KEY is live.
  if (!PERPLEXITY_API_KEY) {
    return {
      source: 'Perplexity (News/LinkedIn/YouTube)',
      themes: '[Perplexity not wired yet — key pending]',
    };
  }
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        {
          role: 'user',
          content: `What is being said about "${competitor}" (Philippine bank) in news coverage, LinkedIn posts, and YouTube content during ${dateRange}? Summarize top 3 themes and overall tone. Qualitative summary only — no fabricated statistics.`,
        },
      ],
    }),
  });
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  return { source: 'Perplexity (News/LinkedIn/YouTube)', themes: text };
}

async function pullGemini(competitor: string, dateRange: string): Promise<SourcePull> {
  const source = 'Gemini (Google web/YouTube)';
  try {
    if (!GEMINI_API_KEY) return sourceError(source, 'GEMINI_API_KEY is not set');

    const requestBody = JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Search the web and YouTube for "${competitor}" (Philippine bank) mentions during ${dateRange}. Summarize top 3 themes and overall sentiment tone. Qualitative only, no invented numbers.`,
            },
          ],
        },
      ],
      tools: [{ google_search: {} }],
    });

    for (let attempt = 0; attempt <= GEMINI_429_RETRIES; attempt += 1) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        }
      );
      const data = await readJsonResponse(res);
      console.log('competitive-intel Gemini response', {
        competitor,
        model: GEMINI_MODEL,
        attempt: attempt + 1,
        status: res.status,
        ok: res.ok,
        candidates: Array.isArray(data?.candidates) ? data.candidates.length : 0,
        error: data?.error,
      });

      if (res.status === 429 && attempt < GEMINI_429_RETRIES) {
        const waitMs = Math.round(1000 * 2 ** attempt + Math.random() * 500);
        console.warn('competitive-intel Gemini rate limited; retrying', {
          competitor,
          model: GEMINI_MODEL,
          attempt: attempt + 1,
          nextAttempt: attempt + 2,
          waitMs,
        });
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        return sourceError(source, `HTTP ${res.status} ${res.statusText}: ${data?.error?.message || data?.error || data?.raw || 'unknown response'}`);
      }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!text.trim()) return sourceError(source, 'empty response text');
      return { source, themes: text };
    }

    return sourceError(source, 'rate limited after retry attempts');
  } catch (err: any) {
    console.error('competitive-intel Gemini error', { competitor, error: err?.message });
    return sourceError(source, err?.message || 'unknown failure');
  }
}

function pullMetaAI(manualNotes?: string): SourcePull {
  return {
    source: 'Meta AI (FB/IG — manual pull, no PH API access yet)',
    themes: manualNotes?.trim() || '[No manual Meta AI pull provided for this competitor]',
  };
}

async function synthesizeWithClaude(competitor: string, pulls: SourcePull[]): Promise<string> {
  const sourceBlock = pulls.map((p) => `### ${p.source}\n${p.themes}`).join('\n\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `You are the Competitive Intel Lite agent in the Signal Intel pipeline. You're synthesizing qualitative, multi-platform signal about a competitor bank ("${competitor}") into a directional competitive read — NOT an audited share-of-voice report.

Raw pulls from four platform-native AI sources:

${sourceBlock}

Write a tight competitive intel summary (150-250 words) covering:
1. Relative buzz level (high/moderate/low, described qualitatively — never invent a number)
2. Top 2-3 recurring themes across sources
3. Sentiment tone lean
4. One notable signal or spike, if any source flagged one

End with one line making explicit: "This is directional signal from AI-native search, not audited Brand24-grade mention data." Never present anything here as a precise count, percentage, or reach figure.`,
        },
      ],
    }),
  });
  const data = await res.json();
  return data?.content?.find((b: any) => b.type === 'text')?.text ?? '';
}

export async function POST(req: NextRequest) {
  try {
    const { competitors, dateRange } = (await req.json()) as {
      competitors: CompetitorInput[];
      dateRange: string; // use [DATE] token convention — stay date-agnostic
    };

    const results = await Promise.all(
      competitors.map(async (c) => {
        const [grok, perplexity, gemini] = await Promise.all([
          pullGrok(c.name, dateRange),
          pullPerplexity(c.name, dateRange),
          pullGemini(c.name, dateRange),
        ]);
        const meta = pullMetaAI(c.metaAINotes);
        const pulls = [grok, perplexity, gemini, meta];
        const synthesis = await synthesizeWithClaude(c.name, pulls);
        return { competitor: c.name, sources: pulls, synthesis };
      })
    );

    return NextResponse.json({
      competitors: results,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('competitive-intel error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
