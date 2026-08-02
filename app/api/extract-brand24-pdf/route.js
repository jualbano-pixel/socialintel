import { PDFParse } from 'pdf-parse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function parseClaudeText(data) {
  return data?.content?.[0]?.text ?? data?.content?.find?.(b => b.type === 'text')?.text ?? null;
}

function parseJSON(text, fallback = {}) {
  if (!text) return fallback;
  const clean = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch {}
  }
  return fallback;
}

function numberFrom(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const text = String(value).trim().replace(/\s+/g, '');
  const match = text.match(/-?[\d,.]+/);
  if (!match) return null;
  return Math.round(Number(match[0].replace(/,/g, '')));
}

function pctFrom(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(1));
  const match = String(value).match(/-?[\d,.]+/);
  if (!match) return null;
  return Number(Number(match[0].replace(/,/g, '')).toFixed(1));
}

function normalizeExtracted(data) {
  const totalMentions = numberFrom(data.totalMentions);
  const positiveCount = numberFrom(data.positiveMentions?.count ?? data.positiveMentions);
  const neutralCount = numberFrom(data.neutralMentions?.count ?? data.neutralMentions);
  const negativeCount = numberFrom(data.negativeMentions?.count ?? data.negativeMentions);
  const sentimentTotal = [positiveCount, neutralCount, negativeCount].reduce((sum, n) => sum + (n || 0), 0);
  const denominator = sentimentTotal || totalMentions || 1;

  return {
    totalMentions,
    totalReach: numberFrom(data.totalReach),
    positiveMentions: {
      count: positiveCount,
      pct: pctFrom(data.positiveMentions?.pct) ?? (positiveCount === null ? null : Number(((positiveCount / denominator) * 100).toFixed(1))),
    },
    neutralMentions: {
      count: neutralCount,
      pct: pctFrom(data.neutralMentions?.pct) ?? (neutralCount === null ? null : Number(((neutralCount / denominator) * 100).toFixed(1))),
    },
    negativeMentions: {
      count: negativeCount,
      pct: pctFrom(data.negativeMentions?.pct) ?? (negativeCount === null ? null : Number(((negativeCount / denominator) * 100).toFixed(1))),
    },
    dateRange: String(data.dateRange || '').trim(),
    averagePresenceScore: String(data.averagePresenceScore || '').trim(),
    ave: String(data.ave || '').trim(),
    sourceCategories: Array.isArray(data.sourceCategories) ? data.sourceCategories : [],
    confidence: String(data.confidence || 'medium').toLowerCase(),
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return Response.json({ error: 'Upload a Brand24 PDF file.' }, { status: 400 });
    }
    if (file.type && file.type !== 'application/pdf') {
      return Response.json({ error: 'Only PDF uploads are supported.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    const extractedText = (parsed.text || '').replace(/\u0000/g, '').trim();
    if (!extractedText || extractedText.length < 80) {
      return Response.json({ error: 'Could not read enough text from this PDF. Please enter the Brand24 numbers manually.' }, { status: 422 });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 900,
        messages: [{
          role: 'user',
          content: `Extract Brand24 dashboard PDF metrics from the text below.

Return ONLY valid JSON in this exact shape:
{
  "totalMentions": 0,
  "totalReach": 0,
  "positiveMentions": {"count": 0, "pct": 0},
  "neutralMentions": {"count": 0, "pct": 0},
  "negativeMentions": {"count": 0, "pct": 0},
  "dateRange": "as printed",
  "averagePresenceScore": "as printed or empty",
  "ave": "as printed or empty",
  "sourceCategories": [{"name": "TikTok", "count": 0, "pct": 0}],
  "confidence": "high|medium|low",
  "warnings": ["short warning for any unclear or missing field"]
}

Use Brand24 labels such as Total mentions, Total reach, Positive mentions, Negative mentions, Average Presence Score, and AVE. If a value is missing or ambiguous, use null and add a warning. Do not invent numbers.

PDF TEXT:
${extractedText.slice(0, 45000)}`,
        }],
      }),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      return Response.json({ error: data.error?.message || data.error || `Claude extraction failed with ${response.status}` }, { status: 502 });
    }

    const raw = parseJSON(parseClaudeText(data), {});
    const extracted = normalizeExtracted(raw);
    const requiredMissing = [
      ['Total mentions', extracted.totalMentions],
      ['Total reach', extracted.totalReach],
      ['Positive mentions', extracted.positiveMentions.count],
      ['Negative mentions', extracted.negativeMentions.count],
    ].filter(([, value]) => value === null || Number.isNaN(value)).map(([label]) => label);
    if (requiredMissing.length) {
      extracted.confidence = 'low';
      extracted.warnings = [...extracted.warnings, `Missing required fields: ${requiredMissing.join(', ')}.`];
    }

    return Response.json({
      fileName: file.name || 'Brand24 export.pdf',
      uploadDate: new Date().toISOString(),
      extracted,
      textPreview: extractedText.slice(0, 1200),
    });
  } catch (e) {
    console.error('extract-brand24-pdf error:', e);
    return Response.json({ error: e.message || 'Failed to extract Brand24 PDF.' }, { status: 500 });
  }
}
