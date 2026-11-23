import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {
  extractTextFromReactNode,
  getEdgeOptionIndex,
  getNextOptionIndex,
  parseSelectOptions,
} from './select-utils.ts';

test('extractTextFromReactNode flattens strings, numbers, and arrays', () => {
  assert.equal(extractTextFromReactNode(['JSS 1', ' (', 2026, ')']), 'JSS 1 (2026)');
  assert.equal(extractTextFromReactNode(null), '');
});

test('parseSelectOptions extracts option values, labels, and disabled states including fragments', () => {
  const tree = React.createElement(
    React.Fragment,
    null,
    React.createElement('option', { value: '' }, 'Never expires'),
    React.createElement('option', { value: '7' }, 7, ' days'),
    React.createElement('option', { value: '30', disabled: true }, '30 days'),
  );

  const parsed = parseSelectOptions(tree);
  assert.deepEqual(parsed, [
    { value: '', label: 'Never expires', disabled: false },
    { value: '7', label: '7 days', disabled: false },
    { value: '30', label: '30 days', disabled: true },
  ]);
});

test('getNextOptionIndex skips disabled options and wraps cleanly', () => {
  const options = [
    { value: 'a', label: 'A', disabled: false },
    { value: 'b', label: 'B', disabled: true },
    { value: 'c', label: 'C', disabled: false },
  ];

  assert.equal(getNextOptionIndex(options, 0, 1), 2);
  assert.equal(getNextOptionIndex(options, 2, 1), 0);
  assert.equal(getNextOptionIndex(options, 2, -1), 0);
  assert.equal(getEdgeOptionIndex(options, 'first'), 0);
  assert.equal(getEdgeOptionIndex(options, 'last'), 2);
});
