import React from 'react';
import { X, FileText, Layout, Columns2, Rows3, Sun, Moon, Monitor } from 'lucide-react';
import {
  type SolveLayout, type DocSolutionPlacement, type ToolbarDock, type ThemeMode,
  type SaveNotificationMode, type AppSettings, saveSettings,
} from '../utils/settings';
import { resetAllOnboarding } from '../utils/onboarding';

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
  onClose: () => void;
}

const layouts: { id: SolveLayout; label: string; icon: React.ReactNode }[] = [
  { id: 'classic', label: 'Klasik', icon: <Layout size={22} /> },
  { id: 'document', label: 'Belge', icon: <FileText size={22} /> },
];

const docPlacements: { id: DocSolutionPlacement; label: string; icon: React.ReactNode }[] = [
  { id: 'side', label: 'Yanda', icon: <Columns2 size={20} /> },
  { id: 'below', label: 'Sonraki soru', icon: <Rows3 size={20} /> },
];

const docks: { id: ToolbarDock; label: string }[] = [
  { id: 'right', label: 'Sağ' },
  { id: 'left', label: 'Sol' },
  { id: 'bottom', label: 'Alt' },
];

const themes: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { id: 'system', label: 'Sistem', icon: <Monitor size={18} /> },
  { id: 'light', label: 'Açık', icon: <Sun size={18} /> },
  { id: 'dark', label: 'Koyu', icon: <Moon size={18} /> },
];

const saveNotifications: { id: SaveNotificationMode; label: string; desc: string }[] = [
  { id: 'off', label: 'Kapalı', desc: 'Üst çubukta gösterme' },
  { id: 'error_only', label: 'Yalnızca hata', desc: 'Önerilen' },
  { id: 'brief', label: 'Kısa onay', desc: 'Kayıt sonrası ✓' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onChange, onClose }) => {
  const update = (patch: Partial<AppSettings>) => onChange(saveSettings(patch));
  const docPlacement = settings.docSolutionPlacement ?? 'side';

  return (
    <div className="settings-sheet-backdrop" onClick={onClose}>
      <div className="settings-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Ayarlar">
        <div className="settings-sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px', borderBottom: '1px solid var(--glass-border)' }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>Ayarlar</span>
          <button type="button" onClick={onClose} className="sidebar-toggle-btn" aria-label="Kapat"><X size={16} /></button>
        </div>

        <div style={{ padding: '16px 20px 28px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', maxHeight: 'calc(88vh - 80px)' }}>
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Tema</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {themes.map(t => (
                <button key={t.id} type="button" onClick={() => update({ themeMode: t.id })} className={`pdf-mode-tab${(settings.themeMode ?? 'system') === t.id ? ' is-active--question' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t.icon}
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{t.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Araç çubuğu</div>
            <div className="pdf-mode-tabs" style={{ width: '100%' }}>
              {docks.map(d => (
                <button key={d.id} type="button" className={`pdf-mode-tab${(settings.toolbarDock ?? 'right') === d.id ? ' is-active--question' : ''}`} style={{ flex: 1, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => update({ toolbarDock: d.id })}>{d.label}</button>
              ))}
            </div>
          </section>

          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Çözme ekranı</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {layouts.map(l => {
                const active = settings.solveLayout === l.id;
                return (
                  <button key={l.id} type="button" onClick={() => update({ solveLayout: l.id })} style={{
                    flex: 1, padding: '14px 12px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                    background: active ? 'rgba(10,132,255,0.12)' : 'var(--sidebar-item-hover)',
                    border: active ? '2px solid rgba(10,132,255,0.5)' : '1px solid var(--glass-border)',
                  }}>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>{l.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'center' }}>{l.label}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {settings.solveLayout === 'document' && (
            <section>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Çözüm konumu</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {docPlacements.map(p => (
                  <button key={p.id} type="button" onClick={() => update({ docSolutionPlacement: p.id })} style={{
                    flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                    background: docPlacement === p.id ? 'rgba(48,209,88,0.1)' : 'var(--sidebar-item-hover)',
                    border: docPlacement === p.id ? '2px solid rgba(48,209,88,0.45)' : '1px solid var(--glass-border)',
                  }}>
                    <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}>{p.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'center' }}>{p.label}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Kayıt bildirimi</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {saveNotifications.map(n => {
                const active = (settings.saveNotification ?? 'error_only') === n.id;
                return (
                  <button key={n.id} type="button" onClick={() => update({ saveNotification: n.id })} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    background: active ? 'rgba(10,132,255,0.12)' : 'var(--sidebar-item-hover)',
                    border: active ? '2px solid rgba(10,132,255,0.5)' : '1px solid var(--glass-border)',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{n.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{n.desc}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Apple Pencil (web)</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              Safari’de çift dokunuş ve sıkıştırma çoğu zaman web uygulamasına ulaşmaz. Silgi ve tüm çözümler için çözüm ekranındaki araç çubuğunu kullanın.
              iOS Ayarlar → Apple Pencil → Çift Dokunuş “Yok” olmamalı. Sıkıştırma yalnızca Apple Pencil Pro’dadır.
            </p>
          </section>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--sidebar-item-hover)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>El reddi</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Tablet için önerilir</div>
            </div>
            <button type="button" onClick={() => update({ palmRejection: !settings.palmRejection })} style={{
              width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', position: 'relative',
              background: settings.palmRejection ? '#30d158' : 'var(--glass-border)',
            }}>
              <div style={{ position: 'absolute', top: 2, left: settings.palmRejection ? 22 : 2, width: 24, height: 24, borderRadius: 12, background: '#fff', transition: 'left 0.2s' }} />
            </button>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center', fontFamily: 'inherit' }}
            onClick={() => resetAllOnboarding()}
          >
            İpuçlarını sıfırla
          </button>
        </div>
      </div>
    </div>
  );
};
