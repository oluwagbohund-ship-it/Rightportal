import * as React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils.ts';
import {
  getEdgeOptionIndex,
  getNextOptionIndex,
  parseSelectOptions,
} from './select-utils.ts';

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  children?: React.ReactNode;
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      className,
      children,
      value,
      defaultValue,
      onChange,
      disabled,
      required,
      id,
      name,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      ...props
    },
    ref,
  ) => {
    const options = React.useMemo(() => parseSelectOptions(children), [children]);
    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState<string>(() => {
      if (defaultValue !== undefined) return String(defaultValue);
      return options[0]?.value ?? '';
    });

    const currentValue = isControlled ? String(value ?? '') : uncontrolledValue;

    const selectedOption = React.useMemo(() => {
      return options.find((opt) => opt.value === currentValue) ?? null;
    }, [options, currentValue]);

    const [open, setOpen] = React.useState(false);
    const [highlightedIndex, setHighlightedIndex] = React.useState<number>(-1);
    const [menuStyle, setMenuStyle] = React.useState<{
      top: number;
      left: number;
      width: number;
      maxHeight: number;
      placement: 'bottom' | 'top';
    } | null>(null);

    const triggerRef = React.useRef<HTMLButtonElement | null>(null);
    const listboxRef = React.useRef<HTMLDivElement | null>(null);

    const setMergedRef = React.useCallback(
      (node: HTMLButtonElement | null) => {
        triggerRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    const updateMenuPosition = React.useCallback(() => {
      const btn = triggerRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const spaceBelow = viewportHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const estimatedMenuHeight = Math.min(options.length * 40 + 16, 272);

      const placement: 'bottom' | 'top' =
        spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';

      const maxHeight = Math.max(
        140,
        Math.min(272, placement === 'bottom' ? spaceBelow : spaceAbove),
      );

      const width = Math.max(rect.width, 160);
      const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - width - 8));
      const top =
        placement === 'bottom'
          ? rect.bottom + 6
          : Math.max(8, rect.top - Math.min(estimatedMenuHeight, maxHeight) - 6);

      setMenuStyle({
        top,
        left,
        width: Math.min(width, viewportWidth - 16),
        maxHeight,
        placement,
      });
    }, [options.length]);

    React.useEffect(() => {
      if (!open) return;
      updateMenuPosition();

      const selectedIdx = options.findIndex((o) => o.value === currentValue && !o.disabled);
      setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : getEdgeOptionIndex(options, 'first'));

      const handleReposition = () => updateMenuPosition();
      const handleOutsideClick = (event: MouseEvent) => {
        const target = event.target as Node | null;
        if (!target) return;
        if (triggerRef.current?.contains(target)) return;
        if (listboxRef.current?.contains(target)) return;
        setOpen(false);
      };

      window.addEventListener('resize', handleReposition);
      window.addEventListener('scroll', handleReposition, true);
      document.addEventListener('mousedown', handleOutsideClick);
      return () => {
        window.removeEventListener('resize', handleReposition);
        window.removeEventListener('scroll', handleReposition, true);
        document.removeEventListener('mousedown', handleOutsideClick);
      };
    }, [open, updateMenuPosition, options, currentValue]);

    React.useEffect(() => {
      if (!open || highlightedIndex < 0 || !listboxRef.current) return;
      const el = listboxRef.current.querySelector<HTMLElement>(
        `[data-option-index="${highlightedIndex}"]`,
      );
      el?.scrollIntoView({ block: 'nearest' });
    }, [open, highlightedIndex]);

    const commitSelection = (nextValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }
      if (onChange) {
        const syntheticTarget = {
          value: nextValue,
          name: name ?? '',
          id: id ?? '',
        } as unknown as HTMLSelectElement;

        const syntheticEvent = {
          target: syntheticTarget,
          currentTarget: syntheticTarget,
          preventDefault: () => {},
          stopPropagation: () => {},
        } as unknown as React.ChangeEvent<HTMLSelectElement>;

        onChange(syntheticEvent);
      }
      setOpen(false);
      triggerRef.current?.focus();
    };

    const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setHighlightedIndex((prev) => getNextOptionIndex(options, prev, 1));
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setHighlightedIndex((prev) => getNextOptionIndex(options, prev, -1));
        }
      } else if (e.key === 'Home' && open) {
        e.preventDefault();
        setHighlightedIndex(getEdgeOptionIndex(options, 'first'));
      } else if (e.key === 'End' && open) {
        e.preventDefault();
        setHighlightedIndex(getEdgeOptionIndex(options, 'last'));
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (open) {
          e.preventDefault();
          if (highlightedIndex >= 0 && options[highlightedIndex] && !options[highlightedIndex].disabled) {
            commitSelection(options[highlightedIndex].value);
          }
        }
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === 'Tab' && open) {
        setOpen(false);
      }
    };

    const displayLabel = selectedOption?.label ?? options[0]?.label ?? 'Select an option';
    const isEmptyPlaceholder = !selectedOption || selectedOption.value === '';

    return (
      <div className="relative w-full">
        {required || name ? (
          <input
            tabIndex={-1}
            aria-hidden="true"
            name={name}
            required={required}
            disabled={disabled}
            value={currentValue}
            onChange={() => {}}
            onFocus={() => triggerRef.current?.focus()}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        ) : null}

        <button
          ref={setMergedRef}
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          disabled={disabled}
          data-value={currentValue}
          onClick={() => {
            if (!disabled) setOpen((prev) => !prev);
          }}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            'flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-left text-sm transition-colors shadow-xs',
            'hover:border-slate-400 focus-visible:outline-none focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#2563EB]/20',
            'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 cursor-pointer',
            open && 'border-[#2563EB] ring-2 ring-[#2563EB]/20',
            isEmptyPlaceholder ? 'text-slate-600' : 'text-[#0F172A] font-medium',
            className,
          )}
          {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-[#1E3A8A] transition-transform duration-150',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>

        {open && menuStyle && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={listboxRef}
                role="listbox"
                aria-labelledby={ariaLabelledBy ?? id}
                style={{
                  position: 'fixed',
                  top: `${menuStyle.top}px`,
                  left: `${menuStyle.left}px`,
                  width: `${menuStyle.width}px`,
                  maxHeight: `${menuStyle.maxHeight}px`,
                }}
                className={cn(
                  'z-[100] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl ring-1 ring-[#0F172A]/5',
                  menuStyle.placement === 'top' ? 'origin-bottom' : 'origin-top',
                )}
              >
                {options.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-slate-500">
                    No options available
                  </div>
                ) : (
                  options.map((opt, index) => {
                    const isSelected = opt.value === currentValue;
                    const isHighlighted = index === highlightedIndex;
                    return (
                      <button
                        key={`${opt.value}-${index}`}
                        type="button"
                        role="option"
                        data-option-index={index}
                        data-value={opt.value}
                        data-no-roll="true"
                        aria-selected={isSelected}
                        disabled={opt.disabled}
                        onMouseEnter={() => {
                          if (!opt.disabled) setHighlightedIndex(index);
                        }}
                        onClick={() => {
                          if (!opt.disabled) commitSelection(opt.value);
                        }}
                        className={cn(
                          'flex w-full min-h-[38px] items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                          opt.disabled
                            ? 'cursor-not-allowed text-slate-400 opacity-50'
                            : 'cursor-pointer',
                          isSelected
                            ? 'bg-[#EFF6FF] font-semibold text-[#1E3A8A]'
                            : isHighlighted
                              ? 'bg-slate-100 text-[#0F172A]'
                              : 'text-[#0F172A] hover:bg-slate-50',
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        {isSelected ? (
                          <Check className="h-4 w-4 shrink-0 text-[#2563EB]" aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  },
);

Select.displayName = 'Select';
