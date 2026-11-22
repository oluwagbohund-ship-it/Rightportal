import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAdmissionNumber,
  formatApplicationReference,
  normalizePagination,
} from './school-helpers.ts';

test('formatAdmissionNumber supports custom templates, school code, year, and padded sequence', () => {
  const num = formatAdmissionNumber({
    template: '{PREFIX}/{CODE}/{YEAR}/{SEQ}',
    prefix: 'dte',
    schoolCode: 'alpha-01',
    year: 2026,
    seq: 7,
  });
  assert.equal(num, 'DTE/ALPHA-01/2026/0007');

  const fallbackSeq = formatAdmissionNumber({
    template: '{PREFIX}-{YEAR}',
    prefix: 'adm',
    schoolCode: 'sch',
    year: 2026,
    seq: 42,
  });
  assert.equal(fallbackSeq, 'ADM-2026-0042');
});

test('formatApplicationReference formats standardized admission references', () => {
  const ref = formatApplicationReference({
    prefix: 'app',
    schoolCode: 'beta',
    year: 2026,
    seq: 12,
  });
  assert.equal(ref, 'APP-BETA-2026-0012');
});

test('normalizePagination bounds page and limit safely', () => {
  assert.deepEqual(normalizePagination('0', '999', 50), { page: 1, limit: 50, offset: 0 });
  assert.deepEqual(normalizePagination('3', '15', 50), { page: 3, limit: 15, offset: 30 });
  assert.deepEqual(normalizePagination('invalid', 'bad', 50), { page: 1, limit: 20, offset: 0 });
});
