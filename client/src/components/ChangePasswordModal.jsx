import { useState } from 'react';
import { Eye, EyeOff, KeyRound, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';

export default function ChangePasswordModal({ open, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast.error('Fill in all fields');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword === currentPassword) {
      toast.error('New password must be different from current');
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password updated');
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40">
      <div className="card w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-bold text-primary-800">Change password</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-primary-50 text-primary-500"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Current password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                className="input-field !pr-11"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600"
                aria-label={showCurrent ? 'Hide' : 'Show'}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">New password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                className="input-field !pr-11"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600"
                aria-label={showNew ? 'Hide' : 'Show'}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-primary-400 mt-1">At least 6 characters</p>
          </div>

          <div>
            <label className="label">Confirm new password</label>
            <input
              type={showNew ? 'text' : 'password'}
              className="input-field"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={handleClose} className="btn-secondary flex-1 !py-3">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 !py-3 disabled:opacity-50">
              {saving ? 'Saving…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
