import { Show, createEffect, createSignal, on, onCleanup } from 'solid-js';
import { t, type MessageKey } from '../i18n';
import { setMenuOpen } from './notices';
import { closeTour, tourOpen } from './tour';

interface Step {
  /** data-tour value of the element to light up; none for a centered card. */
  target?: string;
  title: MessageKey;
  body: MessageKey;
}

const STEPS: Step[] = [
  { title: 'tour.welcome.title', body: 'tour.welcome.body' },
  { target: 'palette', title: 'tour.palette.title', body: 'tour.palette.body' },
  { target: 'canvas', title: 'tour.canvas.title', body: 'tour.canvas.body' },
  { target: 'toolbar', title: 'tour.toolbar.title', body: 'tour.toolbar.body' },
  { target: 'simulate', title: 'tour.simulate.title', body: 'tour.simulate.body' },
  { target: 'instruments', title: 'tour.instruments.title', body: 'tour.instruments.body' },
  { target: 'menu', title: 'tour.menu.title', body: 'tour.menu.body' },
];

const GAP = 12;
const PADDING = 6;

interface Layout {
  spot: { x: number; y: number; width: number; height: number } | null;
  card: { left: number; top: number };
}

/** Finds a visible element for the step, if it is on screen. */
function targetRect(step: Step): DOMRect | null {
  if (!step.target) return null;
  for (const element of document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
}

/** Spotlight around the target and a card beside it, kept inside the window. */
function layoutFor(step: Step, card: { width: number; height: number }): Layout {
  const rect = targetRect(step);
  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight;
  const clampLeft = (left: number): number => Math.max(GAP, Math.min(viewWidth - card.width - GAP, left));
  const clampTop = (top: number): number => Math.max(GAP, Math.min(viewHeight - card.height - GAP, top));
  if (!rect) {
    return { spot: null, card: { left: clampLeft((viewWidth - card.width) / 2), top: clampTop((viewHeight - card.height) / 2) } };
  }
  const spot = {
    x: Math.max(0, rect.left - PADDING),
    y: Math.max(0, rect.top - PADDING),
    width: Math.min(viewWidth, rect.width + PADDING * 2),
    height: Math.min(viewHeight, rect.height + PADDING * 2),
  };
  const below = viewHeight - (spot.y + spot.height);
  const above = spot.y;
  const right = viewWidth - (spot.x + spot.width);
  const left = spot.x;
  let position: { left: number; top: number };
  if (below >= card.height + GAP) {
    position = { left: spot.x + spot.width / 2 - card.width / 2, top: spot.y + spot.height + GAP };
  } else if (above >= card.height + GAP) {
    position = { left: spot.x + spot.width / 2 - card.width / 2, top: spot.y - card.height - GAP };
  } else if (right >= card.width + GAP) {
    position = { left: spot.x + spot.width + GAP, top: spot.y + spot.height / 2 - card.height / 2 };
  } else if (left >= card.width + GAP) {
    position = { left: spot.x - card.width - GAP, top: spot.y + spot.height / 2 - card.height / 2 };
  } else {
    // The target fills the screen (the canvas on a phone): card over it, at the bottom.
    position = { left: (viewWidth - card.width) / 2, top: viewHeight - card.height - GAP * 2 };
  }
  return { spot, card: { left: clampLeft(position.left), top: clampTop(position.top) } };
}

export function Tour() {
  let dialog!: HTMLDialogElement;
  let card!: HTMLDivElement;
  let primary!: HTMLButtonElement;
  const [index, setIndex] = createSignal(0);
  const [layout, setLayout] = createSignal<Layout>({ spot: null, card: { left: 0, top: 0 } });
  const step = (): Step => STEPS[index()] ?? STEPS[0]!;
  const last = (): boolean => index() === STEPS.length - 1;

  const place = (): void => {
    if (!tourOpen()) return;
    setLayout(layoutFor(step(), { width: card.offsetWidth, height: card.offsetHeight }));
  };

  createEffect(
    on(tourOpen, (open) => {
      if (open) {
        setIndex(0);
        if (!dialog.open) dialog.showModal();
        requestAnimationFrame(() => {
          place();
          primary.focus();
        });
      } else if (dialog.open) {
        dialog.close();
      }
    }),
  );

  createEffect(
    on(index, () => {
      requestAnimationFrame(() => {
        place();
        primary.focus();
      });
    }, { defer: true }),
  );

  const onResize = (): void => place();
  window.addEventListener('resize', onResize);
  onCleanup(() => window.removeEventListener('resize', onResize));

  const next = (): void => {
    if (last()) closeTour();
    else setIndex((current) => current + 1);
  };
  const back = (): void => {
    setIndex(Math.max(0, index() - 1));
  };

  return (
    <dialog
      ref={dialog}
      class="tour"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      onCancel={(event) => {
        event.preventDefault();
        closeTour();
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') next();
        else if (event.key === 'ArrowLeft') back();
        else return;
        event.preventDefault();
      }}
    >
      <Show
        when={layout().spot}
        fallback={<div class="tour-shade" />}
      >
        {(spot) => (
          <div
            class="tour-spot"
            style={{
              left: `${spot().x}px`,
              top: `${spot().y}px`,
              width: `${spot().width}px`,
              height: `${spot().height}px`,
            }}
          />
        )}
      </Show>
      <div
        ref={card}
        class="tour-card"
        style={{ left: `${layout().card.left}px`, top: `${layout().card.top}px` }}
      >
        <p class="tour-progress">{t('tour.progress', { n: index() + 1, total: STEPS.length })}</p>
        <h2 id="tour-title" class="tour-title">{t(step().title)}</h2>
        <p id="tour-body" class="tour-body">{t(step().body)}</p>
        <div class="tour-actions">
          <button type="button" class="button tour-skip" onClick={closeTour}>
            {t('tour.skip')}
          </button>
          <span class="tour-spacer" />
          <Show when={index() > 0}>
            <button type="button" class="button" onClick={back}>
              {t('tour.back')}
            </button>
          </Show>
          <Show when={last()}>
            <button
              type="button"
              class="button"
              onClick={() => {
                closeTour();
                setMenuOpen(true);
              }}
            >
              {t('tour.examples')}
            </button>
          </Show>
          <button ref={primary} type="button" class="button button-primary" onClick={next}>
            {t(last() ? 'tour.done' : 'tour.next')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
