export const metadata = {
  title: 'Signal Intel Access',
};

export default function LoginPage({ searchParams }) {
  const hasError = searchParams?.error === '1';
  const nextPath = typeof searchParams?.next === 'string' ? searchParams.next : '/';

  return (
    <main style={{ minHeight:'100vh', display:'grid', placeItems:'center', padding:24, background:'#050505', color:'#f0f0f0' }}>
      <form action="/auth/login" method="post" style={{ width:'100%', maxWidth:380, background:'#0b0b0b', border:'1px solid #25200f', borderRadius:10, padding:'26px 28px', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ color:'#CCFF00', fontFamily:"'JetBrains Mono', monospace", fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:8 }}>
          Signal Intel Demo
        </div>
        <h1 style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:32, lineHeight:1, margin:'0 0 8px' }}>Team Access</h1>
        <p style={{ color:'#777', fontSize:13, lineHeight:1.6, margin:'0 0 22px' }}>
          Enter the shared Praxis demo password to continue.
        </p>
        <input type="hidden" name="next" value={nextPath} />
        <label style={{ display:'block', color:'#666', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:8 }}>
          Password
        </label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          style={{ width:'100%', boxSizing:'border-box', background:'#111', border:'1px solid #2a2a2a', borderRadius:6, padding:'12px 14px', color:'#f0f0f0', fontSize:15, marginBottom:12 }}
        />
        {hasError && (
          <div style={{ color:'#ffb0b0', fontSize:12, lineHeight:1.55, background:'#1a0000', border:'1px solid #ff444433', borderRadius:6, padding:'9px 11px', marginBottom:12 }}>
            Incorrect password. Please try again.
          </div>
        )}
        <button type="submit" style={{ width:'100%', background:'#CCFF00', border:'1px solid #CCFF00', borderRadius:6, padding:'12px 14px', color:'#111', cursor:'pointer', fontSize:13, fontWeight:800 }}>
          Continue
        </button>
      </form>
    </main>
  );
}
