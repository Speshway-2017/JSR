import { CloudUpload, RefreshCw, X } from 'lucide-react';

export default function UtilConfirmModal({ action, open, onClose, onConfirm, busy }) {
  if (!open || !action) return null;

  const isRestore = action === 'restore';
  const title = isRestore ? 'Restore from MongoDB Atlas' : 'Backup to MongoDB Atlas';
  const description = isRestore
    ? 'Replace the local database with data from MongoDB Atlas? Unsaved local work on this computer will be lost.'
    : 'Copy this computer’s database to MongoDB Atlas? This replaces the current cloud copy.';

  const confirmText = isRestore ? 'Confirm Restore' : 'Confirm Backup';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]">
      <div className="card w-full max-w-md space-y-4 shadow-xl border border-primary-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {isRestore ? (
              <RefreshCw className="w-5 h-5 text-accent-600" />
            ) : (
              <CloudUpload className="w-5 h-5 text-primary-600" />
            )}
            <h2 className="text-lg font-bold text-primary-800">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-500 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-primary-600 leading-relaxed">{description}</p>

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-secondary flex-1 !py-2.5 !text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 !py-2.5 !text-sm ${
              isRestore ? 'btn-accent' : 'btn-primary'
            } disabled:opacity-50`}
          >
            {busy ? 'Processing…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
