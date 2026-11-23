import type { ColumnSettings } from "../../types";
import type { LineListTexts } from "./lineListInputs";

export interface ColumnSettingsFormState {
  settings: ColumnSettings;
  width: number;
  labelText: string;
  lineListTexts: LineListTexts;
}

function settingsChanged(a: ColumnSettings, b: ColumnSettings): boolean {
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...keys].some((key) => !Object.is(x[key], y[key]));
}

export function hasColumnSettingsChanges(
  initial: ColumnSettingsFormState,
  current: ColumnSettingsFormState,
): boolean {
  return (
    settingsChanged(initial.settings, current.settings) ||
    initial.width !== current.width ||
    initial.labelText !== current.labelText ||
    (Object.keys(initial.lineListTexts) as (keyof LineListTexts)[]).some(
      (key) => initial.lineListTexts[key] !== current.lineListTexts[key],
    )
  );
}
