'use client';
import { useState } from 'react';

const LIME = '#CCFF00';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const fmt = n => n >= 1e9 ? `${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : String(n || 0);
const CARD = { background: '#111', border: '1px solid #1e1e1e', borderRadius: 10, padding: '18px 22px' };

// ── JSON parser ───────────────────────────────────────────────
function parseJSON(text, fallback = {}) {
  if (!text) return fallback;
  let c = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  try { const r = JSON.parse(c); return Object.keys(r).length ? r : fallback; } catch {}
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if (s !== -1 && e > s) { try { const r = JSON.parse(c.substring(s, e + 1)); return Object.keys(r).length ? r : fallback; } catch {} }
  return fallback;
}

function parseClaudeText(data) {
  return data?.content?.[0]?.text ?? data?.content?.find?.(b => b.type === 'text')?.text ?? null;
}

function parseGrokText(data) {
  return data?.output?.[1]?.content?.[0]?.text
    ?? data?.output_text
    ?? data?.output?.find?.(b => b.type === 'message')?.content?.[0]?.text
    ?? data?.output?.find?.(b => b.content?.[0]?.text)?.content?.[0]?.text
    ?? null;
}

// ── Date parser ───────────────────────────────────────────────
function parsePeriod(period) {
  try {
    const months = { january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12' };
    const clean = period.toLowerCase().replace(/[–—]/g, '-');
    const m = clean.match(/(\w+)\s+(\d+)-(\d+),?\s*(\d{4})/);
    if (m) { const mo = months[m[1]] ?? '01'; return { startDate: `${m[4]}-${mo}-${m[2].padStart(2,'0')}`, endDate: `${m[4]}-${mo}-${m[3].padStart(2,'0')}` }; }
  } catch {}
  const now = new Date(), month = new Date(now - 30*24*60*60*1000);
  const f = d => d.toISOString().split('T')[0];
  return { startDate: f(month), endDate: f(now) };
}

// ── API helpers ───────────────────────────────────────────────
async function claude(prompt, maxTokens = 600, fallback = {}) {
  try {
    const r = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }) });
    return parseJSON(parseClaudeText(await r.json()) ?? '{}', fallback);
  } catch(e) { console.warn('Claude:', e.message); return fallback; }
}

async function claudeText(prompt, maxTokens = 700, label = 'Ask AI') {
  const payload = { model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
  console.log(`[${label}] /api/claude request`, payload);
  const r = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  console.log(`[${label}] /api/claude response`, data);
  if (!r.ok || data.error) throw new Error(data.error?.message || data.error || `Claude request failed with ${r.status}`);
  const text = parseClaudeText(data);
  if (!text) throw new Error('Claude response did not include data.content[0].text');
  return text;
}

async function claudeB24(prompt, maxTokens = 1500) {
  try {
    const r = await fetch('/api/claude-b24', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }) });
    const data = await r.json();
    return data.content?.filter(b => b.type === 'text').map(b => b.text).join('') ?? '';
  } catch(e) { console.warn('Claude+B24:', e.message); return ''; }
}

async function callGrok(brand, competitors, period) {
  try {
    const r = await fetch('/api/grok', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'grok-4.3',
        input: [
          { role: 'system', content: 'Social media intelligence analyst for Philippine agency. Be specific and factual.' },
          { role: 'user', content: `Search X/Twitter and Reddit for "${brand}" in Philippines during ${period}. Identify SPECIFICALLY: 1) What events/campaigns/announcements caused mention spikes? Name them. 2) What were people actually talking about — specific products, partnerships, incidents? 3) Specific complaints with examples? 4) Positive reactions? 5) Scam/fraud warnings? Competitor signals: ${competitors.slice(0,3).join(', ')}.` }
        ],
        tools: [{ type: 'x_search' }, { type: 'web_search' }]
      })
    });
    const d = await r.json();
    return parseGrokText(d);
  } catch(e) { console.warn('Grok:', e.message); return null; }
}

async function grokIntel(prompt, label = 'Grok Query') {
  const payload = {
    model: 'grok-4.3',
    input: [
      { role: 'system', content: 'Social media intelligence analyst. Return specific public posts, URLs when available, concise summaries, and clearly separate facts from inference.' },
      { role: 'user', content: prompt }
    ],
    tools: [{ type: 'x_search' }, { type: 'web_search' }]
  };
  console.log(`[${label}] /api/grok request`, payload);
  const r = await fetch('/api/grok', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const d = await r.json();
  console.log(`[${label}] /api/grok response`, d);
  if (!r.ok || d.error) throw new Error(d.error?.message || d.error || `Grok request failed with ${r.status}`);
  const text = parseGrokText(d);
  if (!text) throw new Error('Grok response did not include data.output[1].content[0].text');
  return text;
}

// ── MOCK fallback ─────────────────────────────────────────────
const getMockSov = (brand, comps) => [
  { brand, mentions: 0, percentage: 0, isClient: true, found: false },
  ...comps.map(c => ({ brand: c, mentions: 0, percentage: 0, isClient: false, found: false }))
];

// ══════════════════════════════════════════════════════════════
// 6-AGENT PIPELINE
// 1·Listener(B24) → 2·Tracker → 3·Context Scout(B24+Grok)
// → 4·Analyst → 5·Competitive(B24) → 6·Report Builder
// ══════════════════════════════════════════════════════════════

async function listenerAgent(brand, startDate, endDate) {
  const text = await claudeB24(
    `You have Brand24 social listening tools.
1. List all projects using brand24_get_projects
2. Find project matching "${brand}" (case-insensitive, partial match OK)
3. Get stats from ${startDate} to ${endDate} using brand24_project_stats with response_format="json"
4. Sum daily mentionsCount→totalMentions, reach→totalReach, positiveMentions, negativeMentions

Return ONLY valid JSON:
If found: {"found":true,"projectName":"...","projectId":123,"totalMentions":0,"totalReach":0,"positiveMentions":0,"negativeMentions":0,"neutralMentions":0,"dailyStats":[{"date":"2026-06-22","mentions":0,"reach":0}]}
If not found: {"found":false,"searchedFor":"${brand}","availableProjects":["p1","p2"]}`
  );
  return parseJSON(text, { found: false, searchedFor: brand, totalMentions: 0, totalReach: 0, positiveMentions: 0, negativeMentions: 0, neutralMentions: 0, dailyStats: [] });
}

function trackerAgent(d) {
  const tot = d.totalMentions || 0, reach = d.totalReach || 0;
  const pos = d.positiveMentions || 0, neg = d.negativeMentions || 0;
  const neu = d.neutralMentions || (tot - pos - neg > 0 ? tot - pos - neg : 0);
  const totS = pos + neg + neu || 1;
  const days = Math.max(d.dailyStats?.length || 1, 1);
  return {
    mentions: { total: tot, dailyAvg: Math.round(tot / days) },
    totalReach: reach,
    sentiment: {
      positive: { count: pos, pct: parseFloat((pos/totS*100).toFixed(1)) },
      negative: { count: neg, pct: parseFloat((neg/totS*100).toFixed(1)) },
      neutral: { count: neu, pct: parseFloat((neu/totS*100).toFixed(1)) },
    },
    dailyStats: d.dailyStats || [], found: d.found, projectName: d.projectName,
  };
}

async function contextScoutAgent(brand, competitors, period, startDate, endDate) {
  const [b24Result, grokResult] = await Promise.allSettled([
    claudeB24(
      `You have Brand24 social listening tools.
For project matching "${brand}", from ${startDate} to ${endDate}:
1. Use brand24_project_events to find anomalies/spikes
2. Use brand24_get_semantic_search_mentions with query="${brand}" for what people are saying (10 mentions)
3. Use brand24_topics_overview to get main themes
Return ONLY valid JSON:
{"found":true,"events":[{"date":"2026-06-25","description":"Garmin Pay launch drove 145 mentions","peakMentions":145}],"themes":["InstaPay fee waiver","Garmin Pay launch"],"qualitativeSignals":"2-3 sentence summary of conversations","topTopics":[{"name":"Philippine Banking Services","mentions":465,"sentiment":"neutral"}]}`
    ),
    callGrok(brand, competitors, period)
  ]);
  const b24 = parseJSON(b24Result.status === 'fulfilled' ? b24Result.value : '', { found: false, events: [], themes: [], qualitativeSignals: '', topTopics: [] });
  const grok = grokResult.status === 'fulfilled' ? grokResult.value : null;
  return { ...b24, grokSignals: grok };
}

async function analystAgent(brand, period, metrics, context) {
  const b24Block = context.found
    ? `BRAND24 EVENTS: ${context.events?.map(e => e.description).join('; ') || 'none'}
BRAND24 SEMANTIC: ${context.qualitativeSignals}
TOP TOPICS: ${context.topTopics?.map(t => `${t.name}(${t.mentions})`).join(', ') || 'none'}`
    : `No Brand24 project found. Use Philippine market knowledge for ${period}.`;
  const grokBlock = context.grokSignals
    ? `GROK (X/Twitter + Reddit): ${context.grokSignals.substring(0, 600)}`
    : 'No Grok signals.';

  return await claude(
    `Senior social media analyst, Philippine agency. Analyze ${brand} (${period}).
METRICS: Mentions ${metrics.mentions.total} | Reach ${fmt(metrics.totalReach)} | ${metrics.sentiment.positive.pct}% pos / ${metrics.sentiment.negative.pct}% neg / ${metrics.sentiment.neutral.pct}% neu
${b24Block}
${grokBlock}
Return valid JSON — name specific events from Brand24 and Grok:
{"executiveSummary":"3 sentences with specific numbers and named events","spikeDrivers":["specific named driver with evidence","second specific driver"],"sentimentNarrative":"2 sentences naming specific positive and negative drivers","channelInsight":"1 sentence with platform specifics"}`,
    700,
    {
      executiveSummary: `${brand} recorded ${metrics.mentions.total} mentions during ${period} with ${fmt(metrics.totalReach)} total reach.`,
      spikeDrivers: ['Partnership and product announcements drove conversation spikes', 'Regulatory and fee-related news generated significant organic amplification'],
      sentimentNarrative: `${metrics.sentiment.positive.pct}% positive sentiment driven by product launches and partnerships. ${metrics.sentiment.negative.pct}% negative concentrated on service delivery and registration issues.`,
      channelInsight: 'News and forums dominated conversation volume, with TikTok driving younger audience engagement.',
    }
  );
}

async function competitiveIntelAgent(brand, competitors, startDate, endDate, grokSignals) {
  const text = await claudeB24(
    `You have Brand24 social listening tools.
Get total mention counts from ${startDate} to ${endDate} for: ${[brand, ...competitors].join(', ')}
For each: find Brand24 project, get stats using brand24_project_stats response_format="json", sum mentionsCount.
Calculate SOV percentages. Brands without projects: found=false.
${grokSignals ? `Grok competitor signals: ${grokSignals.substring(0, 400)}` : ''}
Return ONLY valid JSON:
{"sovData":[{"brand":"${brand}","mentions":1216,"percentage":35.7,"isClient":true,"found":true},{"brand":"${competitors[0] || 'BPI'}","mentions":0,"percentage":0,"isClient":false,"found":false}],"competitorNotes":[{"brand":"${competitors[0] || 'BPI'}","observation":"specific observation from Brand24 data or Grok signals"}]}`
  );
  const data = parseJSON(text, { sovData: getMockSov(brand, competitors), competitorNotes: [] });
  if (!data.sovData?.length) data.sovData = getMockSov(brand, competitors);
  return data;
}

async function reportBuilderAgent(brand, analysis, competitive, context) {
  return await claude(
    `Final synthesizer for ${brand}.
SUMMARY: ${analysis.executiveSummary}
DRIVERS: ${analysis.spikeDrivers?.join(' | ')}
THEMES: ${context.themes?.join(', ')}
GROK SIGNALS: ${context.grokSignals?.substring(0, 400) || 'none'}
Return valid JSON:
{"positiveThemes":["specific theme with evidence","specific theme"],"negativeThemes":["specific theme with evidence","specific theme"],"scamRiskAlert":"1 sentence if fraud signals present, otherwise null","recommendations":["specific actionable rec tied to data","specific rec","specific rec"]}`,
    500,
    {
      positiveThemes: ['Partnership announcements driving positive brand associations', 'Product launches generating organic engagement across platforms'],
      negativeThemes: ['Service delivery issues generating complaint threads', 'Registration and onboarding friction surfacing in forums'],
      scamRiskAlert: null,
      recommendations: ['Activate community management for high-engagement complaint threads within 2 hours', 'Amplify partnership content on TikTok and news channels to extend positive SOV', 'Monitor competitor sentiment shifts for real-time positioning opportunities'],
    }
  );
}

// ── AGENT CONFIG ──────────────────────────────────────────────
const AGENTS = [
  { key: 'listener',    name: '1 · Listener',         role: 'Brand24 MCP → project stats' },
  { key: 'tracker',     name: '2 · Tracker',           role: 'Quantitative computation' },
  { key: 'context',     name: '3 · Context Scout',     role: 'Brand24 events + Grok X/Twitter' },
  { key: 'analyst',     name: '4 · Analyst',           role: 'Brand24 + Grok grounded' },
  { key: 'competitive', name: '5 · Competitive Intel', role: 'SOV across Brand24 projects' },
  { key: 'reporter',    name: '6 · Report Builder',    role: 'Final synthesis' },
];
const DETAILS = {
  listener:    'Pulling stats from Brand24 MCP...',
  tracker:     'Computing metrics...',
  context:     'Brand24 events + Grok X/Twitter signals...',
  analyst:     'Synthesizing Brand24 + Grok intelligence...',
  competitive: 'Brand24 SOV across all projects...',
  reporter:    'Assembling final report...',
};
const IDLE = { listener:'idle', tracker:'idle', context:'idle', analyst:'idle', competitive:'idle', reporter:'idle' };

// ── UI COMPONENTS ─────────────────────────────────────────────
function AgentPill({ agentKey, name, role, status }) {
  const col = { idle:'#2a2a2a', running:LIME, done:'#44ff88' };
  const ico = { idle:'○', running:'◉', done:'✓' };
  return (
    <div style={{ border:`1px solid ${status==='running'?LIME:status==='done'?'#1e3a1e':'#1a1a1a'}`, borderRadius:8, padding:'11px 14px', background:status==='running'?'#0d1100':status==='done'?'#0a140a':'#0d0d0d', transition:'all 0.3s', boxShadow:status==='running'?`0 0 12px ${LIME}18`:'none', marginBottom:7 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ color:col[status]??LIME, fontSize:14, fontFamily:'monospace', animation:status==='running'?'pulse 1.2s infinite':'none' }}>{ico[status]??'○'}</span>
        <div style={{ flex:1 }}>
          <div style={{ color:'#f0f0f0', fontSize:11, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase' }}>{name}</div>
          <div style={{ color:'#444', fontSize:10, marginTop:1 }}>{status==='running'?DETAILS[agentKey]:role}</div>
        </div>
        <span style={{ color:col[status]??LIME, fontSize:9 }}>{status.toUpperCase()}</span>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div style={CARD}>
      <div style={{ color:'#555', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:8 }}>{label}</div>
      <div style={{ color:'#f0f0f0', fontSize:26, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{value}</div>
      {sub && <div style={{ color:'#444', fontSize:11, marginTop:4 }}>{sub}</div>}
    </div>
  );
}

function SentBar({ label, count, pct, color, onClick }) {
  return (
    <button onClick={onClick} style={{ display:'block', width:'100%', background:'none', border:'none', padding:0, margin:'0 0 12px', cursor:onClick?'pointer':'default', textAlign:'left' }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ color:'#aaa', fontSize:12 }}>{label}</span>
        <span style={{ color:'#f0f0f0', fontSize:12, fontFamily:"'JetBrains Mono',monospace" }}>{count} · {pct}% ↗</span>
      </div>
      <div style={{ height:5, background:'#1a1a1a', borderRadius:3 }}>
        <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, background:color, borderRadius:3 }}/>
      </div>
    </button>
  );
}

function SOVRow({ brand, percentage, mentions, isClient, found }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
        <span style={{ color:isClient?LIME:'#aaa', fontSize:12, fontWeight:isClient?700:400 }}>
          {isClient?'▶ ':''}{brand}
          {!found && <span style={{ color:'#444', fontSize:10, marginLeft:6, fontFamily:"'JetBrains Mono',monospace" }}>no project</span>}
        </span>
        <span style={{ color:'#555', fontSize:11, fontFamily:"'JetBrains Mono',monospace" }}>{found?`${percentage}% · ${mentions||0}`:'—'}</span>
      </div>
      <div style={{ height:4, background:'#1a1a1a', borderRadius:2 }}>
        <div style={{ height:'100%', width:`${found?Math.min(percentage,100):0}%`, background:isClient?LIME:'#2a2a2a', borderRadius:2 }}/>
      </div>
    </div>
  );
}

function Drawer({ open, title, eyebrow, onClose, children }) {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:50, pointerEvents:'auto' }}>
      <button aria-label="Close drawer" onClick={onClose} style={{ position:'absolute', inset:0, background:'#0008', border:'none', cursor:'pointer' }}/>
      <aside style={{ position:'absolute', top:0, right:0, width:'min(100vw, 430px)', height:'100%', background:'#0b0b0b', borderLeft:'1px solid #242424', boxShadow:'-16px 0 40px #0008', padding:20, overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:18 }}>
          <div>
            {eyebrow && <div style={{ color:LIME, fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', fontFamily:"'JetBrains Mono',monospace", marginBottom:5 }}>{eyebrow}</div>}
            <h2 style={{ color:'#f0f0f0', fontSize:22, margin:0 }}>{title}</h2>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:6, border:'1px solid #252525', background:'#111', color:'#777', cursor:'pointer', fontSize:18 }}>×</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function TextBlock({ text }) {
  return (
    <div style={{ color:'#c9c9c9', fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap' }}>
      {text || 'No response yet.'}
    </div>
  );
}

function ErrorMessage({ message }) {
  if (!message) return null;
  return (
    <div style={{ background:'#1a0000', border:'1px solid #ff444433', borderRadius:6, color:'#ff8a8a', fontSize:12, lineHeight:1.55, padding:'10px 12px', marginTop:12 }}>
      {message}
    </div>
  );
}

function IntelligenceQuery({ query, setQuery, loading, result, error, open, setOpen, onSubmit }) {
  return (
    <div style={{ ...CARD, marginBottom:14, borderColor:'#1DA1F244' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:12 }}>
        <div>
          <div style={{ color:'#1DA1F2', fontSize:10, letterSpacing:'0.16em', textTransform:'uppercase', fontFamily:"'JetBrains Mono',monospace", marginBottom:4 }}>Intelligence Query — Grok Live Search</div>
          <div style={{ color:'#aaa', fontSize:12 }}>Ask about a topic, complaint, campaign, or audience question.</div>
        </div>
        {result && <button onClick={() => setOpen(!open)} style={{ background:'#111', border:'1px solid #252525', borderRadius:6, color:'#777', padding:'8px 10px', cursor:'pointer', fontSize:11 }}>{open?'Collapse':'Expand'}</button>}
      </div>
      <form onSubmit={onSubmit} style={{ display:'flex', gap:8 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="What are people saying about card delivery?" style={{ flex:1, minWidth:0, background:'#0b0b0b', border:'1px solid #252525', borderRadius:6, color:'#f0f0f0', padding:'11px 12px', fontSize:13 }}/>
        <button disabled={loading || !query.trim()} style={{ background:loading?'#222':'#1DA1F2', color:'#fff', border:'none', borderRadius:6, padding:'0 15px', cursor:loading?'default':'pointer', fontSize:12, fontWeight:700 }}>{loading?'Searching...':'Search'}</button>
      </form>
      <ErrorMessage message={error}/>
      {result && open && (
        <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid #202020' }}>
          <TextBlock text={result}/>
        </div>
      )}
    </div>
  );
}

function FloatingAskAI({ onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ position:'fixed', right:22, bottom:22, zIndex:1000, background:LIME, color:'#000', border:'1px solid #000', borderRadius:999, padding:'14px 18px', fontWeight:800, fontSize:13, boxShadow:`0 10px 30px ${LIME}33`, cursor:'pointer' }}>
      Ask AI
    </button>
  );
}

function composeReportContext({ brand, period, metrics, context, analysis, competitive, report }) {
  return `
Brand: ${brand}
Period: ${period}
Mentions: ${metrics?.mentions?.total ?? 0}
Daily average: ${metrics?.mentions?.dailyAvg ?? 0}
Reach: ${fmt(metrics?.totalReach ?? 0)}
Sentiment: ${metrics?.sentiment?.positive?.pct ?? 0}% positive, ${metrics?.sentiment?.neutral?.pct ?? 0}% neutral, ${metrics?.sentiment?.negative?.pct ?? 0}% negative
Executive summary: ${analysis?.executiveSummary || 'n/a'}
Spike drivers: ${analysis?.spikeDrivers?.join(' | ') || 'n/a'}
Sentiment narrative: ${analysis?.sentimentNarrative || 'n/a'}
Brand24 events: ${context?.events?.map(e => `${e.date}: ${e.description}`).join(' | ') || 'n/a'}
Grok signals: ${context?.grokSignals?.substring(0, 1200) || 'n/a'}
Share of voice: ${competitive?.sovData?.map(s => `${s.brand}: ${s.found ? `${s.percentage}% (${s.mentions})` : 'no project'}`).join(' | ') || 'n/a'}
Recommendations: ${report?.recommendations?.join(' | ') || 'n/a'}
`;
}

// ── MAIN APP ──────────────────────────────────────────────────
export default function SignalIntel() {
  const [step, setStep] = useState('setup');
  const [brand, setBrand] = useState('EastWest Bank');
  const [competitors, setComp] = useState(['BPI','BDO','UnionBank','Metrobank','Security Bank']);
  const [newC, setNewC] = useState('');
  const [period, setPeriod] = useState('June 22–July 22, 2026');
  const [agents, setAgents] = useState(IDLE);
  const [out, setOut] = useState({});
  const [error, setError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiMessages, setAiMessages] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [sentimentOpen, setSentimentOpen] = useState(false);
  const [sentimentLabel, setSentimentLabel] = useState('');
  const [sentimentResult, setSentimentResult] = useState('');
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [sentimentError, setSentimentError] = useState('');
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState('');
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState('');

  const sa = (k, v) => setAgents(p => ({ ...p, [k]: v }));
  const so = (k, v) => setOut(p => ({ ...p, [k]: v }));
  const addC = () => { if (newC.trim() && competitors.length < 7) { setComp(p => [...p, newC.trim()]); setNewC(''); } };
  const done = Object.values(agents).filter(v => v === 'done').length;

  const run = async () => {
    setStep('running'); setError(''); setAgents(IDLE); setOut({});
    try {
      const { startDate, endDate } = parsePeriod(period);

      sa('listener', 'running');
      const listenerData = await listenerAgent(brand, startDate, endDate);
      so('listenerData', listenerData); sa('listener', 'done');

      sa('tracker', 'running');
      await new Promise(r => setTimeout(r, 400));
      const metrics = trackerAgent(listenerData);
      so('metrics', metrics); sa('tracker', 'done');

      sa('context', 'running');
      const context = await contextScoutAgent(brand, competitors, period, startDate, endDate);
      so('context', context); sa('context', 'done');

      sa('analyst', 'running');
      const analysis = await analystAgent(brand, period, metrics, context);
      so('analysis', analysis); sa('analyst', 'done');

      sa('competitive', 'running');
      const competitive = await competitiveIntelAgent(brand, competitors, startDate, endDate, context.grokSignals);
      so('competitive', competitive); sa('competitive', 'done');

      sa('reporter', 'running');
      const report = await reportBuilderAgent(brand, analysis, competitive, context);
      so('report', report); sa('reporter', 'done');

      setTimeout(() => setStep('report'), 400);
    } catch(e) { setError('Pipeline error: ' + e.message); setStep('setup'); }
  };

  const { metrics, context, analysis, competitive, report } = out;
  const hasB24 = !!metrics?.found;
  const hasGrok = !!context?.grokSignals;
  const reportContext = composeReportContext({ brand, period, metrics, context, analysis, competitive, report });

  const askAI = async e => {
    e.preventDefault();
    if (!aiQuestion.trim() || aiLoading) return;
    const question = aiQuestion.trim();
    setAiMessages(p => [...p, { role:'user', text:question }]);
    setAiQuestion('');
    setAiError('');
    setAiLoading(true);
    try {
      const answer = await claudeText(
        `You are the Signal Intel report assistant. Use only the report context below unless you clearly label a recommendation as inference.

REPORT CONTEXT:
${reportContext}

USER QUESTION:
${question}

Answer concisely with specific numbers, drivers, and next actions when useful.`,
        700,
        'Ask AI'
      );
      setAiMessages(p => [...p, { role:'assistant', text:answer }]);
    } catch (e) {
      console.error('[Ask AI] error', e);
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const searchSentiment = async sentiment => {
    setSentimentLabel(sentiment);
    setSentimentOpen(true);
    setSentimentLoading(true);
    setSentimentResult('');
    setSentimentError('');
    try {
      const result = await grokIntel(
        `Find the top 5 real public posts or web mentions about "${brand}" in the Philippines during ${period} with ${sentiment.toLowerCase()} sentiment.
For each result include source/platform, date if available, author or outlet if available, a short paraphrase, URL if available, and why it matches ${sentiment.toLowerCase()} sentiment.
Start with a one-paragraph summary. Label uncertain matches.`,
        `Clickable Sentiment: ${sentiment}`
      );
      setSentimentResult(result);
    } catch (e) {
      console.error(`[Clickable Sentiment: ${sentiment}] error`, e);
      setSentimentError(e.message);
    } finally {
      setSentimentLoading(false);
    }
  };

  const runTopicQuery = async e => {
    e.preventDefault();
    if (!query.trim() || queryLoading) return;
    setQueryLoading(true);
    setQueryOpen(true);
    setQueryError('');
    setQueryResult('');
    try {
      const result = await grokIntel(
        `Search live X/Twitter and the web for "${brand}" in the Philippines during ${period}.
Topic query: "${query.trim()}"
Return a concise intelligence summary, recurring themes, specific public posts or articles with URLs when available, sentiment read, and recommended brand action.`,
        'Grok Query'
      );
      setQueryResult(result);
    } catch (e) {
      console.error('[Grok Query] error', e);
      setQueryError(e.message);
    } finally {
      setQueryLoading(false);
    }
  };

  // ── SETUP SCREEN ────────────────────────────────────────────
  if (step === 'setup') return (
    <div style={{ minHeight:'100vh', padding:'38px 22px' }}>
      <div style={{ maxWidth:620, margin:'0 auto' }}>
        <div style={{ marginBottom:32 }}>
          <div style={{ color:LIME, fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:'0.2em', marginBottom:8 }}>PRAXIS EXPERIENTIAL · SOCIAL INTELLIGENCE</div>
          <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:44, fontWeight:700, margin:'0 0 4px' }}>SIGNAL INTEL <span style={{ color:LIME }}>v3</span></h1>
          <p style={{ color:'#444', fontSize:12, margin:'0 0 12px' }}>Brand24 MCP · Grok x_search · Claude 6-agent pipeline · Vercel</p>
          <div style={{ background:'#0d1100', border:`1px solid ${LIME}20`, borderRadius:6, padding:'8px 14px', display:'flex', flexWrap:'wrap', gap:4, alignItems:'center' }}>
            <span style={{ color:LIME, fontSize:10, fontFamily:"'JetBrains Mono',monospace", marginRight:4 }}>PIPELINE:</span>
            {['1·Listener(B24)','2·Tracker','3·Scout(B24+Grok)','4·Analyst','5·Competitive(B24)','6·Report'].map((s,i) => (
              <span key={i} style={{ fontSize:10 }}>{i>0&&<span style={{ color:'#333', margin:'0 3px' }}>→</span>}<span style={{ color:s.includes('Scout')?LIME:s.includes('Analyst')?'#88cc88':'#666' }}>{s}</span></span>
            ))}
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <label style={{ display:'block', color:'#666', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:8 }}>Client / Brand</label>
            <input value={brand} onChange={e => setBrand(e.target.value)} style={{ width:'100%', background:'#111', border:'1px solid #222', borderRadius:6, padding:'12px 14px', color:'#f0f0f0', fontSize:15 }}/>
          </div>
          <div>
            <label style={{ display:'block', color:'#666', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:8 }}>Reporting Period</label>
            <input value={period} onChange={e => setPeriod(e.target.value)} style={{ width:'100%', background:'#111', border:'1px solid #222', borderRadius:6, padding:'12px 14px', color:'#f0f0f0', fontSize:15 }}/>
          </div>
          <div>
            <label style={{ display:'block', color:'#666', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:8 }}>Competitors <span style={{ color:'#333' }}>({competitors.length}/7)</span></label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:10 }}>
              {competitors.map((c,i) => (
                <span key={i} style={{ background:'#161616', border:'1px solid #2a2a2a', borderRadius:20, padding:'5px 12px 5px 14px', fontSize:12, display:'flex', alignItems:'center', gap:8 }}>
                  {c}
                  <button onClick={() => setComp(p => p.filter((_,j) => j!==i))} style={{ background:'none', border:'none', color:'#444', cursor:'pointer', padding:0, fontSize:16, lineHeight:1 }}>×</button>
                </span>
              ))}
            </div>
            {competitors.length < 7 && (
              <div style={{ display:'flex', gap:8 }}>
                <input value={newC} onChange={e => setNewC(e.target.value)} onKeyDown={e => e.key==='Enter'&&addC()} placeholder="Add competitor..." style={{ flex:1, background:'#111', border:'1px solid #222', borderRadius:6, padding:'10px 14px', color:'#f0f0f0', fontSize:13 }}/>
                <button onClick={addC} style={{ background:'#161616', border:'1px solid #2a2a2a', borderRadius:6, padding:'10px 16px', color:'#777', cursor:'pointer', fontSize:13 }}>+ Add</button>
              </div>
            )}
          </div>

          <div style={{ background:'#0a0c0a', border:`1px solid ${LIME}22`, borderRadius:8, padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ color:LIME, fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', fontFamily:"'JetBrains Mono',monospace", marginBottom:4 }}>Brand24 Projects Required</div>
                <p style={{ color:'#555', fontSize:12, lineHeight:1.6 }}>Each brand needs a Brand24 project set up first.<br/>Pipeline auto-detects which projects exist.</p>
              </div>
              <a href="https://app.brand24.com" target="_blank" rel="noreferrer" style={{ background:'#161616', border:`1px solid ${LIME}44`, borderRadius:6, padding:'7px 12px', color:LIME, fontSize:11, textDecoration:'none', whiteSpace:'nowrap' }}>Open Brand24 →</a>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {[brand, ...competitors].map((b,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#111', borderRadius:5, padding:'7px 10px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:i===0?LIME:'#333' }}/>
                    <span style={{ color:i===0?'#f0f0f0':'#777', fontSize:12 }}>{b}</span>
                    {i===0 && <span style={{ background:`${LIME}22`, color:LIME, fontSize:9, padding:'1px 5px', borderRadius:3 }}>CLIENT</span>}
                  </div>
                  <span style={{ color:'#2a2a2a', fontSize:10, fontFamily:"'JetBrains Mono',monospace" }}>needs Brand24 project</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:'#0a0a0a', border:'1px solid #1a1a1a', borderRadius:8, padding:14 }}>
            <div style={{ color:'#555', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6, fontFamily:"'JetBrains Mono',monospace" }}>Environment</div>
            <p style={{ color:'#2e2e2e', fontSize:11, fontFamily:"'JetBrains Mono',monospace", lineHeight:1.7 }}>
              // ANTHROPIC_API_KEY → Claude + Brand24 MCP auth<br/>
              // XAI_API_KEY → Grok x_search + web_search<br/>
              // Set in Vercel Dashboard → Environment Variables
            </p>
          </div>

          {error && <div style={{ color:'#ff6666', fontSize:13, padding:'12px 16px', background:'#1a0000', borderRadius:6 }}>{error}</div>}

          <button onClick={run} style={{ background:LIME, color:'#000', border:'none', borderRadius:6, padding:'16px 24px', fontSize:17, fontWeight:700, cursor:'pointer', letterSpacing:'0.06em', fontFamily:"'Barlow Condensed',sans-serif", textTransform:'uppercase' }}>
            Run Signal Intel Pipeline →
          </button>
        </div>
      </div>
    </div>
  );

  // ── RUNNING SCREEN ───────────────────────────────────────────
  if (step === 'running') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:500 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ color:LIME, fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:'0.2em', marginBottom:8 }}>PIPELINE · {done}/6 · BRAND24 MCP + GROK</div>
          <h2 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:30, fontWeight:700, margin:'0 0 6px' }}>Analyzing {brand}</h2>
          <p style={{ color:'#444', fontSize:13 }}>{period}</p>
          <div style={{ marginTop:14, height:3, background:'#1a1a1a', borderRadius:2, maxWidth:280, margin:'14px auto 0' }}>
            <div style={{ height:'100%', width:`${(done/6)*100}%`, background:LIME, borderRadius:2, transition:'width 0.5s ease' }}/>
          </div>
        </div>
        {AGENTS.map(a => <AgentPill key={a.key} agentKey={a.key} name={a.name} role={a.role} status={agents[a.key]}/>)}
      </div>
    </div>
  );

  // ── REPORT SCREEN ────────────────────────────────────────────
  if (step === 'report' && metrics && analysis && competitive && report) return (
    <div style={{ minHeight:'100vh', padding:'28px 18px' }} className="fade-in">
      <div style={{ maxWidth:960, margin:'0 auto' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:26, paddingBottom:18, borderBottom:'1px solid #181818' }}>
          <div>
            <div style={{ color:LIME, fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:'0.18em', marginBottom:6 }}>
              SOCIAL MONITORING REPORT · {hasB24?'BRAND24 LIVE':'DEMO'}{hasGrok?' · GROK ✓':''} · 6 AGENTS
            </div>
            <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, fontWeight:700, margin:'0 0 4px' }}>{brand}</h1>
            <p style={{ color:'#555', fontSize:13, margin:0 }}>{period} · Prepared by Praxis Experiential</p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
            <button onClick={() => setStep('setup')} style={{ background:'#111', border:'1px solid #222', borderRadius:6, padding:'9px 14px', color:'#666', cursor:'pointer', fontSize:12 }}>← New Report</button>
            <div style={{ display:'flex', gap:4 }}>{AGENTS.map(a => <div key={a.key} title={a.name} style={{ width:8, height:8, borderRadius:'50%', background:'#44ff88' }}/>)}</div>
          </div>
        </div>

        {/* Executive Summary */}
        <div style={{ background:'#0d1100', border:`1px solid ${LIME}20`, borderRadius:10, padding:'16px 20px', marginBottom:14 }}>
          <div style={{ color:LIME, fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:8, fontFamily:"'JetBrains Mono',monospace" }}>Executive Summary · Analyst</div>
          <p style={{ color:'#d0d0d0', lineHeight:1.75, margin:0, fontSize:14 }}>{analysis.executiveSummary}</p>
        </div>

        <IntelligenceQuery query={query} setQuery={setQuery} loading={queryLoading} result={queryResult} error={queryError} open={queryOpen} setOpen={setQueryOpen} onSubmit={runTopicQuery}/>

        {/* Metrics */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
          <Metric label="Total Mentions" value={fmt(metrics.mentions.total)} sub={hasB24?`Brand24 live · ${metrics.projectName||''}`:'No Brand24 project'}/>
          <Metric label="Total Reach" value={fmt(metrics.totalReach)} sub="30-day period"/>
          <Metric label="Daily Avg" value={metrics.mentions.dailyAvg}/>
        </div>

        {/* Spike Drivers */}
        <div style={{ ...CARD, marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ color:'#666', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase' }}>Spike Drivers · {hasGrok?'Grok-grounded':'Brand24-grounded'}</div>
            <div style={{ display:'flex', gap:6 }}>
              {hasB24 && <span style={{ background:`${LIME}18`, border:`1px solid ${LIME}30`, borderRadius:10, padding:'2px 8px', fontSize:9, color:LIME }}>B24 ✓</span>}
              {hasGrok && <span style={{ background:'#1DA1F222', border:'1px solid #1DA1F244', borderRadius:10, padding:'2px 8px', fontSize:9, color:'#1DA1F2' }}>GROK ✓</span>}
            </div>
          </div>
          {analysis.spikeDrivers?.map((d,i) => (
            <div key={i} style={{ display:'flex', gap:12, fontSize:13, color:'#ccc', lineHeight:1.6, marginBottom:9 }}>
              <span style={{ color:LIME, fontFamily:"'JetBrains Mono',monospace", fontSize:11, flexShrink:0, marginTop:2 }}>0{i+1}</span>{d}
            </div>
          ))}
        </div>

        {/* Sentiment + Events */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <div style={CARD}>
            <div style={{ color:'#666', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12 }}>Sentiment · Brand24</div>
            <SentBar label="Positive" count={metrics.sentiment.positive.count} pct={metrics.sentiment.positive.pct} color="#44ff88" onClick={() => searchSentiment('Positive')}/>
            <SentBar label="Neutral"  count={metrics.sentiment.neutral.count}  pct={metrics.sentiment.neutral.pct}  color="#555" onClick={() => searchSentiment('Neutral')}/>
            <SentBar label="Negative" count={metrics.sentiment.negative.count} pct={metrics.sentiment.negative.pct} color="#ff6666" onClick={() => searchSentiment('Negative')}/>
            <p style={{ color:'#555', fontSize:12, margin:'10px 0 0', lineHeight:1.65 }}>{analysis.sentimentNarrative}</p>
          </div>
          <div style={CARD}>
            <div style={{ color:'#666', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12 }}>Brand24 Events · Context Scout</div>
            {context?.events?.length > 0
              ? context.events.slice(0,3).map((e,i) => (
                <div key={i} style={{ marginBottom:10 }}>
                  <div style={{ color:'#d0d0d0', fontSize:12, fontWeight:600, marginBottom:2 }}>{e.date}</div>
                  <div style={{ color:'#666', fontSize:11, lineHeight:1.5 }}>{e.description}</div>
                </div>
              ))
              : <p style={{ color:'#555', fontSize:12, lineHeight:1.6 }}>{context?.qualitativeSignals || 'No significant events detected.'}</p>
            }
          </div>
        </div>

        {/* Grok signals */}
        {hasGrok && context.grokSignals && (
          <div style={{ ...CARD, marginBottom:14, borderColor:'#1DA1F222' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ color:'#666', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase' }}>X/Twitter Signals · Grok Live Search</div>
              <span style={{ background:'#1DA1F222', border:'1px solid #1DA1F244', borderRadius:10, padding:'2px 8px', fontSize:9, color:'#1DA1F2' }}>GROK ✓</span>
            </div>
            <p style={{ color:'#aaa', fontSize:12, lineHeight:1.7 }}>{context.grokSignals.substring(0, 700)}</p>
          </div>
        )}

        {/* Topics */}
        {context?.topTopics?.length > 0 && (
          <div style={{ ...CARD, marginBottom:14 }}>
            <div style={{ color:'#666', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12 }}>Topic Clusters · Brand24 AI</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {context.topTopics.slice(0,6).map((t,i) => (
                <div key={i} style={{ background:'#0d0d0d', border:'1px solid #1a1a1a', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ color:'#f0f0f0', fontSize:12, fontWeight:600, marginBottom:4 }}>{t.name}</div>
                  <div style={{ color:'#555', fontSize:11 }}>{t.mentions} mentions · {t.sentiment}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SOV */}
        <div style={{ ...CARD, marginBottom:14 }}>
          <div style={{ color:'#666', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12 }}>Share of Voice · Brand24 Projects</div>
          {competitive.sovData?.map((s,i) => <SOVRow key={i} {...s}/>)}
          {competitive.sovData?.some(s => !s.found) && (
            <div style={{ marginTop:12, padding:'10px 14px', background:'#0a0a0a', borderRadius:6, border:'1px solid #1e1e1e' }}>
              <p style={{ color:'#444', fontSize:11, fontFamily:"'JetBrains Mono',monospace", margin:0 }}>
                // Missing brands need Brand24 projects → <a href="https://app.brand24.com" target="_blank" rel="noreferrer" style={{ color:LIME, textDecoration:'none' }}>app.brand24.com</a>
              </p>
            </div>
          )}
        </div>

        {/* Competitor notes */}
        {competitive.competitorNotes?.length > 0 && (
          <div style={{ ...CARD, marginBottom:14 }}>
            <div style={{ color:'#666', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12 }}>Competitor Intelligence · B24 + Grok</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              {competitive.competitorNotes.slice(0,3).map((c,i) => (
                <div key={i} style={{ background:'#0d0d0d', border:'1px solid #1a1a1a', borderRadius:8, padding:'12px 14px' }}>
                  <div style={{ color:LIME, fontSize:12, fontWeight:600, marginBottom:8 }}>{c.brand}</div>
                  <div style={{ fontSize:12, color:'#888', lineHeight:1.55 }}>{c.observation}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Themes */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          {[
            { label:'Positive Drivers', items:report.positiveThemes, color:'#44ff88', bg:'#001a08' },
            { label:'Negative Themes',  items:report.negativeThemes,  color:'#ff6666', bg:'#1a0000' },
          ].map((s,i) => (
            <div key={i} style={{ background:s.bg, border:`1px solid ${s.color}18`, borderRadius:10, padding:'16px 20px' }}>
              <div style={{ color:s.color, fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:10, fontFamily:"'JetBrains Mono',monospace" }}>{s.label}</div>
              {s.items?.map((item,j) => (
                <div key={j} style={{ display:'flex', gap:10, marginBottom:9, fontSize:13, color:'#bbb', lineHeight:1.55 }}>
                  <span style={{ color:s.color, flexShrink:0 }}>→</span>{item}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Scam alert */}
        {report.scamRiskAlert && report.scamRiskAlert !== 'null' && (
          <div style={{ background:'#1a0800', border:'1px solid #ff880018', borderRadius:10, padding:'12px 20px', marginBottom:14, display:'flex', gap:12 }}>
            <span style={{ color:'#ff8800', fontSize:14, flexShrink:0 }}>⚠</span>
            <div>
              <div style={{ color:'#ff8800', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:4, fontFamily:"'JetBrains Mono',monospace" }}>Scam / Fraud Risk Alert</div>
              <p style={{ color:'#cc8844', fontSize:13, margin:0, lineHeight:1.6 }}>{report.scamRiskAlert}</p>
            </div>
          </div>
        )}

        {/* Recommendations */}
        <div style={{ background:'#0d1100', border:`1px solid ${LIME}20`, borderRadius:10, padding:'16px 20px', marginBottom:18 }}>
          <div style={{ color:LIME, fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:14, fontFamily:"'JetBrains Mono',monospace" }}>Strategic Recommendations · Report Builder</div>
          {report.recommendations?.map((r,i) => (
            <div key={i} style={{ display:'flex', gap:14, marginBottom:12, alignItems:'flex-start' }}>
              <span style={{ color:LIME, fontFamily:"'JetBrains Mono',monospace", fontSize:11, flexShrink:0, marginTop:3 }}>0{i+1}</span>
              <p style={{ color:'#d0d0d0', fontSize:14, margin:0, lineHeight:1.7 }}>{r}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ paddingTop:14, borderTop:'1px solid #141414', display:'flex', justifyContent:'space-between' }}>
          <span style={{ color:'#2a2a2a', fontSize:11, fontFamily:"'JetBrains Mono',monospace" }}>// Brand24 MCP + Grok · {hasB24?'Live data':'Set up Brand24 project for live data'}</span>
          <span style={{ color:'#2a2a2a', fontSize:11 }}>Signal Intel v3 · Praxis Experiential</span>
        </div>

      </div>

      <FloatingAskAI onClick={() => setAiOpen(true)}/>

      <Drawer open={aiOpen} title="Ask AI" eyebrow="Claude · Report Context" onClose={() => setAiOpen(false)}>
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:14 }}>
          {aiMessages.length === 0 && (
            <div style={{ background:'#111', border:'1px solid #202020', borderRadius:8, padding:14 }}>
              <p style={{ color:'#888', fontSize:13, lineHeight:1.6, margin:0 }}>Ask about the report: why sentiment moved, what to post next, which channels matter, or where the risks are.</p>
            </div>
          )}
          {aiMessages.map((m,i) => (
            <div key={i} style={{ alignSelf:m.role==='user'?'flex-end':'stretch', maxWidth:m.role==='user'?'88%':'100%', background:m.role==='user'?LIME:'#111', color:m.role==='user'?'#000':'#cfcfcf', border:m.role==='user'?'none':'1px solid #202020', borderRadius:8, padding:'11px 13px', fontSize:13, lineHeight:1.65, whiteSpace:'pre-wrap' }}>
              {m.text}
            </div>
          ))}
          {aiLoading && <div style={{ color:'#777', fontSize:12, fontFamily:"'JetBrains Mono',monospace" }}>Claude is reading the report...</div>}
          <ErrorMessage message={aiError}/>
        </div>
        <form onSubmit={askAI} style={{ position:'sticky', bottom:0, background:'#0b0b0b', paddingTop:12, display:'flex', gap:8 }}>
          <textarea value={aiQuestion} onChange={e => setAiQuestion(e.target.value)} placeholder="Why is sentiment mostly neutral?" rows={3} style={{ flex:1, resize:'vertical', background:'#111', border:'1px solid #252525', borderRadius:6, color:'#f0f0f0', padding:11, fontSize:13 }}/>
          <button disabled={aiLoading || !aiQuestion.trim()} style={{ alignSelf:'stretch', background:aiLoading?'#222':LIME, color:'#000', border:'none', borderRadius:6, padding:'0 14px', cursor:aiLoading?'default':'pointer', fontSize:12, fontWeight:800 }}>Send</button>
        </form>
      </Drawer>

      <Drawer open={sentimentOpen} title={`${sentimentLabel || 'Sentiment'} Posts`} eyebrow="Powered by Grok" onClose={() => setSentimentOpen(false)}>
        {sentimentLoading
          ? <div style={{ color:'#777', fontSize:12, fontFamily:"'JetBrains Mono',monospace" }}>Searching live posts...</div>
          : <>
              <ErrorMessage message={sentimentError}/>
              <TextBlock text={sentimentResult}/>
            </>
        }
      </Drawer>
    </div>
  );

  return null;
}
