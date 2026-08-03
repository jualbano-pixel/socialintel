import pdf from 'pdf-parse/lib/pdf-parse.js';
import PDFParser from 'pdf2json';

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
  const text = String(value).trim();
  const match = text.match(/-?[\d,.]+/);
  if (!match) return null;
  return Math.round(Number(match[0].replace(/,/g, '')));
}

function pctFrom(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(1));
  const text = String(value);
  const pctMatch = text.match(/(-?[\d,.]+)\s*%/);
  const match = pctMatch || text.match(/-?[\d,.]+/);
  if (!match) return null;
  return Number(Number((pctMatch ? pctMatch[1] : match[0]).replace(/,/g, '')).toFixed(1));
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
    topMentions: Array.isArray(data.topMentions) ? data.topMentions : [],
    sourceNarrative: String(data.sourceNarrative || '').trim(),
    confidence: String(data.confidence || 'medium').toLowerCase(),
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

function valueNearLabel(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stopLabels = [
    'Date range',
    'Overview',
    'Total mentions',
    'Total reach',
    'Positive mentions',
    'Neutral mentions',
    'Negative mentions',
    'Average Presence Score',
    'AVE',
    'Source categories',
    'TikTok',
    'News',
    'Videos',
    'X \\(Twitter\\)',
  ].filter(stop => stop !== label).join('|');
  const match = text.match(new RegExp(`${escaped}\\s*:?\\s+([\\s\\S]*?)(?=\\s+(?:${stopLabels})\\s*:?\\s+|$)`, 'i'));
  return match ? match[1].trim() : '';
}

function numberNearLabel(text, label) {
  return numberFrom(valueNearLabel(text, label));
}

function pctNearLabel(text, label) {
  const pctMatch = valueNearLabel(text, label).match(/(-?[\d,.]+)\s*%/);
  return pctMatch ? pctFrom(pctMatch[1]) : null;
}

function textNearLabel(text, label) {
  return valueNearLabel(text, label);
}

function fallbackExtractFromText(text) {
  const positiveCount = numberNearLabel(text, 'Positive mentions');
  const neutralCount = numberNearLabel(text, 'Neutral mentions');
  const negativeCount = numberNearLabel(text, 'Negative mentions');
  return normalizeExtracted({
    totalMentions: numberNearLabel(text, 'Total mentions'),
    totalReach: numberNearLabel(text, 'Total reach'),
    positiveMentions: { count: positiveCount, pct: pctNearLabel(text, 'Positive mentions') },
    neutralMentions: { count: neutralCount, pct: pctNearLabel(text, 'Neutral mentions') },
    negativeMentions: { count: negativeCount, pct: pctNearLabel(text, 'Negative mentions') },
    dateRange: textNearLabel(text, 'Date range'),
    averagePresenceScore: textNearLabel(text, 'Average Presence Score'),
    ave: textNearLabel(text, 'AVE'),
    sourceCategories: fallbackSourceCategories(text),
    topMentions: fallbackTopMentions(text),
    sourceNarrative: '',
    confidence: 'low',
    warnings: ['Claude extraction was unavailable; fields were prefilled from Brand24 text labels. Confirm every value before running.'],
  });
}

function fallbackSourceCategories(text) {
  const known = ['TikTok', 'News', 'Videos', 'X (Twitter)', 'Facebook', 'Instagram', 'YouTube', 'Blogs', 'Web', 'Podcasts'];
  return known.map(name => {
    const value = valueNearLabel(text, name);
    if (!value) return null;
    return { name, count: numberFrom(value), pct: pctFrom(value) };
  }).filter(Boolean);
}

function fallbackTopMentions(text) {
  const topSection = text.match(/Top mentions?\s+([\s\S]{0,5000})/i)?.[1] || '';
  if (!topSection) return [];
  return topSection
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 12)
    .slice(0, 6)
    .map((line, i) => ({
      source: line.match(/\b(tiktok|instagram|facebook|x\.com|twitter|youtube|news|web)\b/i)?.[0] || 'Brand24 PDF',
      title: line.slice(0, 90),
      meta: '',
      sentiment: line.match(/\bpositive\b/i) ? 'Positive' : line.match(/\bnegative\b/i) ? 'Negative' : 'Neutral',
      text: line,
      icon: `M${i + 1}`,
      color: '#2f86de',
    }));
}

function parseWithPdf2Json(buffer) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on('pdfParser_dataError', err => reject(err.parserError || err));
    parser.on('pdfParser_dataReady', data => {
      const text = data?.Pages?.map(page => (
        page.Texts?.map(item => (
          item.R?.map(run => {
            try { return decodeURIComponent(run.T || ''); } catch { return run.T || ''; }
          }).join('')
        )).join(' ') || ''
      )).join('\n') || '';
      resolve({ text, numpages: data?.Pages?.length || 0 });
    });
    parser.parseBuffer(buffer);
  });
}

async function extractPdfText(buffer, diagnostics) {
  try {
    const parsed = await pdf(buffer);
    const text = (parsed.text || '').replace(/\u0000/g, '').trim();
    diagnostics.push(`parser=pdf-parse chars=${text.length} pages=${parsed.numpages ?? 'unknown'}`);
    if (text.length >= 80) return { text, pages: parsed.numpages ?? null, parser: 'pdf-parse' };
  } catch (e) {
    diagnostics.push(`pdf-parse error=${e.message || e}`);
    console.error('[Brand24 PDF extract] pdf-parse failed', e);
  }

  const parsed = await parseWithPdf2Json(buffer);
  const text = (parsed.text || '').replace(/\u0000/g, '').trim();
  diagnostics.push(`parser=pdf2json chars=${text.length} pages=${parsed.numpages ?? 'unknown'}`);
  return { text, pages: parsed.numpages ?? null, parser: 'pdf2json' };
}

export async function POST(request) {
  const diagnostics = [];
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return Response.json({ error: 'Upload a Brand24 PDF file.' }, { status: 400 });
    }
    if (file.type && file.type !== 'application/pdf') {
      return Response.json({ error: 'Only PDF uploads are supported.' }, { status: 400 });
    }

    diagnostics.push(`file=${file.name || 'unnamed'} type=${file.type || 'unknown'} size=${file.size || 0}`);
    console.log('[Brand24 PDF extract] upload received', { name: file.name, type: file.type, size: file.size });
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await extractPdfText(buffer, diagnostics);
    const extractedText = parsed.text;
    const labelHits = ['Total mentions', 'Total reach', 'Positive mentions', 'Negative mentions', 'Average Presence Score', 'AVE']
      .filter(label => extractedText.toLowerCase().includes(label.toLowerCase()));
    diagnostics.push(`pdfTextChars=${extractedText.length}`);
    diagnostics.push(`selectedParser=${parsed.parser}`);
    diagnostics.push(`brand24LabelsFound=${labelHits.length ? labelHits.join(', ') : 'none'}`);
    console.log('[Brand24 PDF extract] text extracted', {
      chars: extractedText.length,
      pages: parsed.pages,
      parser: parsed.parser,
      labelHits,
      preview: extractedText.slice(0, 500),
    });
    if (!extractedText || extractedText.length < 80) {
      return Response.json({
        error: `Could not read enough text from this PDF (${extractedText.length} characters). Please enter the Brand24 numbers manually.`,
        diagnostics,
      }, { status: 422 });
    }

    console.log('[Brand24 PDF extract] calling Claude extraction');
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
  "topMentions": [{"source":"tiktok.com","title":"author or headline","meta":"engagement/date as printed","sentiment":"Positive|Neutral|Negative","text":"short mention excerpt or description"}],
  "sourceNarrative": "one non-technical sentence describing the dominant source mix from the PDF",
  "confidence": "high|medium|low",
  "warnings": ["short warning for any unclear or missing field"]
}

Use Brand24 labels such as Total mentions, Total reach, Positive mentions, Negative mentions, Average Presence Score, and AVE. If a value is missing or ambiguous, use null and add a warning. Do not invent numbers.
Extract Top Mentions only from the uploaded PDF text. Do not reuse examples from another brand.

PDF TEXT:
${extractedText.slice(0, 45000)}`,
        }],
      }),
    });
    const data = await response.json();
    diagnostics.push(`claudeStatus=${response.status}`);
    console.log('[Brand24 PDF extract] Claude response', {
      ok: response.ok,
      status: response.status,
      error: data.error?.message || data.error || null,
      textChars: parseClaudeText(data)?.length || 0,
      textPreview: parseClaudeText(data)?.slice(0, 500) || '',
    });
    if (!response.ok || data.error) {
      const fallback = fallbackExtractFromText(extractedText);
      diagnostics.push('fallback=label-parser-after-claude-error');
      fallback.warnings = [
        `Claude extraction failed: ${data.error?.message || data.error || response.status}.`,
        ...fallback.warnings,
      ];
      return Response.json({
        fileName: file.name || 'Brand24 export.pdf',
        uploadDate: new Date().toISOString(),
        extracted: fallback,
        diagnostics,
        textPreview: extractedText.slice(0, 1200),
      });
    }

    const claudeText = parseClaudeText(data);
    diagnostics.push(`claudeTextChars=${claudeText?.length || 0}`);
    const raw = parseJSON(claudeText, {});
    diagnostics.push(`jsonKeys=${Object.keys(raw).join(', ') || 'none'}`);
    console.log('[Brand24 PDF extract] parsed JSON keys', Object.keys(raw));
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
    console.log('[Brand24 PDF extract] normalized fields', {
      totalMentions: extracted.totalMentions,
      totalReach: extracted.totalReach,
      positive: extracted.positiveMentions,
      neutral: extracted.neutralMentions,
      negative: extracted.negativeMentions,
      dateRange: extracted.dateRange,
      confidence: extracted.confidence,
      warnings: extracted.warnings,
    });

    return Response.json({
      fileName: file.name || 'Brand24 export.pdf',
      uploadDate: new Date().toISOString(),
      extracted,
      diagnostics,
      textPreview: extractedText.slice(0, 1200),
    });
  } catch (e) {
    console.error('extract-brand24-pdf error:', e);
    return Response.json({ error: e.message || 'Failed to extract Brand24 PDF.', diagnostics }, { status: 500 });
  }
}
