const PATHS = {
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  rotate: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  flip: 'M12 3v18M9 7l-6 5 6 5zM15 7l6 5-6 5z',
  duplicate: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  code: 'M8 6l-6 6 6 6M16 6l6 6-6 6',
  wave: 'M2 12h3l3-8 4 16 4-12 2 4h4',
  play: 'M7 4l13 8-13 8z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6 6h12v12H6z',
  route: 'M4 4v7h9v9h7M2 4h4M18 20h4',
  wiresBehind: 'M8 7h11v10H8zM2 12h3M4 5l3 3M4 19l3-3',
  ladder: 'M4 4v16M20 4v16M4 9h5M15 9h5M9 6v6M15 6v6M4 16h16',
  schematic: 'M2 12h5M17 12h5M7 9h10v6H7z',
  board: 'M3 6h18v12H3zM7 10v4M11 10v4M15 10v4M19 10v4',
  step: 'M5 4l10 8-10 8zM19 5v14',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon(props: { name: IconName }) {
  return (
    <svg
      class="icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[props.name]} />
    </svg>
  );
}
