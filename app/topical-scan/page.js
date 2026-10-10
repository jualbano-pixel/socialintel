'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import ThemeToggle from '../theme-toggle';

const CARD = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 };
const INPUT = { width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '10px 12px', fontSize: 13 };
const DEFAULT_THEMES = [
  { label: 'Delayed / non-payment, 180+ DPD', description: 'Long-running non-payment or accounts past due for roughly six months or more.', phrases: 'di na nabayaran\nang months na di nagbabayad\npast due\n6 months na\n180 days', manualNotes: '' },
  { label: 'Waiting before negotiating', description: 'Advice or claims about waiting roughly 180 days before paying or negotiating.', phrases: 'hintayin mo muna\nwag ka muna magbayad\nafter 6 months\nwait for write-off', manualNotes: '' },
  { label: 'Discounts / settlements', description: 'Settlement offers, reduced balances, restructuring, or waived interest.', phrases: 'settlement offer\none-time payment\nOTP\ndiscount sa balance\namnesty\nrestructuring\nwaived interest\nprincipal na lang', manualNotes: '' },
  { label: 'Process “gaming” claims', description: 'Advice framed as a strategy to ignore collectors or reduce repayment.', phrases: 'hindi ka makukulong sa utang\nignore mo lang collector\ntatawag lang yan\nmas mura kung hintayin\nstrategy sa CC debt', manualNotes: '' },
  { label: 'Collections / write-offs', description: 'Collection activity, demand letters, field visits, agencies, write-offs, or credit costs.', phrases: 'collection agency\ndemand letter\nfield visit\ncollector\nCIC\nblacklist\nwrite off\nprovision\nnon-performing loan\nNPL\ncredit cost', manualNotes: '' },
];

const fmt = value => Number(value || 0).toLocaleString();
const pct = value => `${Number(value || 0).toFixed(2)}%`;

function Bars({ values = {} }) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, value]) => value), 1);
  if (!entries.length) return <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>No classified mentions</div>;
  return <div style={{ display: 'grid', gap: 7 }}>{entries.map(([label, value]) => <div key={label} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 36px', gap: 8, alignItems: 'center', fontSize: 11 }}><span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span><div style={{ height: 7, borderRadius: 9, background: 'var(--bg-surface-muted)' }}><div style={{ height: '100%', width: `${value / max * 100}%`, borderRadius: 9, background: 'var(--accent-live)' }}/></div><strong>{value}</strong></div>)}</div>;
}

function MonthlyTrend({ values = {} }) {
  const entries = Object.entries(values);
  const max = Math.max(...entries.map(([, value]) => Number(value || 0)), 1);
  if (!entries.length) return <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>No monitoring data</div>;
  return <div style={{ display: 'grid', gap: 7 }}>{entries.map(([month, value]) => <div key={month} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 104px', gap: 8, alignItems: 'center', fontSize: 11 }}><span style={{ color: 'var(--text-muted)' }}>{month}</span>{value === null ? <><div style={{ height: 7, borderRadius: 9, background: 'var(--bg-surface-muted)' }}/><strong style={{ color: 'var(--text-faint)', fontWeight: 500 }}>No monitoring data</strong></> : <><div style={{ height: 7, borderRadius: 9, background: 'var(--bg-surface-muted)' }}><div style={{ height: '100%', width: `${Number(value) / max * 100}%`, borderRadius: 9, background: 'var(--accent-live)' }}/></div><strong>{value}</strong></>}</div>)}</div>;
}

function StatusBadge({ status }) {
  const color = status === 'complete' ? 'var(--accent-positive)' : status === 'error' ? 'var(--accent-negative)' : 'var(--text-faint)';
  return <span style={{ color, fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>{status}</span>;
}

const QUAL_ENGINES = [
  { id: 'grok', label: 'Grok via OpenRouter', kind: 'grok', model: 'x-ai/grok-4.7', enabled: true },
  { id: 'gemini', label: 'Gemini grounded', kind: 'gemini', model: 'gemini-3.6-flash', enabled: true },
  { id: 'sonar', label: 'Sonar via OpenRouter', kind: 'openrouter', model: 'perplexity/sonar-pro', enabled: true },
];
const qualKey = (brand, themes) => `signalintel:qual-plan:${String(brand || '').toLowerCase().trim()}:${themes.map(theme => theme.label).join('|').toLowerCase()}`;
const monthsBefore = (date, months) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCMonth(value.getUTCMonth() - Number(months || 24)); return value.toISOString().slice(0, 10); };
const mergeQualFindings = findings => {
  const merged = new Map();
  findings.forEach(item => {
    const current = merged.get(item.url) || { ...item, engines: [], themes: [] };
    current.engines = [...new Set([...current.engines, item.engine])]; current.themes = [...new Set([...current.themes, item.theme])]; current.corroborated = current.engines.length >= 2;
    merged.set(item.url, current);
  });
  return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));
};

function QualitativeReport({ qualitative, verifiedOnly, setVerified, showThirdParties }) {
  if (!qualitative.findings.length && qualitative.phase !== 'complete') return null;
  const findings = qualitative.findings.filter(item => !verifiedOnly || item.verified);
  const row = item => <tr key={item.url}><td style={{ padding: 7, whiteSpace: 'nowrap' }}>{item.date}{item.dateEstimated ? ' (estimated)' : ''}</td><td style={{ padding: 7 }}>{item.platform}</td><td style={{ padding: 7 }}>{item.themes.join(', ')}</td><td style={{ padding: 7 }}>{showThirdParties ? item.paraphrase : item.clientParaphrase}</td><td style={{ padding: 7 }}>{item.engines.join(', ')}{item.corroborated ? ' · corroborated' : ''}</td><td style={{ padding: 7 }}><a href={item.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-live)' }}>Source</a></td></tr>;
  const table = (label, items) => <><h3 style={{ fontSize: 14, margin: '16px 0 7px' }}>{label}</h3>{items.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}><thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}><th>Date</th><th>Platform</th><th>Theme(s)</th><th>Finding</th><th>Engines</th><th>Link</th></tr></thead><tbody>{items.map(row)}</tbody></table></div> : <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>None found.</p>}</>;
  return <section style={{ marginTop: 24 }}><h2 style={{ fontSize: 18, marginBottom: 4 }}>Qualitative Layer</h2><p style={{ color: 'var(--accent-highlight)', fontSize: 11 }}>Directional — public-source discovery, not volume.</p>
    {table('In review period', findings.filter(item => item.band === 'In review period'))}{table('Older but still public', findings.filter(item => item.band === 'Older but still public'))}
    <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>Per-theme synthesis</h3>{Object.entries(qualitative.synthesis).map(([theme, value]) => <article key={theme} style={{ ...CARD, marginBottom: 10 }}><strong>{theme} · {value.signalStrength || 'None found'}</strong><p style={{ fontSize: 11, lineHeight: 1.5, marginTop: 6 }}><b>In period:</b> {value.inPeriod || 'None found.'}</p><p style={{ fontSize: 11, lineHeight: 1.5 }}><b>Older:</b> {value.older || 'None found.'}</p>{value.narratives?.length > 0 && <p style={{ fontSize: 11 }}><b>Recurring narratives:</b> {value.narratives.join('; ')}</p>}{value.counterexamples?.length > 0 && <p style={{ fontSize: 11 }}><b>Counterexamples:</b> {value.counterexamples.join('; ')}</p>}{value.riskFlags?.length > 0 && <p style={{ fontSize: 11, color: 'var(--accent-negative)' }}><b>Risk flags:</b> {value.riskFlags.join('; ')}</p>}</article>)}
  </section>;
}

function CombinedReview({ findings, onVerify }) {
  const [filters, setFilters] = useState({ theme: '', section: '', band: '', verified: '' });
  const values = key => [...new Set(findings.flatMap(item => Array.isArray(item[key]) ? item[key] : [item[key]]).filter(Boolean))].sort();
  const shown = findings.filter(item => (!filters.theme || item.themes.includes(filters.theme)) && (!filters.section || item.sections.includes(filters.section)) && (!filters.band || item.band === filters.band) && (!filters.verified || String(Boolean(item.verified)) === filters.verified));
  return <section style={{ ...CARD, marginTop: 18 }}><h2 style={{ fontSize: 17 }}>AI Finding Review</h2><p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>One URL-deduped list across Directional Intelligence and the Qualitative Layer. Export filtering does not hide findings here.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 8, margin: '12px 0' }}><select value={filters.theme} onChange={event => setFilters(previous => ({ ...previous, theme: event.target.value }))} style={INPUT}><option value="">All themes</option>{values('themes').map(value => <option key={value}>{value}</option>)}</select><select value={filters.section} onChange={event => setFilters(previous => ({ ...previous, section: event.target.value }))} style={INPUT}><option value="">All sections</option>{values('sections').map(value => <option key={value}>{value}</option>)}</select><select value={filters.band} onChange={event => setFilters(previous => ({ ...previous, band: event.target.value }))} style={INPUT}><option value="">All date bands</option>{values('band').map(value => <option key={value}>{value}</option>)}</select><select value={filters.verified} onChange={event => setFilters(previous => ({ ...previous, verified: event.target.value }))} style={INPUT}><option value="">All verification states</option><option value="true">Verified</option><option value="false">Not verified</option></select></div><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}><thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}><th>Verified</th><th>Date</th><th>Platform</th><th>Theme</th><th>Paraphrase</th><th>Engine(s)</th><th>Section</th><th>Link</th></tr></thead><tbody>{shown.map(item => <tr key={item.url}><td style={{ padding: 7 }}><input type="checkbox" checked={Boolean(item.verified)} onChange={event => onVerify(item.url, event.target.checked)}/></td><td style={{ padding: 7, whiteSpace: 'nowrap' }}>{item.date}{item.dateEstimated ? ' (estimated)' : ''}</td><td style={{ padding: 7 }}>{item.platform}</td><td style={{ padding: 7 }}>{item.themes.join(', ')}</td><td style={{ padding: 7 }}>{item.paraphrase}</td><td style={{ padding: 7 }}>{item.engines.join(', ')}</td><td style={{ padding: 7 }}>{item.sections.join(', ')}</td><td style={{ padding: 7 }}><a href={item.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-live)' }}>Source</a></td></tr>)}</tbody></table></div></section>;
}

export default function TopicalScan() {
  const reportRef = useRef(null);
  const [projects, setProjects] = useState([]);
  const [projectError, setProjectError] = useState('');
  const [form, setForm] = useState({ projectId: '', projectName: '', dateFrom: '2026-04-01', dateTo: '2026-09-30', aliases: 'EastWest\nEast West Bank\nEastWest Bank\nEWBC\nEW credit card\nEW CC', exclusions: 'East-West Seed\neastwest travel\neastwest shipping', expectedTotal: '', themes: DEFAULT_THEMES });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [progress, setProgress] = useState([]);
  const [qualitative, setQualitative] = useState({ phase: 'idle', plan: null, planText: '', findings: [], synthesis: {}, logs: [], errors: [], discoveryCompleted: {}, targetedCompleted: {}, targetSearches: {}, failedStep: null });
  const [qualReady, setQualReady] = useState(false);
  const [qualLookback, setQualLookback] = useState(24);
  const [qualEngines, setQualEngines] = useState(QUAL_ENGINES);
  const [qualBusy, setQualBusy] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [showThirdParties, setShowThirdParties] = useState(false);
  const [verifiedUrls, setVerifiedUrls] = useState({});
  const [reviewSynthesis, setReviewSynthesis] = useState({ directional: {}, qualitative: {} });
  const [exportSections, setExportSections] = useState({ verified: true, directional: true, qualitative: true, appendix: true, method: true });
  const [reviewBusy, setReviewBusy] = useState(false);

  useEffect(() => {
    fetch('/api/tracking/projects').then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load monitoring projects.');
      setProjects(data.projects || []);
    }).catch(err => setProjectError(err.message));
  }, []);

  useEffect(() => { try { const saved = localStorage.getItem('signalintel:qualitative-run:v3'); if (saved) setQualitative(previous => ({ ...previous, ...JSON.parse(saved) })); } catch { /* ignore corrupt local state */ } finally { setQualReady(true); } }, []);
  useEffect(() => { if (qualReady) localStorage.setItem('signalintel:qualitative-run:v3', JSON.stringify(qualitative)); }, [qualitative, qualReady]);
  useEffect(() => { try { const saved = localStorage.getItem('signalintel:ai-review:v1'); if (saved) { const parsed = JSON.parse(saved); setVerifiedUrls(parsed.verifiedUrls || {}); setReviewSynthesis(parsed.reviewSynthesis || { directional: {}, qualitative: {} }); } } catch { /* ignore corrupt review state */ } }, []);
  useEffect(() => { localStorage.setItem('signalintel:ai-review:v1', JSON.stringify({ verifiedUrls, reviewSynthesis })); }, [verifiedUrls, reviewSynthesis]);

  const selectedProject = useMemo(() => projects.find(project => String(project.id || project.project_id || project.projectId) === String(form.projectId)), [projects, form.projectId]);
  const reviewFindings = useMemo(() => {
    const records = [];
    (result?.directional || []).forEach(theme => theme.sources.forEach(source => source.findings.forEach(finding => records.push({ ...finding, theme: theme.label, engine: source.source, section: 'Directional Intelligence', band: 'In review period', platform: finding.platform || source.source }))));
    (qualitative.findings || []).forEach(finding => records.push({ ...finding, theme: finding.theme || finding.themes?.[0], engine: finding.engine || finding.engines?.[0], section: 'Qualitative Layer' }));
    const merged = new Map(); records.forEach(item => { const current = merged.get(item.url) || { ...item, themes: [], engines: [], sections: [] }; current.themes = [...new Set([...current.themes, ...(item.themes || [item.theme]).filter(Boolean)])]; current.engines = [...new Set([...current.engines, ...(item.engines || [item.engine]).filter(Boolean)])]; current.sections = [...new Set([...current.sections, item.section])]; current.corroborated = current.engines.length >= 2; current.verified = Boolean(verifiedUrls[item.url]); merged.set(item.url, current); });
    return [...merged.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [result, qualitative.findings, verifiedUrls]);
  const exportFindings = reviewFindings.filter(item => !verifiedOnly || item.verified);
  const setField = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const setTheme = (index, key, value) => setForm(previous => ({ ...previous, themes: previous.themes.map((theme, themeIndex) => themeIndex === index ? { ...theme, [key]: value } : theme) }));
  const removeTheme = index => setForm(previous => ({ ...previous, themes: previous.themes.filter((_, themeIndex) => themeIndex !== index) }));
  const addTheme = () => setForm(previous => ({ ...previous, themes: [...previous.themes, { label: '', description: '', phrases: '', manualNotes: '' }] }));

  const qualPayload = () => ({ brand: selectedProject?.name || selectedProject?.project_name || form.projectName || form.aliases.split('\n').find(Boolean) || 'Selected brand', market: 'Philippines', aliases: form.aliases.split('\n').filter(Boolean), exclusions: form.exclusions.split('\n').filter(Boolean), themes: form.themes.map(theme => ({ ...theme, phrases: theme.phrases.split('\n').filter(Boolean) })), dateFrom: form.dateFrom, dateTo: form.dateTo, lookbackFrom: monthsBefore(form.dateFrom, qualLookback), cap: 8, engines: qualEngines });
  async function qualRequest(payload, step) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 115000);
    try {
      const response = await fetch('/api/topical-scan/qualitative', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      const raw = await response.text(); let data;
      try { data = raw ? JSON.parse(raw) : {}; } catch { const failure = new Error(`Non-JSON response (${response.status}): ${raw.slice(0, 180) || 'empty response'}`); failure.step = step; throw failure; }
      if (!response.ok) { const failure = new Error(data.error || `Request failed (${response.status}).`); failure.rawOutput = data.rawOutput || ''; failure.step = step; throw failure; }
      return data;
    } catch (failure) { if (failure.name === 'AbortError') { const timeout = new Error('Request exceeded the 115-second client timeout.'); timeout.step = step; throw timeout; } failure.step ||= step; throw failure; }
    finally { clearTimeout(timer); }
  }
  const addQualLog = item => setQualitative(previous => ({ ...previous, logs: [...previous.logs, item] }));

  function emptyPlan() {
    const base = qualPayload();
    return { aliases: base.aliases, exclusions: base.exclusions, themes: base.themes.map(theme => ({ label: theme.label, queries: (theme.phrases || []).slice(0, 5), venues: [] })) };
  }

  function markFailed(type, label, error, extra = {}) { setQualitative(previous => ({ ...previous, phase: 'step-failed', failedStep: { type, label, error: error.message || String(error), ...extra }, logs: [...previous.logs, { step: `${label} failed`, error: error.message || String(error), rawOutput: error.rawOutput || '' }] })); }

  async function runDiscovery(plan, base = qualPayload(), completedSeed = qualitative.discoveryCompleted || {}) {
    let currentPlan = plan; const completed = { ...completedSeed };
    for (let index = 0; index < plan.themes.length; index += 1) {
      if (completed[index]) continue;
      const theme = currentPlan.themes[index]; const step = `Discovery · ${theme.label}`; setQualitative(previous => ({ ...previous, phase: `discovery ${index + 1}/${plan.themes.length}`, failedStep: null }));
      let discovery; try { discovery = await qualRequest({ action: 'discovery', ...base, plan: currentPlan, theme }, step); } catch (failure) { markFailed('discovery', step, failure, { index }); throw failure; }
      discovery.logs.forEach(log => addQualLog({ step, ...log }));
      const venues = new Map((theme.venues || []).map(item => [item.venue.toLowerCase(), { ...item, discovered: false, source: 'planner' }])); discovery.venues.forEach(item => { const key = item.venue.toLowerCase(); const existing = venues.get(key); venues.set(key, existing ? { ...existing, hitCount: item.hitCount || 0 } : { ...item, discovered: true, source: 'discovered' }); });
      const themes = currentPlan.themes.map((item, themeIndex) => themeIndex === index ? { ...item, venues: [...venues.values()] } : item); currentPlan = { ...currentPlan, themes }; completed[index] = true;
      setQualitative(previous => ({ ...previous, plan: currentPlan, planText: JSON.stringify(currentPlan, null, 2), discoveryCompleted: { ...(previous.discoveryCompleted || {}), [index]: true } }));
    }
    setQualitative(previous => ({ ...previous, phase: 'review', plan: currentPlan, planText: JSON.stringify(currentPlan, null, 2), plannerError: '', failedStep: null }));
  }

  async function startQualitative() {
    setQualBusy(true); setError(''); setQualitative({ phase: 'planning', plan: null, planText: '', findings: [], synthesis: {}, logs: [], errors: [], discoveryCompleted: {}, targetedCompleted: {}, targetSearches: {}, failedStep: null });
    const base = qualPayload(); let planned;
    try {
      planned = await qualRequest({ action: 'planner', ...base }, 'Planner');
      addQualLog({ step: 'Planner', runtimeMs: planned.runtimeMs, costUsd: null, provider: planned.provider, stopReason: planned.stopReason });
    } catch (err) {
      const reason = err.message || 'Unknown error'; setQualitative(previous => ({ ...previous, phase: 'step-failed', plannerError: reason, failedStep: { type: 'planner', label: 'Planner', error: reason }, logs: [...previous.logs, { step: 'Planner failed', error: reason, rawOutput: err.rawOutput || '' }] })); setQualBusy(false); return;
    }
    try { await runDiscovery(planned.plan, base, {}); }
    catch { /* runDiscovery preserves the failed step and completed themes */ }
    finally { setQualBusy(false); }
  }

  async function skipPlanner() {
    setQualBusy(true); setError(''); const plan = emptyPlan();
    setQualitative(previous => ({ ...previous, phase: 'discovery', plannerError: '', plan, planText: JSON.stringify(plan, null, 2), findings: [], synthesis: {}, discoveryCompleted: {}, targetedCompleted: {}, targetSearches: {}, failedStep: null }));
    addQualLog({ step: 'Planner', error: 'Skipped by analyst; discovery started from the input aliases, exclusions, themes, and phrase lists.' });
    try { await runDiscovery(plan, qualPayload(), {}); } catch { /* failed step is retained for retry */ } finally { setQualBusy(false); }
  }

  function loadPlan() {
    try { const saved = localStorage.getItem(qualKey(selectedProject?.name || form.projectName, form.themes)); if (!saved) throw new Error('No saved approved plan for this brand and topic.'); const plan = JSON.parse(saved); setQualitative(previous => ({ ...previous, phase: 'review', plan, planText: JSON.stringify(plan, null, 2) })); }
    catch (err) { setError(err.message); }
  }

  function approvePlan() {
    try {
      const plan = JSON.parse(qualitative.planText); localStorage.setItem(qualKey(selectedProject?.name || form.projectName, form.themes), JSON.stringify(plan)); setQualitative(previous => ({ ...previous, phase: 'confirm-targeted', plan, findings: [], synthesis: {}, targetedCompleted: {}, targetSearches: {}, failedStep: null }));
    } catch (err) { setError(`Plan JSON is invalid: ${err.message}`); }
  }

  async function runTargeted() {
    setQualBusy(true); setError(''); const plan = qualitative.plan; const base = qualPayload(); const completed = { ...(qualitative.targetedCompleted || {}) }; const searches = { ...(qualitative.targetSearches || {}) }; let collected = [...(qualitative.findings || [])];
    const targetedEngines = QUAL_ENGINES.filter(engine => ['grok', 'gemini'].includes(engine.id));
    for (let index = 0; index < plan.themes.length; index += 1) {
      const theme = plan.themes[index];
      for (const engine of targetedEngines) {
        const key = `${index}:${engine.id}`; if (completed[key]) continue;
        const step = `Targeted · ${theme.label} · ${engine.label}`; setQualitative(previous => ({ ...previous, phase: `targeted ${index + 1}/${plan.themes.length} · ${engine.label}`, failedStep: null }));
        try {
          if (!searches[key]) {
            const search = await qualRequest({ action: 'targeted-search', ...base, plan, theme, engineId: engine.id }, `${step} · search`); searches[key] = search;
            setQualitative(previous => ({ ...previous, targetSearches: { ...(previous.targetSearches || {}), [key]: search }, logs: [...previous.logs, { step: `Targeted search · ${theme.label}`, ...search.log }] }));
          }
          const data = await qualRequest({ action: 'targeted-structure', ...base, plan, theme, engineId: engine.id, searchText: searches[key].searchText, citationUrls: searches[key].citationUrls }, `${step} · structure and validate`); collected = mergeQualFindings([...collected, ...data.findings]); completed[key] = true;
          setQualitative(previous => ({ ...previous, findings: collected, targetedCompleted: { ...(previous.targetedCompleted || {}), [key]: true }, logs: [...previous.logs, { step: `Targeted validation · ${theme.label} · ${engine.label}`, runtimeMs: data.runtimeMs, validation: data.validation }] }));
        } catch (failure) { markFailed('targeted', step, failure, { index, engineId: engine.id }); setQualBusy(false); return; }
      }
    }
    const synthesis = { ...(qualitative.synthesis || {}) };
    for (let index = 0; index < plan.themes.length; index += 1) {
      const theme = plan.themes[index]; if (synthesis[theme.label]) continue; const step = `Synthesis · ${theme.label}`; setQualitative(previous => ({ ...previous, phase: `synthesis ${index + 1}/${plan.themes.length}`, failedStep: null }));
      try { const data = await qualRequest({ action: 'synthesis', theme, findings: collected.filter(item => item.themes.includes(theme.label)) }, step); synthesis[theme.label] = data.synthesis; setQualitative(previous => ({ ...previous, synthesis: { ...previous.synthesis, [theme.label]: data.synthesis }, logs: [...previous.logs, { step, runtimeMs: data.runtimeMs, costUsd: null }] })); }
      catch (failure) { markFailed('synthesis', step, failure, { index }); setQualBusy(false); return; }
    }
    setQualitative(previous => ({ ...previous, phase: 'complete', findings: collected, synthesis, failedStep: null })); setQualBusy(false);
  }

  async function retryFailedStep() {
    const failed = qualitative.failedStep; if (!failed) return;
    if (failed.type === 'planner') return startQualitative();
    setQualBusy(true); setError('');
    try { if (failed.type === 'discovery') await runDiscovery(qualitative.plan); else await runTargeted(); }
    finally { if (failed.type === 'discovery') setQualBusy(false); }
  }
  const setFindingVerified = (url, verified) => { setVerifiedUrls(previous => ({ ...previous, [url]: verified })); setQualitative(previous => ({ ...previous, findings: previous.findings.map(item => item.url === url ? { ...item, verified } : item) })); };

  async function resynthesizeVerified() {
    setReviewBusy(true); setError(''); const next = { directional: {}, qualitative: {} };
    try {
      for (const section of ['Directional Intelligence', 'Qualitative Layer']) for (const theme of [...new Set(reviewFindings.filter(item => item.sections.includes(section)).flatMap(item => item.themes))]) {
        const findings = reviewFindings.filter(item => item.verified && item.sections.includes(section) && item.themes.includes(theme)); const step = `Re-synthesis · ${section} · ${theme}`;
        const data = await qualRequest({ action: 'synthesis', theme: { label: theme }, findings }, step); next[section === 'Directional Intelligence' ? 'directional' : 'qualitative'][theme] = data.synthesis;
      }
      setReviewSynthesis(next);
    } catch (failure) { setError(`Re-synthesis failed: ${failure.message}`); } finally { setReviewBusy(false); }
  }

  async function runScan(event) {
    event.preventDefault(); setLoading(true); setError(''); setResult(null); setProgress([]);
    try {
      const payload = { ...form, projectName: selectedProject?.name || selectedProject?.project_name || form.projectName };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort('The scan exceeded the 790-second client timeout.'), 790000);
      const response = await fetch('/api/topical-scan?stream=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`Topical scan failed (${response.status}).`);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let completed = null;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.type === 'progress') setProgress(previous => [...previous, event]);
          if (event.type === 'error') throw new Error(event.error || 'The scan stopped before the report was complete.');
          if (event.type === 'result') completed = event.result;
        }
        if (done) break;
      }
      clearTimeout(timeout);
      if (!completed) throw new Error('The scan connection closed before a complete report was returned. No partial report was saved.');
      setResult(completed);
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) { setError(err.name === 'AbortError' ? 'The scan timed out before completion. No partial report was saved.' : err.message); } finally { setLoading(false); }
  }

  async function exportPdf() {
    if (!reportRef.current) return; setPdfLoading(true); setError('');
    try {
      const response = await fetch('/api/export-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `${result.projectName || 'Brand'} Topical Scan`, reportHtml: reportRef.current.outerHTML }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'PDF export failed.'); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${(result.projectName || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-topical-scan.pdf`; link.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); } finally { setPdfLoading(false); }
  }

  return <main style={{ minHeight: '100vh', padding: '28px 20px 80px' }}>
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', marginBottom: 28 }}>
        <div><a href="/" style={{ color: 'var(--accent-live)', fontSize: 11, textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>← SIGNAL INTEL</a><h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, marginTop: 8 }}>Topical Scan</h1><p style={{ color: 'var(--text-muted)', maxWidth: 680, lineHeight: 1.55, fontSize: 13 }}>A separate, privacy-safe workflow for measuring specific narratives inside an existing monitoring project. Counts are monitoring metrics; cited AI findings remain directional.</p></div>
        <ThemeToggle/>
      </header>

      <form onSubmit={runScan} style={{ display: 'grid', gap: 16 }}>
        <section style={CARD}>
          <h2 style={{ fontSize: 16, marginBottom: 14 }}>1 · Scope</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Existing monitoring project<select required value={form.projectId} onChange={event => setField('projectId', event.target.value)} style={{ ...INPUT, marginTop: 6 }}><option value="">Select by stored project ID</option>{projects.map(project => { const id = project.id || project.project_id || project.projectId; const name = project.name || project.project_name || project.projectName; return <option key={id} value={id}>{name} · {id}</option>; })}</select></label>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Start date<input required type="date" value={form.dateFrom} onChange={event => setField('dateFrom', event.target.value)} style={{ ...INPUT, marginTop: 6 }}/></label>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>End date<input required type="date" value={form.dateTo} onChange={event => setField('dateTo', event.target.value)} style={{ ...INPUT, marginTop: 6 }}/></label>
          </div>
          {projectError && <p style={{ color: 'var(--accent-negative)', fontSize: 12, marginTop: 10 }}>{projectError}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 180px', gap: 12, marginTop: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Brand aliases<textarea value={form.aliases} onChange={event => setField('aliases', event.target.value)} rows={5} style={{ ...INPUT, marginTop: 6, resize: 'vertical' }}/></label>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Exclusion terms<textarea value={form.exclusions} onChange={event => setField('exclusions', event.target.value)} rows={5} style={{ ...INPUT, marginTop: 6, resize: 'vertical' }}/></label>
            <label style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700, background: 'var(--accent-highlight-soft)', border: '2px solid var(--accent-highlight-border)', borderRadius: 8, padding: 12 }}>Expected dashboard total<input type="number" min="0" value={form.expectedTotal} onChange={event => setField('expectedTotal', event.target.value)} placeholder="Enter dashboard count" style={{ ...INPUT, marginTop: 8, borderColor: 'var(--accent-highlight-border)', fontSize: 17, fontWeight: 700 }}/><small style={{ display: 'block', marginTop: 8, lineHeight: 1.45, color: 'var(--accent-highlight)', fontWeight: 500 }}>Recommended every run. A difference over 2% is flagged prominently but does not hide the scan.</small></label>
          </div>
        </section>

        <section style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><div><h2 style={{ fontSize: 16 }}>2 · Themes</h2><p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>One phrase per line. Keyword matching is high-recall; AI classification removes irrelevant hits.</p></div><button type="button" disabled={form.themes.length >= 6} onClick={addTheme} style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>+ Add theme</button></div>
          <div style={{ display: 'grid', gap: 12 }}>{form.themes.map((theme, index) => <article key={index} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 14, background: 'var(--bg-surface-subtle)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 10 }}><input required value={theme.label} onChange={event => setTheme(index, 'label', event.target.value)} placeholder="Theme label" style={INPUT}/><input required value={theme.description} onChange={event => setTheme(index, 'description', event.target.value)} placeholder="What this theme means" style={INPUT}/><button type="button" disabled={form.themes.length === 1} onClick={() => removeTheme(index)} style={{ ...INPUT, width: 'auto', color: 'var(--accent-negative)' }}>Remove</button></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}><textarea required value={theme.phrases} onChange={event => setTheme(index, 'phrases', event.target.value)} placeholder="Colloquial phrases" rows={4} style={{ ...INPUT, resize: 'vertical' }}/><textarea value={theme.manualNotes} onChange={event => setTheme(index, 'manualNotes', event.target.value)} placeholder="Optional manual Meta AI / public Facebook notes — no names or handles" rows={4} style={{ ...INPUT, resize: 'vertical' }}/></div>
          </article>)}</div>
        </section>

        {error && <div style={{ ...CARD, borderColor: 'var(--accent-negative-border)', color: 'var(--accent-negative)', fontSize: 13 }}>{error}</div>}
        <button disabled={loading || !form.projectId} style={{ border: 0, borderRadius: 7, padding: 14, background: 'var(--accent-live)', color: 'var(--text-on-accent)', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>{loading ? 'Pulling all mentions, classifying, and checking sources…' : 'Run topical scan'}</button>
        {loading && <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>This can take several minutes for a six-month window. The scan uses complete cursor pagination and no 2,500-mention cap.</p>}
        {(loading || progress.length > 0) && <section style={{ ...CARD, padding: 14 }}><div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-live)', fontSize: 10, marginBottom: 8 }}>RUN LOG · {loading ? 'IN PROGRESS' : error ? 'STOPPED' : 'COMPLETE'}</div><div style={{ display: 'grid', gap: 5 }}>{progress.map((item, index) => <div key={`${item.at}-${index}`} style={{ color: index === progress.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 11 }}><span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{item.stage}</span> · {item.message}</div>)}</div></section>}
      </form>

      <section style={{ ...CARD, marginTop: 22, borderTop: '4px solid var(--accent-highlight)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}><div><h2 style={{ fontSize: 18 }}>Qualitative Layer</h2><p style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>Separate public-source discovery. It can run with or without a Brand24 pull and makes no volume claims.</p></div><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-highlight)', fontSize: 10 }}>{qualitative.phase.toUpperCase()}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginTop: 14 }}><label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lookback before start (months)<input type="number" min="0" max="60" value={qualLookback} onChange={event => setQualLookback(event.target.value)} style={{ ...INPUT, marginTop: 5 }}/></label><div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Step engines</div><div style={{ fontSize: 11 }}>Discovery: Gemini grounded · Targeted: Grok via OpenRouter + Gemini grounded · one request per theme and engine</div></div></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}><button type="button" disabled={qualBusy} onClick={startQualitative} style={{ ...INPUT, width: 'auto', background: 'var(--accent-highlight)', color: 'var(--text-on-accent)', cursor: qualBusy ? 'wait' : 'pointer' }}>{qualBusy ? 'Running step…' : 'Run planner + discovery'}</button><button type="button" disabled={qualBusy} onClick={skipPlanner} style={{ ...INPUT, width: 'auto' }}>Skip planner — start from empty plan</button><button type="button" disabled={qualBusy} onClick={loadPlan} style={{ ...INPUT, width: 'auto' }}>Load saved plan</button></div>
        {qualitative.phase === 'step-failed' && qualitative.failedStep && <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--accent-negative-border)', borderRadius: 7, background: 'var(--bg-panel-negative)', color: 'var(--accent-negative)', fontSize: 12 }}><strong>Step timed out or failed: {qualitative.failedStep.label}</strong><p style={{ marginTop: 5 }}>{qualitative.failedStep.error}</p><p style={{ marginTop: 5, color: 'var(--text-muted)', fontSize: 11 }}>Completed steps and the current plan are saved locally.</p><button type="button" disabled={qualBusy} onClick={retryFailedStep} style={{ ...INPUT, width: 'auto', marginTop: 8 }}>Retry this step</button></div>}
        {qualitative.phase === 'review' && <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}><h3 style={{ fontSize: 14 }}>Analyst review required</h3><p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '5px 0 8px' }}>Edit aliases, exclusions, queries, and venues as JSON. No targeted search runs until you approve.</p><textarea value={qualitative.planText} onChange={event => setQualitative(previous => ({ ...previous, planText: event.target.value }))} rows={18} style={{ ...INPUT, fontFamily: 'var(--font-mono)', fontSize: 10, resize: 'vertical' }}/><button type="button" onClick={approvePlan} disabled={qualBusy} style={{ ...INPUT, width: 'auto', marginTop: 8, background: 'var(--accent-live)', color: 'var(--text-on-accent)' }}>Approve plan</button></div>}
        {qualitative.phase === 'confirm-targeted' && <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}><h3 style={{ fontSize: 14 }}>Confirm targeted pass</h3><p style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.55, marginTop: 5 }}>{qualitative.plan.themes.length * 2} search requests (Grok + Gemini) plus one separate structuring request per theme and engine, capped at 8 cited results per search. Estimated maximum X-search item charge: ${(qualitative.plan.themes.length * 8 * 0.005).toFixed(2)} USD, plus model and native web-search charges. Actual returned costs appear in the internal log.</p><button type="button" disabled={qualBusy} onClick={runTargeted} style={{ ...INPUT, width: 'auto', marginTop: 8, background: 'var(--accent-live)', color: 'var(--text-on-accent)' }}>Confirm and run targeted pass</button></div>}
        {qualitative.logs.length > 0 && <details style={{ marginTop: 12 }} open={qualBusy || qualitative.phase === 'step-failed'}><summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--accent-live)' }}>Internal run log · cost and runtime</summary><div style={{ display: 'grid', gap: 6, marginTop: 7 }}>{qualitative.logs.map((log, index) => <div key={index} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}><div>{log.step} · {log.engine || log.provider || 'Claude'} · {(Number(log.runtimeMs || 0) / 1000).toFixed(1)}s · cost {log.costUsd == null ? 'not returned' : `$${Number(log.costUsd).toFixed(6)}`}{log.stopReason ? ` · stop ${log.stopReason}` : ''}{log.validation ? ` · kept ${log.validation.kept}, dropped ${log.validation.dropped} (${Object.entries(log.validation.dropReasons || {}).map(([reason, count]) => `${reason}:${count}`).join(', ') || 'none'})` : ''}{log.error ? ` · ${log.error}` : ''}</div>{log.rawOutput && <details style={{ marginTop: 4 }}><summary style={{ cursor: 'pointer', color: 'var(--accent-highlight)' }}>Raw model output</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 280, overflow: 'auto', padding: 8, background: 'var(--bg-input)', borderRadius: 5 }}>{log.rawOutput}</pre></details>}</div>)}</div></details>}
        {qualitative.phase === 'complete' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 13, paddingTop: 12, borderTop: '1px solid var(--border)' }}><label style={{ fontSize: 11 }}>Client/PDF findings <select value={verifiedOnly ? 'verified' : 'all'} onChange={event => setVerifiedOnly(event.target.value === 'verified')} style={{ ...INPUT, width: 'auto', marginLeft: 6 }}><option value="verified">Verified only (default)</option><option value="all">All retained</option></select></label><label style={{ fontSize: 11 }}><input type="checkbox" checked={showThirdParties} onChange={event => setShowThirdParties(event.target.checked)}/> Show third-party company names</label><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{qualitative.findings.length} unique retained · {qualitative.findings.filter(item => item.corroborated).length} corroborated</span></div>}
        {!result && qualitative.phase === 'complete' && <QualitativeReport qualitative={qualitative} verifiedOnly={verifiedOnly} setVerified={setFindingVerified} showThirdParties={showThirdParties}/>}
      </section>

      {reviewFindings.length > 0 && <><CombinedReview findings={reviewFindings} onVerify={setFindingVerified}/><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}><button type="button" disabled={reviewBusy} onClick={resynthesizeVerified} style={{ ...INPUT, width: 'auto' }}>{reviewBusy ? 'Re-synthesizing…' : 'Re-synthesize from verified findings'}</button><label style={{ fontSize: 11 }}>Export AI findings <select value={verifiedOnly ? 'verified' : 'all'} onChange={event => setVerifiedOnly(event.target.value === 'verified')} style={{ ...INPUT, display: 'inline-block', width: 'auto', marginLeft: 6 }}><option value="verified">Verified only</option><option value="all">All</option></select></label></div></>}

      {result && <div style={{ marginTop: 36 }}>
        <div style={{ ...CARD, marginBottom: 10 }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>{Object.entries({ verified: 'Verified Metrics', directional: 'Directional Intelligence', qualitative: 'Qualitative Layer', appendix: 'Combined appendix', method: 'Method & privacy' }).map(([key, label]) => <label key={key} style={{ fontSize: 11 }}><input type="checkbox" checked={exportSections[key]} onChange={event => setExportSections(previous => ({ ...previous, [key]: event.target.checked }))}/> {label}</label>)}<button onClick={exportPdf} disabled={pdfLoading} style={{ ...INPUT, width: 'auto', marginLeft: 'auto', cursor: 'pointer' }}>{pdfLoading ? 'Rendering…' : 'Download PDF'}</button></div></div>
        <div ref={reportRef} style={{ background: 'var(--bg-primary)', padding: 2 }}>
          <section style={{ ...CARD, borderTop: '4px solid var(--accent-live)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-live)', fontSize: 10 }}>TOPICAL QUALITATIVE SCAN</div><span style={{ fontFamily: 'var(--font-mono)', color: result.claudeBackupUsed ? 'var(--accent-highlight)' : 'var(--text-faint)', fontSize: 10 }}>{result.claudeProvider}</span></div><h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, margin: '6px 0' }}>{result.projectName || `Project ${result.projectId}`}</h1><div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '7px 10px', margin: '2px 0 8px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}><span>Brand24 project</span><span style={{ color: 'var(--accent-live)' }}>{result.projectName || 'Unnamed project'} · {result.projectId}</span></div><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Requested period: {result.dateFrom}–{result.dateTo} · Monitoring coverage: {result.pull.coverageDateFrom && result.pull.coverageDateTo ? `${result.pull.coverageDateFrom}–${result.pull.coverageDateTo}` : 'No monitoring data'} · Generated {new Date(result.generatedAt).toLocaleString()}</p><p style={{ marginTop: 14, fontSize: 12, lineHeight: 1.6 }}>{result.coverageCaveat}</p></section>
          <div style={{ display: exportSections.verified ? 'block' : 'none' }}>{result.pull.countWarning && <section style={{ ...CARD, marginTop: 12, border: '2px solid var(--accent-negative-border)', background: 'var(--bg-panel-negative)', color: 'var(--accent-negative)' }}><strong style={{ display: 'block', fontSize: 14, marginBottom: 5 }}>Count does not match dashboard</strong><p style={{ fontSize: 12, lineHeight: 1.55 }}>{result.pull.countWarning}</p></section>}
          <h2 style={{ fontSize: 18, margin: '24px 0 10px' }}>Verified Metrics <span style={{ color: 'var(--text-faint)', fontWeight: 400, fontSize: 11 }}>mentions captured by monitoring · floor, not total</span></h2>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>{[
            ['All mentions', fmt(result.verified.baseline.totalMentions)], ['Total reach', fmt(result.verified.baseline.totalReach)], ['Collections-related', fmt(result.verified.baseline.collectionsRelatedMentions)], ['Share of conversation', pct(result.verified.baseline.collectionsShare)]
          ].map(([label, value]) => <div key={label} style={CARD}><div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>{label}</div><strong style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 28, marginTop: 6 }}>{value}</strong></div>)}</section>
          <p style={{ color: 'var(--text-faint)', fontSize: 11, marginTop: 8 }}>Audit: project ID {result.pull.projectIdConfirmed} · {fmt(result.pull.rawRetrieved)} raw rows across {result.pull.pages} API pages · {fmt(result.pull.duplicateMentions)} duplicates removed · {fmt(result.pull.retrieved)} unique Asia/Manila in-range mentions · Brand24 count endpoint {fmt(result.pull.apiCount)}{result.pull.expectedTotal != null ? ` · expected dashboard ${fmt(result.pull.expectedTotal)}` : ' · dashboard total not supplied'}.</p>
          <details style={{ marginTop: 8 }}><summary style={{ color: 'var(--accent-live)', cursor: 'pointer', fontSize: 11 }}>Monthly pull diagnostics</summary><div style={{ display: 'grid', gap: 5, marginTop: 7 }}>{result.pull.months.map(month => <div key={month.month} style={{ fontSize: 10, color: 'var(--text-muted)' }}>{month.month}: {fmt(month.rawRetrieved)} raw → {fmt(month.uniqueRetrieved)} unique → {fmt(month.inRange)} in Manila range · dates returned {month.minReturnedDate}–{month.maxReturnedDate} · {month.duplicatesRemoved} duplicates · {month.mentionsWithoutId} rows without exposed IDs</div>)}</div></details>
          {result.verified.themeResults.map((theme, index) => <section key={theme.label} style={{ ...CARD, marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><div><div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-live)' }}>T{index + 1}</div><h3 style={{ fontSize: 17, margin: '4px 0' }}>{theme.label}</h3><p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{theme.description}</p></div><div style={{ textAlign: 'right' }}><strong style={{ fontSize: 28, fontFamily: 'var(--font-display)' }}>{fmt(theme.count)}</strong><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{pct(theme.percentOfAll)} of all mentions</div></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 18 }}><div><h4 style={{ fontSize: 11, marginBottom: 9 }}>Platforms</h4><Bars values={theme.platforms}/></div><div><h4 style={{ fontSize: 11, marginBottom: 9 }}>Stance</h4><Bars values={theme.stances}/></div><div><h4 style={{ fontSize: 11, marginBottom: 9 }}>Monthly trend</h4><MonthlyTrend values={theme.monthly}/></div></div>
            <details style={{ marginTop: 16 }}><summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--accent-live)' }}>Review sample ({theme.reviewSample.length}; paraphrased)</summary><div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{theme.reviewSample.map(item => <div key={item.id} style={{ borderLeft: '2px solid var(--border-strong)', paddingLeft: 10, fontSize: 11, lineHeight: 1.5 }}><span style={{ color: 'var(--text-faint)' }}>{item.platform} · {item.stance} · {item.sentiment}</span><p>{item.paraphrase}</p>{item.url && <a href={item.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-live)' }}>Open source</a>}</div>)}</div></details>
          </section>)}</div>
          <div style={{ display: exportSections.directional ? 'block' : 'none' }}><h2 style={{ fontSize: 18, margin: '24px 0 10px' }}>Directional Intelligence <span style={{ color: 'var(--text-faint)', fontWeight: 400, fontSize: 11 }}>cited public-source discovery · not volume</span></h2>
          {result.directional.map(theme => { const summary = reviewSynthesis.directional[theme.label]; return <section key={theme.label} style={{ ...CARD, marginBottom: 12 }}><h3 style={{ fontSize: 16, marginBottom: 6 }}>{theme.label}</h3>{summary ? <p style={{ fontSize: 11, lineHeight: 1.5 }}>{summary.inPeriod || 'None found.'}</p> : <p style={{ color: 'var(--accent-highlight)', fontSize: 10 }}>Based on unverified findings; use “Re-synthesize from verified findings” before a verified-only export.</p>}{theme.sources.map(source => <div key={source.source} style={{ borderTop: '1px solid var(--border-subtle)', padding: '10px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong style={{ fontSize: 12 }}>{source.source}</strong><StatusBadge status={source.status}/></div>{source.status === 'unavailable' && <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 5 }}>{source.source} unavailable this run.</p>}{source.discarded > 0 && <p style={{ color: 'var(--accent-highlight)', fontSize: 10 }}>{source.discarded} unverified, uncited, undated, or out-of-range finding(s) discarded.</p>}{source.status === 'complete' && !source.findings.length && <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 5 }}>No brand-specific cited signal found.</p>}{source.findings.filter(finding => !verifiedOnly || verifiedUrls[finding.url]).map(finding => <p key={finding.url} style={{ fontSize: 11, lineHeight: 1.5, marginTop: 7 }}><span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{finding.date}{finding.dateEstimated ? ' (estimated)' : ''}</span> · {finding.paraphrase} <a href={finding.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-live)' }}>Source</a></p>)}</div>)}{theme.manualNotes && <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}><strong style={{ fontSize: 12 }}>Manual public-Facebook notes</strong><p style={{ fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>{theme.manualNotes}</p></div>}</section>; })}</div>
          <div style={{ display: exportSections.qualitative ? 'block' : 'none' }}><QualitativeReport qualitative={{ ...qualitative, findings: qualitative.findings.map(item => ({ ...item, verified: Boolean(verifiedUrls[item.url]) })), synthesis: verifiedOnly ? reviewSynthesis.qualitative : qualitative.synthesis }} verifiedOnly={verifiedOnly} setVerified={setFindingVerified} showThirdParties={showThirdParties}/>{verifiedOnly && !Object.keys(reviewSynthesis.qualitative).length && <p style={{ color: 'var(--accent-highlight)', fontSize: 10 }}>Verified-only synthesis has not been generated; use “Re-synthesize from verified findings”.</p>}{!verifiedOnly && <p style={{ color: 'var(--accent-highlight)', fontSize: 10 }}>Qualitative synthesis is based on unverified findings.</p>}</div>
          <div style={{ display: exportSections.appendix ? 'block' : 'none' }}><h2 style={{ fontSize: 18, margin: '24px 0 10px' }}>Combined Source Appendix</h2><section style={CARD}><ol style={{ margin: 0, paddingLeft: 20 }}>{exportFindings.map(finding => <li key={finding.url} style={{ fontSize: 11, lineHeight: 1.55, marginBottom: 10 }}><strong>{finding.sections.join(' + ')}</strong> · {finding.date}{finding.dateEstimated ? ' (estimated)' : ''} · {finding.themes.join(', ')} · {finding.paraphrase}<br/><span style={{ color: 'var(--text-faint)' }}>{finding.engines.join(', ')}</span><br/><a href={finding.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-live)', overflowWrap: 'anywhere' }}>{finding.url}</a></li>)}</ol></section></div>
          <section style={{ ...CARD, display: exportSections.method ? 'block' : 'none', marginTop: 18, background: 'var(--bg-surface-subtle)' }}><h3 style={{ fontSize: 13, marginBottom: 6 }}>Method & privacy</h3><p style={{ fontSize: 11, lineHeight: 1.6 }}>{result.privacyNote} Theme counts may overlap. AI-source URLs come only from provider citation metadata and are validated and dated server-side. Directional Intelligence: {reviewFindings.filter(item => item.sections.includes('Directional Intelligence') && item.verified).length}/{reviewFindings.filter(item => item.sections.includes('Directional Intelligence')).length} analyst-verified. Qualitative Layer: {reviewFindings.filter(item => item.sections.includes('Qualitative Layer') && item.verified).length}/{reviewFindings.filter(item => item.sections.includes('Qualitative Layer')).length} analyst-verified. {reviewFindings.some(item => item.dateEstimated) ? 'Dates estimated from post IDs where Reddit metadata was unavailable. ' : ''}Posts are user claims, not verified account data or company policy. Co-occurrence with business news is not causation. Classification provider: {result.claudeProvider}. Timezone: {result.timezone}.</p><p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 7 }}>{result.filterAudit}</p></section>
        </div>
      </div>}
    </div>
  </main>;
}
