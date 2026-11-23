import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAccessCodeStatus,
  generateUniqueSchoolAccessCode,
  normalizeSchoolAccessCode,
} from './access-code-helpers.ts';

test('normalizeSchoolAccessCode trims whitespace and uppercases input', () => {
  assert.equal(normalizeSchoolAccessCode('  dt-7k9m2p  '), 'DT-7K9M2P');
  assert.equal(normalizeSchoolAccessCode('rightec-2026'), 'RIGHTEC-2026');
});

test('generateUniqueSchoolAccessCode creates prefixed uppercase codes with unambiguous characters', () => {
  const code = generateUniqueSchoolAccessCode();
  assert.match(code, /^DT-[A-HJ-NP-Z2-9]{6}$/);

  const customPrefix = generateUniqueSchoolAccessCode('sch');
  assert.match(customPrefix, /^SCH-[A-HJ-NP-Z2-9]{6}$/);
});

test('evaluateAccessCodeStatus validates available, used, revoked, and expired codes', () => {
  assert.equal(evaluateAccessCodeStatus(null).valid, false);
  assert.equal(
    evaluateAccessCodeStatus({ status: 'used', expires_at: null }).valid,
    false,
  );
  assert.equal(
    evaluateAccessCodeStatus({ status: 'revoked', expires_at: null }).valid,
    false,
  );

  const now = Date.parse('2026-11-23T12:00:00.000Z');
  assert.equal(
    evaluateAccessCodeStatus(
      { status: 'available', expires_at: '2026-11-22T12:00:00.000Z' },
      now,
    ).valid,
    false,
  );
  assert.equal(
    evaluateAccessCodeStatus(
      { status: 'available', expires_at: '2026-11-24T12:00:00.000Z' },
      now,
    ).valid,
    true,
  );
  assert.equal(
    evaluateAccessCodeStatus({ status: 'available', expires_at: null }, now).valid,
    true,
  );
});
