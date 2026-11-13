import { createEffect, onCleanup, onMount } from 'solid-js';
import { t } from '../i18n';
import { serialText } from '../sim/simulation';
import { parsePlotData } from './analysis';
import { CHANNEL_COLORS } from './state';

const MAX_POINTS = 400;

/** Plots the numbers a board prints over serial, one curve per column. */
export function SerialPlotter(props: { partId: string }) {
  let canvas!: HTMLCanvasElement;

  const draw = (): void => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.width;
    const height = canvas.height;
    ctx.fillStyle = '#0e1513';
    ctx.fillRect(0, 0, width, height);

    const series = parsePlotData(serialText(props.partId), MAX_POINTS);
    const points = Math.max(0, ...series.map((values) => values.length));
    ctx.font = `${Math.round(11 * ratio)}px monospace`;
    if (points < 2) {
      ctx.fillStyle = '#9aa39d';
      ctx.fillText(t('plotter.empty'), 10 * ratio, 22 * ratio, width - 20 * ratio);
      return;
    }

    let min = Infinity;
    let max = -Infinity;
    for (const values of series) {
      for (const value of values) {
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    if (max - min < 1e-9) {
      min -= 1;
      max += 1;
    }
    const margin = 14 * ratio;
    const yOf = (value: number): number =>
      height - margin - ((value - min) / (max - min)) * (height - 2 * margin);

    ctx.strokeStyle = '#24332e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const value of [min, (min + max) / 2, max]) {
      const y = Math.round(yOf(value)) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#9aa39d';
    for (const value of [min, (min + max) / 2, max]) {
      ctx.fillText(Number(value.toPrecision(4)).toString(), 4 * ratio, yOf(value) - 3 * ratio);
    }

    ctx.lineWidth = Math.max(1.5, ratio);
    ctx.lineJoin = 'round';
    series.forEach((values, k) => {
      ctx.strokeStyle = CHANNEL_COLORS[k % CHANNEL_COLORS.length] as string;
      ctx.beginPath();
      values.forEach((value, i) => {
        const x = (i / (MAX_POINTS - 1)) * width;
        if (i === 0) ctx.moveTo(x, yOf(value));
        else ctx.lineTo(x, yOf(value));
      });
      ctx.stroke();
    });
  };

  onMount(() => {
    const observer = new ResizeObserver(() => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      draw();
    });
    observer.observe(canvas);
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    serialText(props.partId);
    draw();
  });

  return <canvas ref={canvas} class="plotter" />;
}
