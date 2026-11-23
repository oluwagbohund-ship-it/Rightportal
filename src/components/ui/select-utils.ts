import React from 'react';

export interface ParsedSelectOption {
  value: string;
  label: string;
  disabled: boolean;
}

export function extractTextFromReactNode(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((child) => extractTextFromReactNode(child)).join('');
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractTextFromReactNode(node.props.children);
  }
  return '';
}

export function parseSelectOptions(children: React.ReactNode): ParsedSelectOption[] {
  const options: ParsedSelectOption[] = [];

  const visit = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) {
        return;
      }
      if (child.type === React.Fragment) {
        const fragProps = child.props as { children?: React.ReactNode };
        visit(fragProps.children);
        return;
      }
      if (typeof child.type === 'string' && child.type === 'option') {
        const optProps = child.props as {
          value?: string | number;
          disabled?: boolean;
          children?: React.ReactNode;
        };
        const label = extractTextFromReactNode(optProps.children).trim();
        const value =
          optProps.value !== undefined && optProps.value !== null
            ? String(optProps.value)
            : label;
        options.push({
          value,
          label: label || value,
          disabled: Boolean(optProps.disabled),
        });
        return;
      }
      if (typeof child.type === 'string' && child.type === 'optgroup') {
        const grpProps = child.props as { children?: React.ReactNode };
        visit(grpProps.children);
      }
    });
  };

  visit(children);
  return options;
}

export function getNextOptionIndex(
  options: ParsedSelectOption[],
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) return -1;
  const enabledCount = options.filter((o) => !o.disabled).length;
  if (enabledCount === 0) return -1;

  let idx = currentIndex;
  for (let step = 0; step < options.length; step++) {
    idx = (idx + direction + options.length) % options.length;
    if (!options[idx].disabled) {
      return idx;
    }
  }
  return -1;
}

export function getEdgeOptionIndex(
  options: ParsedSelectOption[],
  edge: 'first' | 'last',
): number {
  if (options.length === 0) return -1;
  if (edge === 'first') {
    return options.findIndex((o) => !o.disabled);
  }
  for (let i = options.length - 1; i >= 0; i--) {
    if (!options[i].disabled) return i;
  }
  return -1;
}
