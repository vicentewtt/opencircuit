import { For, Index, Show, createSignal } from 'solid-js';
import { Icon } from '../app/Icon';
import { setPartProp } from '../editor/model/ops';
import { commit, doc } from '../editor/store';
import { t, type MessageKey } from '../i18n';
import { partVisual, simActive } from '../sim/simulation';
import {
  COLUMNS,
  COMPARE_OPS,
  CONTACT_ADDRESSES,
  NAME_LENGTH,
  compare,
  liveTest,
  valueKey,
  type CompareOp,
  MAX_ROWS,
  MAX_RUNGS,
  addRow,
  addressesFor,
  emptyRung,
  flow,
  removeRow,
  serializeProgram,
  tidy,
  type Cell,
  type Output,
  type Program,
  type Rung,
} from './ladder';
import { activePlc, plcs, programOfPart, setActivePlcId, setLadderPanelOpen } from './state';

type Tool =
  | 'select' | 'no' | 'nc' | 'p' | 'n' | 'cmp' | 'wire' | 'link'
  | 'coil' | 'set' | 'reset' | 'ton' | 'tof' | 'ctu' | 'ctd' | 'erase';

const TOOLS: { tool: Tool; glyph: string; label: MessageKey }[] = [
  { tool: 'select', glyph: '↖', label: 'plc.tool.select' },
  { tool: 'no', glyph: '┤ ├', label: 'plc.tool.no' },
  { tool: 'nc', glyph: '┤/├', label: 'plc.tool.nc' },
  { tool: 'p', glyph: '┤P├', label: 'plc.tool.p' },
  { tool: 'n', glyph: '┤N├', label: 'plc.tool.n' },
  { tool: 'cmp', glyph: '┤>├', label: 'plc.tool.cmp' },
  { tool: 'wire', glyph: '──', label: 'plc.tool.wire' },
  { tool: 'link', glyph: '│', label: 'plc.tool.link' },
  { tool: 'coil', glyph: '( )', label: 'plc.tool.coil' },
  { tool: 'set', glyph: '(S)', label: 'plc.tool.set' },
  { tool: 'reset', glyph: '(R)', label: 'plc.tool.reset' },
  { tool: 'ton', glyph: 'TON', label: 'plc.tool.ton' },
  { tool: 'tof', glyph: 'TOF', label: 'plc.tool.tof' },
  { tool: 'ctu', glyph: 'CTU', label: 'plc.tool.ctu' },
  { tool: 'ctd', glyph: 'CTD', label: 'plc.tool.ctd' },
  { tool: 'erase', glyph: '✕', label: 'plc.tool.erase' },
];

/** Drawing sizes, in SVG units. */
const RAIL = 12;
const CELL_W = 64;
const CELL_H = 48;
const OUT_W = 88;
const MID = 30;
const WIDTH = RAIL * 2 + COLUMNS * CELL_W + OUT_W;

/** A place in the program: a contact cell, or the output of a row when `column` is COLUMNS. */
interface Spot {
  rung: number;
  row: number;
  column: number;
}

const [tool, setTool] = createSignal<Tool>('select');
const [selected, setSelected] = createSignal<Spot | null>(null);

const sameSpot = (a: Spot | null, b: Spot): boolean =>
  a !== null && a.rung === b.rung && a.row === b.row && a.column === b.column;

/** First address of a kind that no output of the program uses yet. */
function freeAddress(program: Program, candidates: string[]): string {
  const used = new Set(program.rungs.flatMap((rung) => rung.outputs.map((output) => output?.a)));
  return candidates.find((address) => !used.has(address)) ?? candidates[0] ?? '';
}

export function LadderPanel() {
  const program = (): Program => {
    const plc = activePlc();
    return plc ? programOfPart(plc) : { rungs: [] };
  };

  /** Applies a change to a copy of the program and stores it in the PLC. */
  const edit = (change: (draft: Program) => void): void => {
    const plc = activePlc();
    if (!plc) return;
    const draft = structuredClone(program());
    change(draft);
    draft.rungs = draft.rungs.map(tidy);
    commit(setPartProp(doc(), plc.id, 'program', serializeProgram(draft)));
  };

  /** Live bits of the running PLC, or null while stopped. */
  const live = (): Record<string, number> | null => {
    const plc = activePlc();
    const aux = plc && simActive() ? partVisual(plc.id).aux : undefined;
    return aux && (aux.run ?? 0) > 0 ? aux : null;
  };
  const value = (aux: Record<string, number>, address: string): number => aux[valueKey(address)] ?? 0;
  const bit = (aux: Record<string, number>, address: string): boolean =>
    (((aux[address.charAt(0)] ?? 0) >> (Number(address.slice(1)) - 1)) & 1) === 1;

  const clickCell = (spot: Spot): void => {
    const current = tool();
    if (current === 'cmp') {
      edit((draft) => {
        const row = draft.rungs[spot.rung]?.cells[spot.row];
        const old = row?.[spot.column];
        if (row) {
          row[spot.column] =
            old && old.t === 'cmp' ? old : { t: 'cmp', a: 'AI1', op: '>', k: 500 };
        }
      });
    } else if (current === 'no' || current === 'nc' || current === 'p' || current === 'n') {
      edit((draft) => {
        const row = draft.rungs[spot.rung]?.cells[spot.row];
        const old = row?.[spot.column];
        const keep = old && old.t !== 'wire' && CONTACT_ADDRESSES.includes(old.a);
        if (row) row[spot.column] = { t: current, a: keep ? old.a : 'I1' };
      });
    } else if (current === 'wire' || current === 'erase') {
      edit((draft) => {
        const row = draft.rungs[spot.rung]?.cells[spot.row];
        if (row) row[spot.column] = current === 'wire' ? { t: 'wire' } : null;
      });
    } else if (current !== 'select') {
      return;
    }
    setSelected(current === 'erase' ? null : spot);
  };

  const clickOutput = (spot: Spot): void => {
    const current = tool();
    if (current === 'erase') {
      edit((draft) => {
        const rung = draft.rungs[spot.rung];
        if (rung) rung.outputs[spot.row] = null;
      });
      setSelected(null);
      return;
    }
    if (
      current === 'coil' || current === 'set' || current === 'reset' ||
      current === 'ton' || current === 'tof' || current === 'ctu' || current === 'ctd'
    ) {
      edit((draft) => {
        const rung = draft.rungs[spot.rung];
        if (!rung) return;
        const old = rung.outputs[spot.row];
        const valid = addressesFor(current);
        // A down counter usually works on the counter an up counter already uses.
        const pairedUp = draft.rungs.flatMap((rung) => rung.outputs).find((output) => output?.t === 'ctu')?.a;
        const address =
          old && valid.includes(old.a)
            ? old.a
            : current === 'ctd' && pairedUp
              ? pairedUp
              : current === 'ton' || current === 'tof' || current === 'ctu' || current === 'ctd'
                ? freeAddress(draft, valid)
                : (valid[0] ?? '');
        rung.outputs[spot.row] =
          current === 'ton' || current === 'tof'
            ? { t: current, a: address, pt: old && 'pt' in old ? old.pt : 1 }
            : current === 'ctu' || current === 'ctd'
              ? { t: current, a: address, pv: old && 'pv' in old ? old.pv : 3 }
              : { t: current, a: address };
      });
    } else if (current !== 'select') {
      return;
    }
    setSelected(spot);
  };

  const toggleLink = (rung: number, row: number, boundary: number): void =>
    edit((draft) => {
      const links = draft.rungs[rung]?.links[row];
      if (links) links[boundary] = !links[boundary];
    });

  /** The contact or output under the selection, if it still exists. */
  const selectedItem = (): NonNullable<Cell | Output> | null => {
    const spot = selected();
    const rung = spot ? program().rungs[spot.rung] : undefined;
    if (!spot || !rung) return null;
    const item = spot.column === COLUMNS ? rung.outputs[spot.row] : rung.cells[spot.row]?.[spot.column];
    return item ?? null;
  };

  const changeSelected = (change: (item: NonNullable<Cell | Output>) => void): void => {
    const spot = selected();
    if (!spot) return;
    edit((draft) => {
      const rung = draft.rungs[spot.rung];
      const item = spot.column === COLUMNS ? rung?.outputs[spot.row] : rung?.cells[spot.row]?.[spot.column];
      if (item) change(item);
    });
  };

  return (
    <aside class="code-panel ladder-panel" aria-label={t('plc.title')}>
      <header class="code-header ladder-header">
        <strong class="ladder-title">{t('plc.title')}</strong>
        <Show when={plcs().length > 1}>
          <select
            class="select"
            aria-label={t('plc.title')}
            onChange={(event) => setActivePlcId(event.currentTarget.value)}
          >
            <For each={plcs()}>
              {(part) => (
                <option value={part.id} selected={part.id === activePlc()?.id}>
                  {part.label}
                </option>
              )}
            </For>
          </select>
        </Show>
        <Show when={live()}>
          <span class="ladder-online">{t('plc.online')}</span>
        </Show>
        <span class="ladder-spacer" />
        <button
          type="button"
          class="icon-button"
          aria-label={t('code.close')}
          title={t('code.close')}
          onClick={() => setLadderPanelOpen(false)}
        >
          <Icon name="close" />
        </button>
      </header>
      <Show when={activePlc()} fallback={<p class="panel-hint ladder-empty">{t('plc.none')}</p>}>
        <div class="ladder-tools" role="toolbar" aria-label={t('plc.tools')}>
          <For each={TOOLS}>
            {(entry) => (
              <button
                type="button"
                class="ladder-tool"
                aria-pressed={tool() === entry.tool}
                aria-label={t(entry.label)}
                title={t(entry.label)}
                onClick={() => setTool(entry.tool)}
              >
                {entry.glyph}
              </button>
            )}
          </For>
        </div>
        <div class="ladder-inspector">
          <Show when={selectedItem()} keyed fallback={<span class="panel-hint">{t('plc.hint')}</span>}>
            {(item) => (
              <Show when={item.t !== 'wire' && item} keyed fallback={<span class="panel-hint">{t('plc.tool.wire')}</span>}>
                {(element) => (
                  <>
                    <label class="ladder-field">
                      <span>{t('plc.address')}</span>
                      <select
                        class="select"
                        onChange={(event) => {
                          const address = event.currentTarget.value;
                          changeSelected((target) => {
                            if (target.t !== 'wire') target.a = address;
                          });
                        }}
                      >
                        <For each={addressesFor(element.t)}>
                          {(address) => (
                            <option value={address} selected={address === element.a}>
                              {address}
                            </option>
                          )}
                        </For>
                      </select>
                    </label>
                    <Show when={element.t === 'cmp' ? element : false} keyed>
                      {(comparator) => (
                        <>
                          <label class="ladder-field">
                            <span>{t('plc.compare')}</span>
                            <select
                              class="select"
                              onChange={(event) => {
                                const op = event.currentTarget.value as CompareOp;
                                changeSelected((target) => {
                                  if (target.t === 'cmp') target.op = op;
                                });
                              }}
                            >
                              <For each={COMPARE_OPS}>
                                {(op) => (
                                  <option value={op} selected={op === comparator.op}>
                                    {op}
                                  </option>
                                )}
                              </For>
                            </select>
                          </label>
                          <label class="ladder-field">
                            <span>{t('plc.constant')}</span>
                            <input
                              class="ladder-number"
                              type="number"
                              step="any"
                              value={comparator.k}
                              onChange={(event) => {
                                const constant = Number(event.currentTarget.value);
                                if (!Number.isFinite(constant)) return;
                                changeSelected((target) => {
                                  if (target.t === 'cmp') target.k = Math.max(-99999, Math.min(99999, constant));
                                });
                              }}
                            />
                          </label>
                        </>
                      )}
                    </Show>
                    <label class="ladder-field">
                      <span>{t('plc.name')}</span>
                      <input
                        class="ladder-name"
                        type="text"
                        maxLength={NAME_LENGTH}
                        placeholder={element.a}
                        value={program().names?.[element.a] ?? ''}
                        onChange={(event) => {
                          const name = event.currentTarget.value.trim().slice(0, NAME_LENGTH);
                          const address = element.a;
                          edit((draft) => {
                            const names = { ...(draft.names ?? {}) };
                            if (name) names[address] = name;
                            else delete names[address];
                            draft.names = names;
                          });
                        }}
                      />
                    </label>
                    <Show when={'pt' in element || 'pv' in element}>
                      <label class="ladder-field">
                        <span>{t('pt' in element ? 'plc.presetTime' : 'plc.presetCount')}</span>
                        <input
                          class="ladder-number"
                          type="number"
                          min={'pt' in element ? 0.1 : 1}
                          max={'pt' in element ? 3600 : 9999}
                          step={'pt' in element ? 0.1 : 1}
                          value={'pt' in element ? element.pt : 'pv' in element ? element.pv : 0}
                          onChange={(event) => {
                            const value = Number(event.currentTarget.value);
                            if (!Number.isFinite(value) || value <= 0) return;
                            changeSelected((target) => {
                              if ('pt' in target) target.pt = Math.min(3600, value);
                              else if ('pv' in target) target.pv = Math.min(9999, Math.round(value));
                            });
                          }}
                        />
                      </label>
                    </Show>
                  </>
                )}
              </Show>
            )}
          </Show>
        </div>
        <div class="ladder-rungs">
          <Index each={program().rungs}>
            {(rung, index) => (
              <section class="ladder-rung">
                <header class="ladder-rung-header">
                  <span class="ladder-rung-name">{t('plc.rung', { n: index + 1 })}</span>
                  <button
                    type="button"
                    class="button ladder-small"
                    disabled={rung().cells.length >= MAX_ROWS}
                    onClick={() => edit((draft) => { const target = draft.rungs[index]; if (target) draft.rungs[index] = addRow(target); })}
                  >
                    {t('plc.addBranch')}
                  </button>
                  <button
                    type="button"
                    class="button ladder-small"
                    disabled={rung().cells.length <= 1}
                    onClick={() => edit((draft) => { const target = draft.rungs[index]; if (target) draft.rungs[index] = removeRow(target); })}
                  >
                    {t('plc.removeBranch')}
                  </button>
                  <button
                    type="button"
                    class="icon-button"
                    aria-label={t('plc.deleteRung')}
                    title={t('plc.deleteRung')}
                    onClick={() => {
                      setSelected(null);
                      edit((draft) => { draft.rungs.splice(index, 1); });
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </header>
                <RungView
                  rung={rung()}
                  index={index}
                  live={live()}
                  bit={bit}
                  value={value}
                  names={program().names ?? {}}
                  onCell={clickCell}
                  onOutput={clickOutput}
                  onLink={(row, boundary) => toggleLink(index, row, boundary)}
                />
              </section>
            )}
          </Index>
          <button
            type="button"
            class="button ladder-add"
            disabled={program().rungs.length >= MAX_RUNGS}
            onClick={() => edit((draft) => { draft.rungs.push(emptyRung()); })}
          >
            <Icon name="plus" />
            {t('plc.addRung')}
          </button>
        </div>
      </Show>
    </aside>
  );
}

function RungView(props: {
  rung: Rung;
  index: number;
  live: Record<string, number> | null;
  bit: (aux: Record<string, number>, address: string) => boolean;
  value: (aux: Record<string, number>, address: string) => number;
  names: Record<string, string>;
  onCell: (spot: Spot) => void;
  onOutput: (spot: Spot) => void;
  onLink: (row: number, boundary: number) => void;
}) {
  const rows = (): number => props.rung.cells.length;
  const height = (): number => rows() * CELL_H + 8;
  const power = (): boolean[][] | null => {
    const aux = props.live;
    return aux
      ? flow(props.rung, liveTest((address) => props.bit(aux, address), (address) => props.value(aux, address)))
      : null;
  };
  const on = (row: number, boundary: number): boolean => power()?.[row]?.[boundary] === true;
  const y = (row: number): number => row * CELL_H + MID;
  const x = (boundary: number): number => RAIL + boundary * CELL_W;
  const outX = RAIL + COLUMNS * CELL_W;

  const cellMarkup = (cell: Cell, row: number, column: number) => {
    const left = x(column);
    const mid = y(row);
    if (cell === null) return <circle class="ld-dot" cx={left + CELL_W / 2} cy={mid} r="1.5" />;
    if (cell.t === 'wire') {
      return <path class="ld-line" classList={{ on: on(row, column + 1) }} d={`M${left} ${mid}H${left + CELL_W}`} />;
    }
    const name = props.names[cell.a];
    if (cell.t === 'cmp') {
      const current = props.live ? props.value(props.live, cell.a) : null;
      const pass = current !== null && compare(cell.op, current, cell.k);
      return (
        <>
          <path class="ld-line" classList={{ on: on(row, column) }} d={`M${left} ${mid}H${left + 5}`} />
          <path class="ld-line" classList={{ on: on(row, column + 1) }} d={`M${left + CELL_W - 5} ${mid}H${left + CELL_W}`} />
          <rect class="ld-box" classList={{ active: pass }} x={left + 5} y={mid - 12} width={CELL_W - 10} height="24" rx="2" />
          <text class="ld-text small" x={left + CELL_W / 2} y={mid - 2.5}>{`${cell.a} ${cell.op} ${cell.k}`}</text>
          <Show when={current !== null}>
            <text class="ld-text small" x={left + CELL_W / 2} y={mid + 8}>{`= ${Math.round((current ?? 0) * 10) / 10}`}</text>
          </Show>
          <Show when={name}>
            <text class="ld-text small" x={left + CELL_W / 2} y={mid - 15}>{name}</text>
          </Show>
        </>
      );
    }
    const edge = cell.t === 'p' || cell.t === 'n';
    const closed = props.live && !edge ? props.bit(props.live, cell.a) === (cell.t === 'no') : false;
    return (
      <>
        <path class="ld-line" classList={{ on: on(row, column) }} d={`M${left} ${mid}H${left + 24}M${left + 24} ${mid - 10}V${mid + 10}`} />
        <path
          class="ld-line"
          classList={{ on: on(row, column + 1) }}
          d={`M${left + 40} ${mid - 10}V${mid + 10}M${left + 40} ${mid}H${left + CELL_W}${cell.t === 'nc' ? `M${left + 21} ${mid + 10}L${left + 43} ${mid - 10}` : ''}`}
        />
        <Show when={closed}>
          <rect class="ld-fill" x={left + 25.5} y={mid - 7} width="13" height="14" />
        </Show>
        <Show when={edge}>
          <text class="ld-text" x={left + 32} y={mid + 3.5}>{cell.t === 'p' ? 'P' : 'N'}</text>
        </Show>
        <text class="ld-text" x={left + 32} y={mid - 15}>{cell.a}</text>
        <Show when={name}>
          <text class="ld-text small" x={left + 32} y={mid + 20}>{name}</text>
        </Show>
      </>
    );
  };

  const outputMarkup = (output: Output, row: number) => {
    const mid = y(row);
    const end = outX + OUT_W;
    const powered = on(row, COLUMNS);
    if (output === null) return <circle class="ld-dot" cx={outX + OUT_W / 2} cy={mid} r="1.5" />;
    if (output.t === 'coil' || output.t === 'set' || output.t === 'reset') {
      const active = props.live ? props.bit(props.live, output.a) : false;
      return (
        <>
          <path
            class="ld-line"
            classList={{ on: powered }}
            d={`M${outX} ${mid}H${outX + 32}M${outX + 36} ${mid - 10}q-7 10 0 20M${outX + 52} ${mid - 10}q7 10 0 20M${outX + 56} ${mid}H${end}`}
          />
          <Show when={active}>
            <ellipse class="ld-fill" cx={outX + 44} cy={mid} rx="6.5" ry="8" />
          </Show>
          <text class="ld-text" x={outX + 44} y={mid + 3.5}>{output.t === 'set' ? 'S' : output.t === 'reset' ? 'R' : ''}</text>
          <text class="ld-text" x={outX + 44} y={mid - 15}>{output.a}</text>
          <Show when={props.names[output.a]}>
            <text class="ld-text small" x={outX + 44} y={mid + 20}>{props.names[output.a]}</text>
          </Show>
        </>
      );
    }
    const preset = 'pv' in output ? `${output.pv}` : 'pt' in output ? `${output.pt}s` : '';
    const current = !props.live
      ? ''
      : 'pv' in output
        ? `${props.live[`${output.a}:cv`] ?? 0}/`
        : `${(props.live[`${output.a}:et`] ?? 0).toFixed(1)}/`;
    const value = `${current}${preset}`;
    const active = props.live ? props.bit(props.live, output.a) : false;
    return (
      <>
        <path class="ld-line" classList={{ on: powered }} d={`M${outX} ${mid}H${outX + 8}M${end - 8} ${mid}H${end}`} />
        <rect class="ld-box" classList={{ on: powered, active }} x={outX + 8} y={mid - 13} width={OUT_W - 16} height="26" rx="2" />
        <text class="ld-text" x={outX + OUT_W / 2} y={mid - 2.5}>{`${output.t.toUpperCase()} ${output.a}`}</text>
        <text class="ld-text small" x={outX + OUT_W / 2} y={mid + 8.5}>{value}</text>
        <Show when={props.names[output.a]}>
          <text class="ld-text small" x={outX + OUT_W / 2} y={mid + 21}>{props.names[output.a]}</text>
        </Show>
      </>
    );
  };

  return (
    <svg class="ladder-svg" viewBox={`0 0 ${WIDTH} ${height()}`} role="img" aria-label={t('plc.rung', { n: props.index + 1 })}>
      <path class="ld-rail" d={`M${RAIL} 6V${height() - 6}M${WIDTH - RAIL} 6V${height() - 6}`} />
      <Index each={props.rung.cells}>
        {(row, r) => (
          <>
            <Index each={row()}>
              {(cell, c) => (
                <g>
                  {cellMarkup(cell(), r, c)}
                  <rect
                    class="ld-hit"
                    classList={{ selected: sameSpot(selected(), { rung: props.index, row: r, column: c }) }}
                    x={x(c) + 1}
                    y={r * CELL_H + 5}
                    width={CELL_W - 2}
                    height={CELL_H - 6}
                    rx="3"
                    onClick={() => props.onCell({ rung: props.index, row: r, column: c })}
                  />
                </g>
              )}
            </Index>
            <g>
              {outputMarkup(props.rung.outputs[r] ?? null, r)}
              <rect
                class="ld-hit"
                classList={{ selected: sameSpot(selected(), { rung: props.index, row: r, column: COLUMNS }) }}
                x={outX + 1}
                y={r * CELL_H + 5}
                width={OUT_W - 2}
                height={CELL_H - 6}
                rx="3"
                onClick={() => props.onOutput({ rung: props.index, row: r, column: COLUMNS })}
              />
            </g>
          </>
        )}
      </Index>
      <Index each={props.rung.links}>
        {(links, r) => (
          <Index each={links()}>
            {(linked, b) => (
              <>
                <Show when={linked()}>
                  <path class="ld-line" classList={{ on: on(r, b) }} d={`M${x(b)} ${y(r)}V${y(r + 1)}`} />
                </Show>
                <Show when={tool() === 'link'}>
                  <circle
                    class="ld-link"
                    classList={{ linked: linked() }}
                    cx={x(b)}
                    cy={(y(r) + y(r + 1)) / 2}
                    r="8"
                    onClick={() => props.onLink(r, b)}
                  />
                </Show>
              </>
            )}
          </Index>
        )}
      </Index>
    </svg>
  );
}
