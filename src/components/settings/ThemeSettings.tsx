import React, { useState } from 'react';
import { Palette, Moon, Sun, Check, EyeOff, Eye } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  GRADIENT_PRESETS,
  COLOR_SUGGESTIONS,
  ACCENT_SUGGESTIONS,
} from '../../services/themeService';

/**
 * ThemeSettings — Owner-only theme customization.
 * Color palette, gradient presets, dark mode, white-label toggle.
 */
export const ThemeSettings: React.FC = () => {
  const { theme, updateTheme } = useTheme();
  const { userProfile } = useAuth();
  const { success, error: showError } = useToast();
  const [saving, setSaving] = useState(false);

  const isOwner = userProfile?.role === 'owner';

  const handleUpdate = async (patch: Partial<typeof theme>) => {
    if (!isOwner) {
      showError('Only the Owner can change theme settings.');
      return;
    }
    setSaving(true);
    try {
      await updateTheme(patch);
      success('Theme updated!');
    } catch (err: any) {
      showError(err.message || 'Failed to update theme.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner) return null;

  return (
    <Card padding="lg">
      <CardHeader
        title="Appearance & Theme"
        subtitle="Match the software to your company's brand colors"
      />

      <div className="space-y-6 mt-4">
        {/* Dark Mode Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-3">
            {theme.darkMode ? (
              <Moon className="w-5 h-5 text-indigo-500" />
            ) : (
              <Sun className="w-5 h-5 text-amber-500" />
            )}
            <div>
              <p className="text-sm font-semibold text-slate-900">Night Mode</p>
              <p className="text-xs text-slate-500">Soft dark theme — easy on the eyes</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleUpdate({ darkMode: !theme.darkMode })}
            disabled={saving}
            className={`relative w-12 h-7 rounded-full transition-colors ${
              theme.darkMode ? 'bg-indigo-600' : 'bg-slate-300'
            }`}
            aria-label="Toggle night mode"
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
                theme.darkMode ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* Primary Color */}
        <div>
          <p className="text-sm font-semibold text-slate-900 mb-2">Primary Color</p>
          <p className="text-xs text-slate-500 mb-3">Main brand color — buttons, headers, highlights</p>
          <div className="flex flex-wrap gap-2">
            {COLOR_SUGGESTIONS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleUpdate({ primaryColor: color })}
                disabled={saving}
                className={`w-10 h-10 rounded-xl border-2 transition-all ${
                  theme.primaryColor === color
                    ? 'border-slate-900 scale-110 shadow-lg'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: color }}
                title={color}
                aria-label={`Primary color ${color}`}
              >
                {theme.primaryColor === color && (
                  <Check className="w-5 h-5 text-white mx-auto" />
                )}
              </button>
            ))}
            <label className="w-10 h-10 rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-500 cursor-pointer flex items-center justify-center transition-all hover:scale-105" title="Custom color">
              <input
                type="color"
                value={theme.primaryColor}
                onChange={(e) => handleUpdate({ primaryColor: e.target.value })}
                disabled={saving}
                className="sr-only"
              />
              <Palette className="w-5 h-5 text-slate-400" />
            </label>
          </div>
        </div>

        {/* Accent Color */}
        <div>
          <p className="text-sm font-semibold text-slate-900 mb-2">Accent Color</p>
          <p className="text-xs text-slate-500 mb-3">Secondary highlights — badges, icons, gold details</p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_SUGGESTIONS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleUpdate({ accentColor: color })}
                disabled={saving}
                className={`w-10 h-10 rounded-xl border-2 transition-all ${
                  theme.accentColor === color
                    ? 'border-slate-900 scale-110 shadow-lg'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: color }}
                title={color}
                aria-label={`Accent color ${color}`}
              >
                {theme.accentColor === color && (
                  <Check className="w-5 h-5 text-white mx-auto" />
                )}
              </button>
            ))}
            <label className="w-10 h-10 rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-500 cursor-pointer flex items-center justify-center transition-all hover:scale-105" title="Custom color">
              <input
                type="color"
                value={theme.accentColor}
                onChange={(e) => handleUpdate({ accentColor: e.target.value })}
                disabled={saving}
                className="sr-only"
              />
              <Palette className="w-5 h-5 text-slate-400" />
            </label>
          </div>
        </div>

        {/* Gradient Presets */}
        <div>
          <p className="text-sm font-semibold text-slate-900 mb-2">Header Gradient</p>
          <p className="text-xs text-slate-500 mb-3">Gradient style for headers and hero areas</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(GRADIENT_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleUpdate({ gradient: key })}
                disabled={saving}
                className={`relative h-12 rounded-lg overflow-hidden border-2 transition-all ${
                  theme.gradient === key
                    ? 'border-slate-900 shadow-lg scale-[1.02]'
                    : 'border-transparent hover:scale-[1.02]'
                }`}
                style={{ background: theme.darkMode ? preset.darkCss : preset.css }}
                title={preset.name}
              >
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[11px] font-bold text-white px-2 text-center" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
                    {preset.name}
                  </span>
                </span>
                {theme.gradient === key && (
                  <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow">
                    <Check className="w-3 h-3 text-emerald-600" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* White-label toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-3">
            {theme.hidePoweredBy ? (
              <EyeOff className="w-5 h-5 text-slate-500" />
            ) : (
              <Eye className="w-5 h-5 text-slate-500" />
            )}
            <div>
              <p className="text-sm font-semibold text-slate-900">Hide "Powered by" Branding</p>
              <p className="text-xs text-slate-500">Your clients see only your company name</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleUpdate({ hidePoweredBy: !theme.hidePoweredBy })}
            disabled={saving}
            className={`relative w-12 h-7 rounded-full transition-colors ${
              theme.hidePoweredBy ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
            aria-label="Toggle white-label mode"
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
                theme.hidePoweredBy ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* Live Preview */}
        <div>
          <p className="text-sm font-semibold text-slate-900 mb-2">Preview</p>
          <div
            className="rounded-xl p-6 text-white"
            style={{ background: theme.darkMode 
              ? GRADIENT_PRESETS[theme.gradient]?.darkCss 
              : GRADIENT_PRESETS[theme.gradient]?.css 
            }}
          >
            <p className="text-lg font-bold" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>Your Company Name</p>
            {!theme.hidePoweredBy && (
              <p className="text-xs" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)', opacity: 0.9 }}>SafarDesk</p>
            )}
            <div className="mt-3 flex gap-2">
              <span
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: theme.primaryColor }}
              >
                Primary Button
              </span>
              <span
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: theme.accentColor }}
              >
                Accent
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
