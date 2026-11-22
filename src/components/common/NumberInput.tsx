import React, { useEffect, useRef, useState } from 'react';

export interface NumberInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'
  > {
  /** Numeric (or empty/nullable/string) value from parent state */
  value: number | string | null | undefined;
  /** Called with a valid clamped number whenever user edits (or on blur/Enter if commitOnBlurOnly=true) */
  onValueChange?: (value: number) => void;
  /** Optional raw string callback for states storing string | number | '' */
  onStringValueChange?: (value: string) => void;
  /** Minimum allowed value (enforced on commit/blur, NEVER blocks erasing while typing) */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Value restored on blur if left empty (defaults to min > 0 ? min : 0) */
  emptyFallback?: number;
  /** Keep empty string on blur instead of falling back to emptyFallback */
  allowEmpty?: boolean;
  /** Allow decimal numbers (auto-enabled when step is 'any' or fractional) */
  allowDecimal?: boolean;
  /** Allow negative numbers (auto-enabled when min < 0) */
  allowNegative?: boolean;
  /** Increment/decrement step for ArrowUp / ArrowDown keys */
  step?: number | 'any';
  /** Only invoke onValueChange on blur / Enter (useful for realtime-synced counters) */
  commitOnBlurOnly?: boolean;
  /** Select all digits on focus for 1-tap replacement */
  selectOnFocus?: boolean;
}

const formatExternalValue = (
  val: number | string | null | undefined,
  allowEmpty: boolean
): string => {
  if (val === '' || val === null || val === undefined) {
    return allowEmpty ? '' : '';
  }
  if (typeof val === 'number' && Number.isNaN(val)) {
    return '';
  }
  return String(val);
};

const clampNumber = (num: number, min?: number, max?: number): number => {
  let result = num;
  if (typeof min === 'number' && !Number.isNaN(min)) {
    result = Math.max(min, result);
  }
  if (typeof max === 'number' && !Number.isNaN(max)) {
    result = Math.min(max, result);
  }
  return result;
};

/**
 * Ergonomic controlled numeric input:
 * - Always allows deleting digits to empty ("") or typing "0" freely without snapping back to "1" mid-edit.
 * - Automatically strips redundant leading zeros (e.g. typing "5" after "0" produces "5", not "05").
 * - Enforces min/max & emptyFallback cleanly on blur / Enter.
 * - Uses inputMode="numeric" / "decimal" for native mobile keypads without HTML number input quirks or scroll-wheel accidents.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onValueChange,
      onStringValueChange,
      min,
      max,
      emptyFallback,
      allowEmpty = false,
      allowDecimal,
      allowNegative,
      step,
      commitOnBlurOnly = false,
      selectOnFocus = false,
      onFocus,
      onBlur,
      onKeyDown,
      inputMode,
      autoComplete = 'off',
      ...rest
    },
    ref
  ) => {
    const isDecimal =
      allowDecimal ??
      (step === 'any' || (typeof step === 'number' && !Number.isInteger(step)));
    const isNegative =
      allowNegative ?? (typeof min === 'number' && min < 0);

    const resolvedFallback =
      emptyFallback !== undefined
        ? emptyFallback
        : typeof min === 'number' && min > 0
        ? min
        : 0;

    const isFocusedRef = useRef(false);
    const [draft, setDraft] = useState<string>(() =>
      formatExternalValue(value, allowEmpty)
    );

    // Sync external value changes when NOT actively typing
    useEffect(() => {
      if (!isFocusedRef.current) {
        setDraft(formatExternalValue(value, allowEmpty));
      }
    }, [value, allowEmpty]);

    const sanitizeRaw = (input: string): string => {
      let s = input;
      if (isDecimal) {
        s = s.replace(/,/g, '.');
      }

      let out = '';
      let hasDot = false;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch >= '0' && ch <= '9') {
          out += ch;
        } else if (ch === '-' && isNegative && out.length === 0) {
          out += ch;
        } else if (ch === '.' && isDecimal && !hasDot) {
          hasDot = true;
          out += ch;
        }
      }

      // Strip redundant leading zeros (e.g. "05" -> "5", "00" -> "0", "-05" -> "-5"), preserving "0." and "-0."
      if (/^-?0\d+/.test(out)) {
        const neg = out.startsWith('-');
        const stripped = (neg ? out.slice(1) : out).replace(/^0+(?=\d)/, '');
        out = (neg ? '-' : '') + stripped;
      }

      return out;
    };

    const commitDraft = (currentDraft: string) => {
      const trimmed = currentDraft.trim();
      if (
        trimmed === '' ||
        trimmed === '-' ||
        trimmed === '.' ||
        trimmed === '-.'
      ) {
        if (allowEmpty) {
          setDraft('');
          onStringValueChange?.('');
          if (!onStringValueChange && onValueChange) {
            onValueChange(resolvedFallback);
          }
          return;
        }
        const fb = clampNumber(resolvedFallback, min, max);
        setDraft(String(fb));
        onValueChange?.(fb);
        onStringValueChange?.(String(fb));
        return;
      }

      const parsed = isDecimal ? parseFloat(trimmed) : parseInt(trimmed, 10);
      if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
        if (allowEmpty) {
          setDraft('');
          onStringValueChange?.('');
          return;
        }
        const fb = clampNumber(resolvedFallback, min, max);
        setDraft(String(fb));
        onValueChange?.(fb);
        onStringValueChange?.(String(fb));
        return;
      }

      const finalNum = clampNumber(parsed, min, max);
      setDraft(String(finalNum));
      onValueChange?.(finalNum);
      onStringValueChange?.(String(finalNum));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const cleaned = sanitizeRaw(e.target.value);
      setDraft(cleaned);

      if (commitOnBlurOnly) {
        return;
      }

      if (
        cleaned === '' ||
        cleaned === '-' ||
        cleaned === '.' ||
        cleaned === '-.'
      ) {
        if (allowEmpty) {
          onStringValueChange?.('');
          if (cleaned === '' && !onStringValueChange && (min === undefined || min <= 0)) {
            onValueChange?.(0);
          }
        } else if (cleaned === '' && (min === undefined || min <= 0)) {
          // Immediately reset parent to 0 when field allows 0, while keeping visual input empty while typing
          onValueChange?.(0);
          onStringValueChange?.('');
        }
        return;
      }

      const parsed = isDecimal ? parseFloat(cleaned) : parseInt(cleaned, 10);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        const clamped = clampNumber(parsed, min, max);
        onValueChange?.(clamped);
        onStringValueChange?.(cleaned);
      }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      isFocusedRef.current = true;
      if (selectOnFocus) {
        const target = e.currentTarget;
        requestAnimationFrame(() => {
          try {
            target.select();
          } catch {
            // ignore selection errors on unsupported environments
          }
        });
      }
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      isFocusedRef.current = false;
      commitDraft(draft);
      onBlur?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitDraft(draft);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const delta = typeof step === 'number' && step > 0 ? step : 1;
        const current = parseFloat(draft);
        const base = Number.isNaN(current) ? resolvedFallback : current;
        const nextRaw = e.key === 'ArrowUp' ? base + delta : base - delta;
        const nextRounded = isDecimal
          ? Math.round(nextRaw * 1e6) / 1e6
          : Math.round(nextRaw);
        const clamped = clampNumber(nextRounded, min, max);
        setDraft(String(clamped));
        onValueChange?.(clamped);
        onStringValueChange?.(String(clamped));
      }
      onKeyDown?.(e);
    };

    // On iOS Safari, inputMode="decimal" lacks a minus sign, so use "text" when negative is allowed
    const resolvedInputMode: React.HTMLAttributes<HTMLInputElement>['inputMode'] =
      inputMode ?? (isNegative ? 'text' : isDecimal ? 'decimal' : 'numeric');

    return (
      <input
        ref={ref}
        type="text"
        inputMode={resolvedInputMode}
        autoComplete={autoComplete}
        value={draft}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        {...rest}
      />
    );
  }
);

NumberInput.displayName = 'NumberInput';
