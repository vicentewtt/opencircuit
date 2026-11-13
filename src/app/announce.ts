import { createSignal } from 'solid-js';

/**
 * Messages for screen readers: what the user cannot see changes on the
 * canvas (a part selected or placed, a part burned). Rendered in a hidden
 * polite live region by the app shell.
 */
const [announcement, setAnnouncement] = createSignal('');
export { announcement };

let timer: ReturnType<typeof setTimeout> | undefined;

export function announce(message: string): void {
  // Clearing first makes the same message be read again.
  setAnnouncement('');
  clearTimeout(timer);
  timer = setTimeout(() => setAnnouncement(message), 50);
}
