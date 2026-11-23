import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptIdCardToken,
  encryptIdCardToken,
  evaluateIdCardValidity,
  extractIdCardTokenFromScan,
  formatIdCardNumber,
  generateIdCardQrToken,
  ID_CARD_TOKEN_PREFIX,
} from './id-card-helpers.ts';

test('generateIdCardQrToken creates high-entropy prefixed tokens', () => {
  const t1 = generateIdCardQrToken();
  const t2 = generateIdCardQrToken();
  assert.ok(t1.startsWith(ID_CARD_TOKEN_PREFIX));
  assert.ok(t1.length >= 32);
  assert.notEqual(t1, t2);
});

test('formatIdCardNumber formats zero-padded sequence with year', () => {
  assert.equal(formatIdCardNumber(1, 2026), 'DT-IDC-2026-0001');
  assert.equal(formatIdCardNumber(42, 2026), 'DT-IDC-2026-0042');
  assert.equal(formatIdCardNumber(12345, 2026), 'DT-IDC-2026-12345');
});

test('extractIdCardTokenFromScan extracts token from raw string, JSON, and URL payloads', () => {
  const token = 'DTID-AbCdEf123456_7890';
  assert.equal(extractIdCardTokenFromScan(`  ${token}  `), token);
  assert.equal(extractIdCardTokenFromScan(JSON.stringify({ token })), token);
  assert.equal(
    extractIdCardTokenFromScan(`https://school.example/login?token=${encodeURIComponent(token)}`),
    token,
  );
  assert.equal(extractIdCardTokenFromScan(''), '');
});

test('encryptIdCardToken and decryptIdCardToken round-trip safely and reject tampering', () => {
  const secret = 'test-master-secret-at-least-32-chars!!';
  const rawToken = generateIdCardQrToken();
  const encrypted = encryptIdCardToken(rawToken, secret);

  assert.notEqual(encrypted, rawToken);
  assert.equal(decryptIdCardToken(encrypted, secret), rawToken);
  assert.equal(decryptIdCardToken(encrypted, 'wrong-secret-key-should-fail'), null);

  const tampered = `${encrypted.slice(0, -4)}XXXX`;
  assert.equal(decryptIdCardToken(tampered, secret), null);
});

test('evaluateIdCardValidity enforces active, unrevoked, unexpired cards', () => {
  const now = Date.parse('2026-11-23T12:00:00.000Z');
  const future = '2027-11-23T12:00:00.000Z';
  const past = '2026-11-22T12:00:00.000Z';

  assert.equal(
    evaluateIdCardValidity({ status: 'active', expires_at: future, revoked_at: null }, now).valid,
    true,
  );
  assert.equal(
    evaluateIdCardValidity(
      { status: 'revoked', expires_at: future, revoked_at: '2026-11-20T00:00:00Z' },
      now,
    ).valid,
    false,
  );
  assert.equal(
    evaluateIdCardValidity({ status: 'active', expires_at: past, revoked_at: null }, now).valid,
    false,
  );
  assert.equal(
    evaluateIdCardValidity({ status: 'expired', expires_at: future, revoked_at: null }, now).valid,
    false,
  );
});
