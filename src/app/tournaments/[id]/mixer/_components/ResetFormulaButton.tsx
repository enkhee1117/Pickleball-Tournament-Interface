'use client';

import { useState } from 'react';
import { DEFAULT_MIXER_CONFIG } from '@/lib/mixer';

// Maps the canonical formula defaults onto the event_config form field names.
// Single source of truth is DEFAULT_MIXER_CONFIG so the button can never drift
// from what the server action falls back to.
const FORMULA_FIELD_DEFAULTS: Record<string, number> = {
  alpha: DEFAULT_MIXER_CONFIG.alpha,
  beta: DEFAULT_MIXER_CONFIG.beta,
  gamma: DEFAULT_MIXER_CONFIG.gamma,
  tau: DEFAULT_MIXER_CONFIG.tau,
  grief_floor: DEFAULT_MIXER_CONFIG.griefFloor,
  repeat_decay: DEFAULT_MIXER_CONFIG.repeatDecay,
};

// Repopulates the matching-formula inputs in place (no save) so an organizer
// can review the restored values and then hit "Save event settings". These are
// uncontrolled inputs, so writing .value directly is enough.
export function ResetFormulaButton() {
  const [reset, setReset] = useState(false);
  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        onClick={(e) => {
          const form = e.currentTarget.form;
          if (!form) return;
          for (const [name, value] of Object.entries(FORMULA_FIELD_DEFAULTS)) {
            const input = form.elements.namedItem(name);
            if (input instanceof HTMLInputElement) input.value = String(value);
          }
          setReset(true);
        }}
        className="rounded-xl px-3 py-2 text-xs font-bold text-ink"
        style={{ border: '1px solid var(--line)', background: '#fff' }}
      >
        Reset to defaults
      </button>
      {reset && (
        <span className="text-[11px] text-ink-3">
          Restored α1 · β2.5 · γ1 · τ2 · C4 · decay0.2 — Save to apply.
        </span>
      )}
    </div>
  );
}
