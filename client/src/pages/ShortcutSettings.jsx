import { useEffect, useState } from 'react';
import { Save, Keyboard, RotateCcw, Command } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMDI, AVAILABLE_SHORTCUT_OPTIONS, DEFAULT_SHORTCUTS } from '../context/MDIContext';

const FUNCTION_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

function bindingToValue(binding) {
  if (!binding || binding.action === 'none') return 'none';
  if (binding.type === 'window') return `window:${binding.action}`;
  if (binding.type === 'module') return `module:${binding.path}`;
  return 'none';
}

function valueToBinding(value) {
  if (!value || value === 'none') {
    return { type: 'none', action: 'none', label: 'None / Disabled' };
  }
  const match = AVAILABLE_SHORTCUT_OPTIONS.find((opt) => opt.value === value);
  if (!match) return { type: 'none', action: 'none', label: 'None / Disabled' };

  if (match.type === 'window') {
    return { type: 'window', action: match.action, label: match.label };
  }
  if (match.type === 'module') {
    return { type: 'module', path: match.path, title: match.title, label: match.label };
  }
  return { type: 'none', action: 'none', label: 'None / Disabled' };
}

export default function ShortcutSettings() {
  const { shortcuts, updateShortcuts, resetShortcuts } = useMDI();
  const [localShortcuts, setLocalShortcuts] = useState(shortcuts || DEFAULT_SHORTCUTS);

  useEffect(() => {
    setLocalShortcuts(shortcuts || DEFAULT_SHORTCUTS);
  }, [shortcuts]);

  const handleShortcutChange = (key, value) => {
    const newBinding = valueToBinding(value);
    setLocalShortcuts((prev) => ({
      ...prev,
      [key]: newBinding,
    }));
  };

  const handleSaveShortcuts = (e) => {
    e.preventDefault();
    updateShortcuts(localShortcuts);
    toast.success('Shortcut settings saved');
  };

  const handleResetShortcuts = () => {
    if (window.confirm('Reset all function key shortcuts to defaults?')) {
      resetShortcuts();
      setLocalShortcuts(DEFAULT_SHORTCUTS);
      toast.success('Shortcuts reset to defaults');
    }
  };

  const generalGroup = AVAILABLE_SHORTCUT_OPTIONS.filter((o) => o.group === 'General');
  const windowGroup = AVAILABLE_SHORTCUT_OPTIONS.filter((o) => o.group === 'Window Actions');
  const moduleGroup = AVAILABLE_SHORTCUT_OPTIONS.filter((o) => o.group === 'Application Modules');

  return (
    <div className="space-y-2.5 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="page-title text-2xl font-bold text-primary-700 flex items-center gap-2">
            <Keyboard className="w-6 h-6 text-primary-600" /> Shortcut Settings
          </h1>
          <p className="text-xs text-primary-500 mt-1">
            Customize function keys (F1 – F12) to open application modules or control internal windows
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveShortcuts} className="card !p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-primary-100">
          <div>
            <h2 className="font-bold text-primary-800 text-sm">Function Key Customization (F1 – F12)</h2>
            <p className="text-xs text-primary-500 mt-0.5">
              Assign function keys to trigger window actions or open pages
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetShortcuts}
            className="btn-secondary !py-1.5 !px-3 !text-xs font-semibold self-start sm:self-auto cursor-pointer shadow-2xs flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {FUNCTION_KEYS.map((key) => {
            const currentVal = bindingToValue(localShortcuts[key]);
            return (
              <div
                key={key}
                className="flex items-center gap-2.5 p-2 rounded-lg border border-primary-200 bg-surface hover:border-primary-300 transition"
              >
                <span className="w-10 h-9 flex items-center justify-center font-bold text-xs bg-primary-100 text-primary-800 rounded-lg border border-primary-200 shrink-0">
                  {key}
                </span>
                <div className="flex-1 min-w-0">
                  <select
                    className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 cursor-pointer transition"
                    value={currentVal}
                    onChange={(e) => handleShortcutChange(key, e.target.value)}
                  >
                    <optgroup label="General">
                      {generalGroup.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Window Controls">
                      {windowGroup.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Application Modules">
                      {moduleGroup.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        {/* Built-in Navigation Shortcuts Info Box */}
        <div className="bg-primary-50/70 border border-primary-200 rounded-lg p-3 space-y-2">
          <h3 className="font-semibold text-xs text-primary-700 uppercase tracking-wide flex items-center gap-1.5">
            <Command className="w-4 h-4 text-primary-600" /> Built-in Window Navigation Shortcuts
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-primary-700">
            <div className="flex items-center justify-between bg-surface px-3 py-1.5 rounded-lg border border-primary-200">
              <span className="text-xs font-medium">Switch to Next Open Window</span>
              <kbd className="font-mono bg-primary-100 px-2 py-0.5 rounded text-xs font-bold text-primary-800 border border-primary-200">
                Ctrl + Tab
              </kbd>
            </div>
            <div className="flex items-center justify-between bg-surface px-3 py-1.5 rounded-lg border border-primary-200">
              <span className="text-xs font-medium">Switch to Previous Window</span>
              <kbd className="font-mono bg-primary-100 px-2 py-0.5 rounded text-xs font-bold text-primary-800 border border-primary-200">
                Ctrl + Shift + Tab
              </kbd>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary !py-2 !px-4 !text-sm font-semibold flex items-center justify-center gap-2 w-full cursor-pointer shadow-2xs"
        >
          <Save className="w-4 h-4" /> Save Shortcut Settings
        </button>
      </form>
    </div>
  );
}
