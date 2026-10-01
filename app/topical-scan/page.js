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

  useEffect(() => {
    fetch('/api/tracking/projects').then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load monitoring projects.');
      setProjects(data.projects || []);
    }).catch(err => setProjectError(err.message));
  }, []);

  const selectedProject = useMemo(() => projects.find(project => String(project.id || project.project_id || project.projectId) === String(form.projectId)), [projects, form.projectId]);
  const setField = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const setTheme = (index, key, value) => setForm(previous => ({ ...previous, themes: previous.themes.map((theme, themeIndex) => themeIndex === index ? { ...theme, [key]: value } : theme) }));
  const removeTheme = index => setForm(previous => ({ ...previous, themes: previous.themes.filter((_, themeIndex) => themeIndex !== index) }));
  const addTheme = () => setForm(previous => ({ ...previous, themes: [...previous.themes, { label: '', description: '', phrases: '', manualNotes: '' }] }));

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

      {result && <div style={{ marginTop: 36 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}><button onClick={exportPdf} disabled={pdfLoading} style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>{pdfLoading ? 'Rendering…' : 'Export PDF'}</button></div>
        <div ref={reportRef} style={{ background: 'var(--bg-primary)', padding: 2 }}>
          <section style={{ ...CARD, borderTop: '4px solid var(--accent-live)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-live)', fontSize: 10 }}>TOPICAL QUALITATIVE SCAN</div><span style={{ fontFamily: 'var(--font-mono)', color: result.claudeBackupUsed ? 'var(--accent-highlight)' : 'var(--text-faint)', fontSize: 10 }}>{result.claudeProvider}</span></div><h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, margin: '6px 0' }}>{result.projectName || `Project ${result.projectId}`}</h1><div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '7px 10px', margin: '2px 0 8px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}><span>Brand24 project</span><span style={{ color: 'var(--accent-live)' }}>{result.projectName || 'Unnamed project'} · {result.projectId}</span></div><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Requested period: {result.dateFrom}–{result.dateTo} · Monitoring coverage: {result.pull.coverageDateFrom && result.pull.coverageDateTo ? `${result.pull.coverageDateFrom}–${result.pull.coverageDateTo}` : 'No monitoring data'} · Generated {new Date(result.generatedAt).toLocaleString()}</p><p style={{ marginTop: 14, fontSize: 12, lineHeight: 1.6 }}>{result.coverageCaveat}</p></section>
          {result.pull.countWarning && <section style={{ ...CARD, marginTop: 12, border: '2px solid var(--accent-negative-border)', background: 'var(--bg-panel-negative)', color: 'var(--accent-negative)' }}><strong style={{ display: 'block', fontSize: 14, marginBottom: 5 }}>Count does not match dashboard</strong><p style={{ fontSize: 12, lineHeight: 1.55 }}>{result.pull.countWarning}</p></section>}
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
          </section>)}
          <h2 style={{ fontSize: 18, margin: '24px 0 10px' }}>Directional Intelligence <span style={{ color: 'var(--text-faint)', fontWeight: 400, fontSize: 11 }}>cited public-source discovery · not volume</span></h2>
          {result.directional.map(theme => <section key={theme.label} style={{ ...CARD, marginBottom: 12 }}><h3 style={{ fontSize: 16, marginBottom: 12 }}>{theme.label}</h3>{theme.sources.map(source => <div key={source.source} style={{ borderTop: '1px solid var(--border-subtle)', padding: '10px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong style={{ fontSize: 12 }}>{source.source}</strong><StatusBadge status={source.status}/></div>{source.status === 'unavailable' && <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 5 }}>{source.source} unavailable this run.</p>}{source.discarded > 0 && <p style={{ color: 'var(--accent-highlight)', fontSize: 10 }}>{source.discarded} unverified, uncited, undated, or out-of-range finding(s) discarded.</p>}{source.status === 'complete' && !source.findings.length && <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 5 }}>No brand-specific cited signal found.</p>}{source.findings.map(finding => <p key={finding.url} style={{ fontSize: 11, lineHeight: 1.5, marginTop: 7 }}><span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{finding.date}{finding.dateEstimated ? ' (estimated)' : ''}</span> · {finding.paraphrase} <a href={finding.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-live)' }}>Source</a></p>)}</div>)}{theme.manualNotes && <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}><strong style={{ fontSize: 12 }}>Manual public-Facebook notes</strong><p style={{ fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>{theme.manualNotes}</p></div>}</section>)}
          <h2 style={{ fontSize: 18, margin: '24px 0 10px' }}>Appendix · AI Source Audit</h2>
          <section style={CARD}>{result.directional.map((theme, themeIndex) => { const findings = theme.sources.flatMap(source => source.findings.map(finding => ({ ...finding, source: source.source }))); return <div key={theme.label} style={{ borderTop: themeIndex ? '1px solid var(--border-subtle)' : 0, padding: themeIndex ? '16px 0 0' : 0, marginTop: themeIndex ? 16 : 0 }}><h3 style={{ fontSize: 15, marginBottom: 8 }}>{theme.label}</h3>{findings.length ? <ol style={{ margin: 0, paddingLeft: 20 }}>{findings.map(finding => <li key={`${finding.source}-${finding.url}`} style={{ fontSize: 11, lineHeight: 1.55, marginBottom: 10 }}><strong>{finding.source}</strong> · <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>{finding.date}{finding.dateEstimated ? ' (estimated)' : ''}</span> · {finding.paraphrase}<br/><a href={finding.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-live)', overflowWrap: 'anywhere' }}>{finding.url}</a></li>)}</ol> : <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>No cited AI-source URLs for this theme.</p>}</div>; })}</section>
          <section style={{ ...CARD, marginTop: 18, background: 'var(--bg-surface-subtle)' }}><h3 style={{ fontSize: 13, marginBottom: 6 }}>Method & privacy</h3><p style={{ fontSize: 11, lineHeight: 1.6 }}>{result.privacyNote} Theme counts may overlap because a mention can match more than one theme. AI-source findings without working-format URLs are discarded. “No signal found” is retained as a valid result. Classification provider: {result.claudeProvider}. Timezone: {result.timezone}; month buckets are restricted to the selected range.</p><p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 7 }}>{result.filterAudit}</p></section>
        </div>
      </div>}
    </div>
  </main>;
}
