import { LogOut, X } from 'lucide-react';

export default function LogoutConfirmModal({ open, onClose, onConfirm }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]">
      <div className="card w-full max-w-sm space-y-4 shadow-xl border border-primary-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-50 text-red-500">
              <LogOut className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-primary-800">Log out of JSR</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-500"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-primary-600 leading-relaxed">
          Are you sure you want to log out of your account?
        </p>

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary flex-1 !py-2.5 !text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 !py-2.5 !text-sm bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl shadow-soft transition active:scale-[0.98]"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
