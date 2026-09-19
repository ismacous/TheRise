import { el, onTap } from './dom';

/**
 * A modal text prompt.
 *
 * `window.prompt` is banned on purpose: on Android it is a system dialog that
 * looks nothing like the game, it cannot be styled, and in a Capacitor WebView
 * it is unreliable. This is twenty lines of DOM that behaves the same
 * everywhere and matches the rest of the interface.
 */
export interface AskTextOptions {
  title: string;
  label?: string;
  value?: string;
  placeholder?: string;
  confirm?: string;
  cancel?: string;
  maxLength?: number;
  /** A second field, for a villager's surname. */
  secondLabel?: string;
  secondValue?: string;
}

export interface AskTextResult {
  value: string;
  second: string;
}

/** Resolves with the trimmed text, or null when the player backs out. */
export function askText(options: AskTextOptions): Promise<AskTextResult | null> {
  return new Promise((resolve) => {
    const first = el('input', {
      class: 'dialog-input',
      type: 'text',
      maxlength: options.maxLength ?? 28,
      placeholder: options.placeholder ?? '',
      autocomplete: 'off',
      spellcheck: false,
    }) as HTMLInputElement;
    first.value = options.value ?? '';

    let second: HTMLInputElement | null = null;
    if (options.secondLabel !== undefined) {
      second = el('input', {
        class: 'dialog-input',
        type: 'text',
        maxlength: options.maxLength ?? 28,
        autocomplete: 'off',
        spellcheck: false,
      }) as HTMLInputElement;
      second.value = options.secondValue ?? '';
    }

    const body = el('div', { class: 'dialog-body' }, [
      options.label ? el('label', { class: 'dialog-label', text: options.label }) : null,
      first,
      options.secondLabel ? el('label', { class: 'dialog-label', text: options.secondLabel }) : null,
      second,
    ]);

    const ok = el('button', { class: 'btn primary grow', text: options.confirm ?? 'Valider' });
    const row = el('div', { class: 'btn-row' });
    let closed = false;

    const close = (result: AskTextResult | null): void => {
      if (closed) return;
      closed = true;
      window.removeEventListener('keydown', onKey, true);
      overlay.classList.add('leaving');
      setTimeout(() => overlay.remove(), 180);
      resolve(result);
    };

    const accept = (): void => {
      const value = first.value.trim();
      if (!value) {
        first.focus();
        overlay.classList.add('shake');
        setTimeout(() => overlay.classList.remove('shake'), 400);
        return;
      }
      close({ value, second: second ? second.value.trim() : '' });
    };

    onTap(ok, accept);
    if (options.cancel !== undefined) {
      const cancel = el('button', { class: 'btn', text: options.cancel });
      onTap(cancel, () => close(null));
      row.append(cancel);
    }
    row.append(ok);

    const panel = el('div', { class: 'dialog' }, [
      el('h2', { class: 'dialog-title', text: options.title }),
      body,
      row,
    ]);
    const overlay = el('div', { class: 'dialog-overlay' }, [panel]);

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        accept();
      } else if (e.key === 'Escape' && options.cancel !== undefined) {
        e.preventDefault();
        close(null);
      }
    };
    window.addEventListener('keydown', onKey, true);

    // Tapping the backdrop cancels, but only when cancelling is allowed: the
    // founding dialog has to be answered.
    if (options.cancel !== undefined) {
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) close(null);
      });
    }

    document.body.append(overlay);
    // Autofocus after the element is in the tree, or mobile keyboards ignore it.
    requestAnimationFrame(() => {
      first.focus();
      first.select();
    });
  });
}

/** Removes any dialog left over, e.g. when the game restarts underneath one. */
export function closeDialogs(): void {
  for (const node of Array.from(document.querySelectorAll('.dialog-overlay'))) node.remove();
}
