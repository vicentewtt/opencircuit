import { completeFromList } from '@codemirror/autocomplete';
import { cpp, cppLanguage } from '@codemirror/lang-cpp';
import { setDiagnostics, type Diagnostic as LintDiagnostic } from '@codemirror/lint';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, basicSetup } from 'codemirror';
import type { Diagnostic } from '../avr/toolchain';

/** CodeMirror set up for Arduino sketches. Loaded on demand with the code panel. */

const fn = (label: string, detail = ''): { label: string; type: string; detail: string } => ({
  label,
  type: 'function',
  detail,
});
const constant = (label: string): { label: string; type: string } => ({ label, type: 'constant' });

const ARDUINO_COMPLETIONS = [
  fn('pinMode', '(pin, mode)'),
  fn('digitalWrite', '(pin, value)'),
  fn('digitalRead', '(pin)'),
  fn('analogRead', '(pin)'),
  fn('analogWrite', '(pin, value)'),
  fn('delay', '(ms)'),
  fn('delayMicroseconds', '(us)'),
  fn('millis', '()'),
  fn('micros', '()'),
  fn('map', '(value, fromLow, fromHigh, toLow, toHigh)'),
  fn('constrain', '(value, low, high)'),
  fn('random', '(max)'),
  fn('randomSeed', '(seed)'),
  fn('tone', '(pin, frequency)'),
  fn('noTone', '(pin)'),
  fn('pulseIn', '(pin, value)'),
  fn('shiftOut', '(dataPin, clockPin, bitOrder, value)'),
  fn('attachInterrupt', '(interrupt, isr, mode)'),
  fn('digitalPinToInterrupt', '(pin)'),
  fn('setup', '()'),
  fn('loop', '()'),
  fn('Serial.begin', '(baud)'),
  fn('Serial.print', '(value)'),
  fn('Serial.println', '(value)'),
  fn('Serial.available', '()'),
  fn('Serial.read', '()'),
  fn('Serial.parseInt', '()'),
  fn('Serial.readStringUntil', '(terminator)'),
  ...['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'RISING', 'FALLING', 'CHANGE']
    .map(constant),
  ...['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'MSBFIRST', 'LSBFIRST', 'PI'].map(constant),
  ...['byte', 'boolean', 'String', 'uint8_t', 'uint16_t', 'uint32_t', 'int16_t', 'int32_t'].map(
    (label) => ({ label, type: 'type' }),
  ),
  ...['Servo', 'LiquidCrystal', 'LiquidCrystal_I2C', 'Adafruit_NeoPixel', 'DHT', 'Keypad', 'Stepper'].map(
    (label) => ({ label, type: 'class' }),
  ),
];

export interface CodeEditor {
  setText(text: string): void;
  setDark(dark: boolean): void;
  setReadOnly(readOnly: boolean): void;
  /** Marks compiler messages on their lines. */
  setDiagnostics(diagnostics: readonly Diagnostic[]): void;
  goToLine(line: number): void;
  destroy(): void;
}

export function createCodeEditor(
  parent: HTMLElement,
  options: { text: string; dark: boolean; readOnly: boolean; onChange: (text: string) => void },
): CodeEditor {
  const theme = new Compartment();
  const editable = new Compartment();
  /** True while the content is being replaced from outside (not typed). */
  let syncing = false;

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        basicSetup,
        cpp(),
        cppLanguage.data.of({ autocomplete: completeFromList(ARDUINO_COMPLETIONS) }),
        theme.of(options.dark ? oneDark : []),
        editable.of(EditorState.readOnly.of(options.readOnly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncing) options.onChange(update.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    setText(text) {
      if (text === view.state.doc.toString()) return;
      syncing = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      syncing = false;
    },
    setDark(dark) {
      view.dispatch({ effects: theme.reconfigure(dark ? oneDark : []) });
    },
    setReadOnly(readOnly) {
      view.dispatch({ effects: editable.reconfigure(EditorState.readOnly.of(readOnly)) });
    },
    setDiagnostics(diagnostics) {
      const lines = view.state.doc.lines;
      const marks: LintDiagnostic[] = [];
      for (const diagnostic of diagnostics) {
        if (diagnostic.line < 1 || diagnostic.line > lines) continue;
        const line = view.state.doc.line(diagnostic.line);
        marks.push({
          from: line.from,
          to: Math.max(line.from, line.to),
          severity: diagnostic.severity,
          message: diagnostic.message,
        });
      }
      view.dispatch(setDiagnostics(view.state, marks));
    },
    goToLine(line) {
      if (line < 1 || line > view.state.doc.lines) return;
      const target = view.state.doc.line(line);
      view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true });
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}
