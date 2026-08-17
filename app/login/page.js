export const metadata = {
  title: 'Signal Intel Access',
};

export default function LoginPage({ searchParams }) {
  const hasError = searchParams?.error === '1';
  const nextPath = typeof searchParams?.next === 'string' ? searchParams.next : '/';

  return (
    <main style={{ minHeight:'100vh', display:'grid', placeItems:'center', padding:24, background:'var(--bg-primary)', color:'var(--text-primary)' }}>
      <form action="/auth/login" method="post" style={{ width:'100%', maxWidth:380, background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:10, padding:'26px 28px' }}>
        <div style={{ color:'var(--accent-live)', fontFamily:"'JetBrains Mono', monospace", fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:8 }}>
          Signal Intel Demo
        </div>
        <h1 style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:32, lineHeight:1, margin:'0 0 8px' }}>Team Access</h1>
        <p style={{ color:'var(--text-muted)', fontSize:13, lineHeight:1.6, margin:'0 0 22px' }}>
          Enter the shared Praxis demo password to continue.
        </p>
        <input type="hidden" name="next" value={nextPath} />
        <label style={{ display:'block', color:'var(--text-muted)', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:8 }}>
          Password
        </label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          style={{ width:'100%', boxSizing:'border-box', background:'var(--bg-surface-subtle)', border:'1px solid var(--border-strong)', borderRadius:6, padding:'12px 14px', color:'var(--text-primary)', fontSize:15, marginBottom:12 }}
        />
        {hasError && (
          <div style={{ color:'var(--accent-negative)', fontSize:12, lineHeight:1.55, background:'var(--bg-panel-negative)', border:'1px solid var(--accent-negative-border)', borderRadius:6, padding:'9px 11px', marginBottom:12 }}>
            Incorrect password. Please try again.
          </div>
        )}
        <button type="submit" style={{ width:'100%', background:'var(--accent-live)', border:'1px solid var(--accent-live)', borderRadius:6, padding:'12px 14px', color:'var(--text-inverse)', cursor:'pointer', fontSize:13, fontWeight:800 }}>
          Continue
        </button>
      </form>
    </main>
  );
}
