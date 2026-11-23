import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublicHtmlFile, rewriteDevPublicUrl } from './public-pages.ts';

test('resolvePublicHtmlFile maps each public route and .html path to its dedicated HTML entry', () => {
  assert.equal(resolvePublicHtmlFile('/'), 'index.html');
  assert.equal(resolvePublicHtmlFile('/index.html'), 'index.html');
  assert.equal(resolvePublicHtmlFile('/about'), 'about.html');
  assert.equal(resolvePublicHtmlFile('/about.html'), 'about.html');
  assert.equal(resolvePublicHtmlFile('/features'), 'features.html');
  assert.equal(resolvePublicHtmlFile('/features.html'), 'features.html');
  assert.equal(resolvePublicHtmlFile('/contact'), 'contact.html');
  assert.equal(resolvePublicHtmlFile('/contact.html'), 'contact.html');
  assert.equal(resolvePublicHtmlFile('/register'), 'register.html');
  assert.equal(resolvePublicHtmlFile('/register.html'), 'register.html');
  assert.equal(resolvePublicHtmlFile('/dashboard/owner'), 'index.html');
});

test('rewriteDevPublicUrl maps clean public paths to their Vite HTML entries while preserving query strings', () => {
  assert.equal(rewriteDevPublicUrl('/about'), '/about.html');
  assert.equal(rewriteDevPublicUrl('/features?tab=1'), '/features.html?tab=1');
  assert.equal(rewriteDevPublicUrl('/contact'), '/contact.html');
  assert.equal(rewriteDevPublicUrl('/register'), '/register.html');
  assert.equal(rewriteDevPublicUrl('/about.html'), '/about.html');
  assert.equal(rewriteDevPublicUrl('/login/school'), '/login/school');
});
