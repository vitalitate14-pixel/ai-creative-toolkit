export interface PresetSheetConfig {
  sheetId: string;
  sheetName?: string;
  submitUrl?: string;
}

export interface SheetPresetRow {
  user: string;
  category: string;
  presetLabel: string;
  prompt: string;
  categoryOrder?: number;
  presetOrder?: number;
}

export const DEFAULT_PRESET_SUBMIT_URL = ''; // Remote preset submission has been removed.

export type SheetPresetSaveRow = Omit<SheetPresetRow, 'user'>;

export interface SavePresetRowsParams {
  userName: string;
  rows: SheetPresetSaveRow[];
  config: PresetSheetConfig;
  ensureHeaderRow?: boolean;
}

// Compatibility names retained for existing tool callbacks; all records stay on this device.
import { db, doc, getDoc, setDoc } from './localFirestore';
function presetRef(userName: string, config: PresetSheetConfig) {
  return doc(db, 'localPresetRows', encodeURIComponent((userName || '本机').trim().toLowerCase() + ':' + (config.sheetName || 'StudioPresets')));
}
export async function fetchUserPresetsFromSheet(userName: string, config: PresetSheetConfig): Promise<SheetPresetRow[]> {
  return (await getDoc(presetRef(userName, config))).data()?.rows || [];
}
export async function savePresetRowsToSheet({ userName, rows, config }: SavePresetRowsParams): Promise<void> {
  const ref = presetRef(userName, config);
  const previous = (await getDoc(ref)).data()?.rows || [];
  // Different tools share this callback: replace only the categories being saved.
  const categories = new Set(rows.map(row => row.category));
  const merged = [...previous.filter((row: SheetPresetRow) => !categories.has(row.category)), ...rows.map(row => ({ ...row, user: userName || '本机' }))];
  await setDoc(ref, { rows: merged });
}
