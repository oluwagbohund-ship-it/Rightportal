const PUBLIC_HTML_MAP: Record<string, string> = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/about': 'about.html',
  '/about.html': 'about.html',
  '/features': 'features.html',
  '/features.html': 'features.html',
  '/contact': 'contact.html',
  '/contact.html': 'contact.html',
  '/register': 'register.html',
  '/register.html': 'register.html',
};

export function resolvePublicHtmlFile(pathname: string): string {
  const normalized = pathname.trim() || '/';
  return PUBLIC_HTML_MAP[normalized] ?? 'index.html';
}

export function rewriteDevPublicUrl(url: string): string {
  const qIndex = url.indexOf('?');
  const pathname = qIndex >= 0 ? url.slice(0, qIndex) : url;
  const query = qIndex >= 0 ? url.slice(qIndex) : '';

  if (
    pathname === '/about' ||
    pathname === '/features' ||
    pathname === '/contact' ||
    pathname === '/register'
  ) {
    return `${pathname}.html${query}`;
  }

  return url;
}
