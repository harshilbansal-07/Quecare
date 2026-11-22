// keywords.js - maps typed text to an intent. Case-insensitive, trimmed.

const KEYWORDS = {
  MENU: ['hi', 'hello', 'hey', 'menu'],
  BOOK: ['1', 'book', 'token', 'new'],
  STATUS: ['2', 'status', 'check'],
  CANCEL: ['3', 'cancel'],
  HELP: ['help'],
};

export function parseIntent(text) {
  const word = String(text ?? '').trim().toLowerCase();
  for (const [intent, words] of Object.entries(KEYWORDS)) {
    if (words.includes(word)) return intent;
  }
  return 'UNKNOWN';
}
