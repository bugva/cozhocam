export type SolveLayout = 'classic' | 'document';
export type DocSolutionPlacement = 'side' | 'below';
export type BgStyle = 'plain' | 'grid';
export type ToolbarDock = 'right' | 'left' | 'bottom';
export type ThemeMode = 'system' | 'light' | 'dark';
export type SaveNotificationMode = 'off' | 'error_only' | 'brief';

export interface AppSettings {
  solveLayout: SolveLayout;
  docSolutionPlacement: DocSolutionPlacement;
  palmRejection: boolean;
  defaultBgStyle: BgStyle;
  toolbarDock: ToolbarDock;
  themeMode: ThemeMode;
  saveNotification: SaveNotificationMode;
}

const DEFAULTS: AppSettings = {
  solveLayout: 'document',
  docSolutionPlacement: 'side',
  palmRejection: true,
  defaultBgStyle: 'plain',
  toolbarDock: 'right',
  themeMode: 'system',
  saveNotification: 'error_only',
};

const KEY = 'cozhocam_settings';
const MIGRATION_KEY = 'cozhocam_settings_migrated_v2';
const SETTINGS_VERSION = 2;

const SOLVE_LAYOUTS: SolveLayout[] = ['classic', 'document'];
const DOC_PLACEMENTS: DocSolutionPlacement[] = ['side', 'below'];
const BG_STYLES: BgStyle[] = ['plain', 'grid'];
const TOOLBAR_DOCKS: ToolbarDock[] = ['right', 'left', 'bottom'];
const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];
const SAVE_NOTIFICATION_MODES: SaveNotificationMode[] = ['off', 'error_only', 'brief'];

function normalizeSettings(raw: Record<string, unknown>): AppSettings {
  const solveLayout = SOLVE_LAYOUTS.includes(raw.solveLayout as SolveLayout)
    ? (raw.solveLayout as SolveLayout)
    : DEFAULTS.solveLayout;
  const docSolutionPlacement = DOC_PLACEMENTS.includes(raw.docSolutionPlacement as DocSolutionPlacement)
    ? (raw.docSolutionPlacement as DocSolutionPlacement)
    : DEFAULTS.docSolutionPlacement;
  const defaultBgStyle = BG_STYLES.includes(raw.defaultBgStyle as BgStyle)
    ? (raw.defaultBgStyle as BgStyle)
    : DEFAULTS.defaultBgStyle;
  const toolbarDock = TOOLBAR_DOCKS.includes(raw.toolbarDock as ToolbarDock)
    ? (raw.toolbarDock as ToolbarDock)
    : DEFAULTS.toolbarDock;
  const themeMode = THEME_MODES.includes(raw.themeMode as ThemeMode)
    ? (raw.themeMode as ThemeMode)
    : DEFAULTS.themeMode;
  const saveNotification = SAVE_NOTIFICATION_MODES.includes(raw.saveNotification as SaveNotificationMode)
    ? (raw.saveNotification as SaveNotificationMode)
    : DEFAULTS.saveNotification;
  return {
    solveLayout,
    docSolutionPlacement,
    palmRejection: typeof raw.palmRejection === 'boolean' ? raw.palmRejection : DEFAULTS.palmRejection,
    defaultBgStyle,
    toolbarDock,
    themeMode,
    saveNotification,
  };
}

function runSettingsMigration(parsed: Record<string, unknown>): AppSettings {
  const normalized = normalizeSettings(parsed);
  if (localStorage.getItem(MIGRATION_KEY)) return normalized;
  const hadStoredLayout = typeof parsed.solveLayout === 'string';
  const next: AppSettings = {
    ...normalized,
    solveLayout: !hadStoredLayout || normalized.solveLayout === 'classic'
      ? 'document'
      : normalized.solveLayout,
  };
  localStorage.setItem(KEY, JSON.stringify({ ...next, _version: SETTINGS_VERSION }));
  localStorage.setItem(MIGRATION_KEY, '1');
  return next;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!localStorage.getItem(MIGRATION_KEY)) {
      return runSettingsMigration(parsed);
    }
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
