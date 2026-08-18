'use client';

import { useMemo, useState } from 'react';
import ThemeToggle from '../theme-toggle';

const LIME = 'var(--accent-live)';
const CARD = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 18 };
const LANGUAGES = ['', 'english', 'indonesian', 'thai', 'vietnamese', 'spanish', 'french', 'german', 'korean'];

function blankMonitor(role = 'competitor') {
  return {
    role,
    name: '',
    keywords: [{ keyword: '', requiredText: '', excludedText: '' }],
  };
}

function splitWords(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function normalizeMonitor(monitor) {
  return {
    role: monitor.role,
    name: monitor.name.trim(),
    keywords: monitor.keywords
      .map(item => ({
        keyword: item.keyword.trim(),
        required: splitWords(item.requiredText),
        excluded: splitWords(item.excludedText),
      }))
      .filter(item => item.keyword),
  };
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 7 }}>{label}</span>
      {children}
    </label>
  );
}

function TextInput(props) {
  return <input {...props} style={{ width: '100%', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', padding: '11px 12px', fontSize: 13, ...(props.style || {}) }} />;
}

function MonitorEditor({ monitor, index, onChange, onRemove, canRemove }) {
  const updateKeyword = (keywordIndex, key, value) => {
    const keywords = monitor.keywords.map((item, i) => i === keywordIndex ? { ...item, [key]: value } : item);
    onChange({ ...monitor, keywords });
  };
  const addKeyword = () => onChange({ ...monitor, keywords: [...monitor.keywords, { keyword: '', requiredText: '', excludedText: '' }] });
  const removeKeyword = keywordIndex => onChange({ ...monitor, keywords: monitor.keywords.filter((_, i) => i !== keywordIndex) });

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ color: monitor.role === 'primary' ? LIME : 'var(--text-muted)', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>
            {monitor.role === 'primary' ? 'Primary Monitor' : `Competitor Monitor ${index}`}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Competitors are created as separate linked monitors.</div>
        </div>
        {canRemove && <button type="button" onClick={onRemove} style={{ background: 'var(--bg-surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--text-faint)', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' }}>Remove</button>}
      </div>

      <Field label="Monitor Name">
        <TextInput value={monitor.name} onChange={e => onChange({ ...monitor, name: e.target.value })} placeholder={monitor.role === 'primary' ? 'Netflix Philippines' : 'Viu Philippines'} />
      </Field>

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {monitor.keywords.map((keyword, keywordIndex) => (
          <div key={keywordIndex} style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, alignItems: 'end' }}>
              <Field label="Track Mentions Of">
                <TextInput value={keyword.keyword} onChange={e => updateKeyword(keywordIndex, 'keyword', e.target.value)} placeholder="netflix" />
              </Field>
              <Field label="Must Include">
                <TextInput value={keyword.requiredText} onChange={e => updateKeyword(keywordIndex, 'requiredText', e.target.value)} placeholder="philippines, streaming" />
              </Field>
              <Field label="Exclude Mentions With">
                <TextInput value={keyword.excludedText} onChange={e => updateKeyword(keywordIndex, 'excludedText', e.target.value)} placeholder="jobs, hiring" />
              </Field>
              <button type="button" onClick={() => removeKeyword(keywordIndex)} disabled={monitor.keywords.length === 1} style={{ height: 39, minWidth: 39, background: 'var(--bg-surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '0 10px', cursor: monitor.keywords.length === 1 ? 'default' : 'pointer' }}>×</button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={addKeyword} style={{ marginTop: 10, background: 'var(--bg-surface-muted)', color: LIME, border: `1px solid var(--accent-live-border)`, borderRadius: 6, padding: '9px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>+ Add keyword rule</button>
    </div>
  );
}

export default function SetupPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [philippinesOnly, setPhilippinesOnly] = useState(true);
  const [language, setLanguage] = useState('english');
  const [accountId, setAccountId] = useState('');
  const [monitors, setMonitors] = useState([blankMonitor('primary')]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const payload = useMemo(() => {
    const normalized = monitors.map(normalizeMonitor).filter(monitor => monitor.name && monitor.keywords.length);
    return {
      primaryBrand: normalized.find(item => item.role === 'primary')?.name || '',
      dateRange: { dateFrom, dateTo },
      philippinesOnly,
      language,
      accountId: accountId.trim(),
      monitors: normalized,
    };
  }, [accountId, dateFrom, dateTo, language, monitors, philippinesOnly]);

  const updateMonitor = (index, next) => setMonitors(items => items.map((item, i) => i === index ? next : item));
  const addCompetitor = () => setMonitors(items => [...items, blankMonitor('competitor')]);

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      if (!payload.primaryBrand) throw new Error('Add a primary monitor before creating the setup.');
      if (!dateFrom || !dateTo) throw new Error('Choose the initial report date range.');
      const response = await fetch('/api/tracking/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `Setup failed with ${response.status}`);
      const setups = JSON.parse(localStorage.getItem('signalIntelSetups') || '[]');
      localStorage.setItem('signalIntelSetups', JSON.stringify([data.setup, ...setups].slice(0, 20)));
      setResult(data.setup);
    } catch (err) {
      setError(err.message || 'Could not create this setup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', padding: '34px 22px', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ color: LIME, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.2em', marginBottom: 8 }}>SIGNAL INTEL · SETUP</div>
            <h1 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 42, margin: 0 }}>New Tracking Source</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, margin: '6px 0 0' }}>Create linked monitors for a primary brand and its competitors, then save the report settings Signal Intel needs for the first pull.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <ThemeToggle />
            <a href="/" style={{ color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '9px 12px', textDecoration: 'none', fontSize: 12 }}>Back to Reports</a>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <div style={{ ...CARD, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Field label="Initial Pull From"><TextInput type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></Field>
            <Field label="Initial Pull To"><TextInput type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></Field>
            <Field label="Language">
              <select value={language} onChange={e => setLanguage(e.target.value)} style={{ width: '100%', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', padding: '11px 12px', fontSize: 13 }}>
                {LANGUAGES.map(item => <option key={item || 'all'} value={item}>{item || 'All languages'}</option>)}
              </select>
            </Field>
            <Field label="Market Filter">
              <button type="button" onClick={() => setPhilippinesOnly(value => !value)} style={{ width: '100%', height: 41, background: philippinesOnly ? 'var(--accent-live-soft)' : 'var(--bg-surface-subtle)', color: philippinesOnly ? LIME : 'var(--text-muted)', border: `1px solid ${philippinesOnly ? 'var(--accent-live-border)' : 'var(--border-strong)'}`, borderRadius: 6, cursor: 'pointer', fontWeight: 800 }}>
                {philippinesOnly ? 'Philippines only' : 'All markets'}
              </button>
            </Field>
            <Field label="Workspace Account">
              <TextInput value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="Optional when env is set" />
            </Field>
          </div>

          {monitors.map((monitor, index) => (
            <MonitorEditor
              key={index}
              monitor={monitor}
              index={index}
              onChange={next => updateMonitor(index, next)}
              canRemove={monitor.role !== 'primary'}
              onRemove={() => setMonitors(items => items.filter((_, i) => i !== index))}
            />
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={addCompetitor} style={{ background: 'var(--bg-surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--text-faint)', borderRadius: 6, padding: '12px 15px', cursor: 'pointer', fontWeight: 800 }}>+ Add competitor monitor</button>
            <button disabled={loading} style={{ background: loading ? 'var(--bg-surface-muted)' : LIME, color: 'var(--text-inverse)', border: 'none', borderRadius: 6, padding: '13px 20px', cursor: loading ? 'default' : 'pointer', fontWeight: 900 }}>
              {loading ? 'Creating...' : 'Create Tracking Sources'}
            </button>
          </div>
        </form>

        {error && <div style={{ marginTop: 14, background: 'var(--bg-panel-negative)', border: '1px solid var(--accent-negative-border)', color: 'var(--accent-negative)', borderRadius: 8, padding: 12, fontSize: 13 }}>{error}</div>}
        {result && (
          <div style={{ marginTop: 14, background: 'var(--bg-panel-positive)', border: `1px solid var(--accent-live-border)`, borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
              <div>
                <div style={{ color: LIME, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono',monospace", marginBottom: 8 }}>Setup Created</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{result.monitors.length} linked monitor{result.monitors.length === 1 ? '' : 's'} are ready for Signal Intel.</div>
              </div>
              <a href={`/?brand=${encodeURIComponent(result.primaryBrand || '')}`} style={{ background: LIME, color: 'var(--text-inverse)', border: 'none', borderRadius: 6, padding: '10px 14px', textDecoration: 'none', fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }}>Run Report</a>
            </div>
            <div style={{ display: 'grid', gap: 7 }}>
              {result.monitors.map(item => (
                <div key={`${item.role}-${item.name}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, background: 'var(--bg-surface-subtle)', border: '1px solid var(--border)', borderRadius: 6, padding: '9px 10px', fontSize: 12 }}>
                  <span>{item.role === 'primary' ? 'Primary' : 'Competitor'} · {item.name}</span>
                  <span style={{ color: LIME, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>READY</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
