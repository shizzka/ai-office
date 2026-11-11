export const WHOAMI_TOOLTIP = 'whoami · безопасник (белый хакер)';
export const WHOAMI_PHRASES = [
  'uid=0(root)',
  'Ничего не трогал. Просто посмотрел.',
  'Пароль в коде? Я видел.',
  'Это не баг, это RCE.',
  'sudo чаю',
] as const;

export function whoamiPhrase(previous?: string, random = Math.random) {
  const choices = WHOAMI_PHRASES.filter(phrase => phrase !== previous);
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
