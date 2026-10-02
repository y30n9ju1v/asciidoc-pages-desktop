// Maps physical keys (e.code) or 2-beolsik (두벌식) Hangul jamo characters back
// to the QWERTY key that physically produces them.
// monaco-vim resolves keypresses via `e.key || e.browserEvent.key`.
// With a Korean input source active, `browserEvent.key` can be "ㄹ" or "Process",
// so Vim commands (h/j/k/l/i/d/y/p/...) fail to match unless translated back.

const HANGUL_TO_QWERTY: Record<string, string> = {
  // consonants
  ㅂ: 'q',
  ㅈ: 'w',
  ㄷ: 'e',
  ㄱ: 'r',
  ㅅ: 't',
  ㅁ: 'a',
  ㄴ: 's',
  ㅇ: 'd',
  ㄹ: 'f',
  ㅎ: 'g',
  ㅋ: 'z',
  ㅌ: 'x',
  ㅊ: 'c',
  ㅍ: 'v',
  // vowels
  ㅛ: 'y',
  ㅕ: 'u',
  ㅑ: 'i',
  ㅐ: 'o',
  ㅔ: 'p',
  ㅗ: 'h',
  ㅓ: 'j',
  ㅏ: 'k',
  ㅣ: 'l',
  ㅠ: 'n',
  ㅜ: 'm',
  // shifted
  ㅃ: 'Q',
  ㅉ: 'W',
  ㄸ: 'E',
  ㄲ: 'R',
  ㅆ: 'T',
  ㅒ: 'O',
  ㅖ: 'P',
};

const ASCII_KEY_REGEX = /^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]$/;

const SYMBOL_MAP: Record<string, [string, string]> = {
  Digit1: ['1', '!'],
  Digit2: ['2', '@'],
  Digit3: ['3', '#'],
  Digit4: ['4', '$'],
  Digit5: ['5', '%'],
  Digit6: ['6', '^'],
  Digit7: ['7', '&'],
  Digit8: ['8', '*'],
  Digit9: ['9', '('],
  Digit0: ['0', ')'],
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  Backquote: ['`', '~'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
};

/**
 * Maps physical `KeyboardEvent.code` to QWERTY character.
 */
function codeToQwertyKey(e: KeyboardEvent): string | null {
  const code = e.code;
  if (!code) return null;

  if (code.startsWith('Key') && code.length === 4) {
    const letter = code.charAt(3);
    return e.shiftKey ? letter : letter.toLowerCase();
  }

  if (SYMBOL_MAP[code]) {
    return e.shiftKey ? SYMBOL_MAP[code][1] : SYMBOL_MAP[code][0];
  }

  return null;
}

/**
 * Rewrites `browserEvent.key` in place so monaco-vim sees the QWERTY letter
 * when a Korean input method (IME) is active.
 */
export function remapHangulKeydown(browserEvent: KeyboardEvent): void {
  if (browserEvent.altKey || browserEvent.ctrlKey || browserEvent.metaKey) return;

  // If already an ASCII/English key, don't modify anything
  if (ASCII_KEY_REGEX.test(browserEvent.key)) {
    return;
  }

  const qwertKey = codeToQwertyKey(browserEvent);
  if (qwertKey) {
    Object.defineProperty(browserEvent, 'key', { value: qwertKey, configurable: true });
    return;
  }

  const remapped = HANGUL_TO_QWERTY[browserEvent.key];
  if (remapped) {
    Object.defineProperty(browserEvent, 'key', { value: remapped, configurable: true });
  }
}
