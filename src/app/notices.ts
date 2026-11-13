import { createSignal } from 'solid-js';

/** Short-lived messages shown as toasts (errors the user should know about). */

export interface Notice {
  id: number;
  text: string;
}

const NOTICE_DURATION_MS = 6000;

const [notices, setNotices] = createSignal<Notice[]>([]);
export { notices };

let nextNoticeId = 1;

export function dismissNotice(id: number): void {
  setNotices((list) => list.filter((notice) => notice.id !== id));
}

export function notify(text: string): void {
  const id = nextNoticeId++;
  setNotices((list) => [...list, { id, text }]);
  setTimeout(() => dismissNotice(id), NOTICE_DURATION_MS);
}

const [menuOpen, setMenuOpen] = createSignal(false);
export { menuOpen, setMenuOpen };
