import './globals.css';

export const metadata = {
  title: 'Signal Intel v3 · Praxis Experiential',
  description: '6-agent social intelligence pipeline powered by Signal Intel + Grok + Claude',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
