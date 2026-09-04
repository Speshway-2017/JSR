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
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Keyboard className="w-7 h-7 text-primary-500" /> Shortcut Settings
        </h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Customize function keys (F1 – F12) to open application modules or control internal windows
        </p>
      </div>

      <form onSubmit={handleSaveShortcuts} className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-primary-100">
          <div>
            <h2 className="font-bold text-primary-800 text-base">Function Key Customization (F1 – F12)</h2>
            <p className="text-xs text-primary-400">
              Assign function keys to trigger window actions or open pages
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetShortcuts}
            className="btn-secondary !py-1.5 !px-3 !text-xs self-start sm:self-auto cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FUNCTION_KEYS.map((key) => {
            const currentVal = bindingToValue(localShortcuts[key]);
            return (
              <div key={key} className="flex items-center gap-3 p-2.5 rounded-lg border border-primary-100 bg-surface">
                <span className="w-12 h-9 flex items-center justify-center font-bold text-xs bg-primary-100 text-primary-800 rounded-md border border-primary-200 shrink-0">
                  {key}
                </span>
                <div className="flex-1 min-w-0">
                  <select
                    className="input-field !py-1.5 !px-2.5 text-xs w-full cursor-pointer"
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
        <div className="bg-primary-50/70 border border-primary-100 rounded-xl p-3.5 space-y-2">
          <h3 className="font-semibold text-xs text-primary-700 flex items-center gap-1.5 uppercase tracking-wide">
            <Command className="w-4 h-4 text-primary-500" /> Built-in Window Navigation Shortcuts
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-primary-600">
            <div className="flex items-center justify-between bg-surface px-3 py-1.5 rounded-lg border border-primary-100">
              <span>Switch to Next Open Window</span>
              <kbd className="font-mono bg-primary-100 px-1.5 py-0.5 rounded text-[11px] font-bold text-primary-800">
                Ctrl + Tab
              </kbd>
            </div>
            <div className="flex items-center justify-between bg-surface px-3 py-1.5 rounded-lg border border-primary-100">
              <span>Switch to Previous Window</span>
              <kbd className="font-mono bg-primary-100 px-1.5 py-0.5 rounded text-[11px] font-bold text-primary-800">
                Ctrl + Shift + Tab
              </kbd>
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full cursor-pointer">
          <Save className="w-4 h-4" /> Save Shortcut Settings
        </button>
      </form>
    </div>
  );
}
