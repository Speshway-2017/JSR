import toast from 'react-hot-toast';
import api from '../api';

/** User-facing copy when Atlas backup/restore cannot reach the internet. */
export function noInternetToast(action) {
  return `No internet connection. Connect to the internet to ${action}.`;
}

export function hasInternet() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function isAtlasOfflineError(err) {
  if (!hasInternet()) return true;
  if (err?.code === 'ERR_NETWORK') return true;
  const msg = `${err?.response?.data?.message || ''} ${err?.message || ''}`;
  return /no internet|internet connection|ENOTFOUND|EAI_AGAIN|ENETUNREACH|failed to connect|querySrv|getaddrinfo|network/i.test(
    msg
  );
}

const CONFIRM = {
  backup: 'Copy this computer’s database to MongoDB Atlas? This replaces the cloud copy.',
  restore:
    'Replace the local database with data from MongoDB Atlas? Unsaved local work will be lost.',
};

export async function runAtlasUtilAction(action) {
  const verb = action === 'restore' ? 'restore' : 'backup';
  if (!hasInternet()) {
    toast.error(noInternetToast(verb));
    return;
  }
  if (!window.confirm(CONFIRM[verb])) return;
  if (!hasInternet()) {
    toast.error(noInternetToast(verb));
    return;
  }

  const toastId = toast.loading(verb === 'restore' ? 'Restoring…' : 'Backing up…');
  try {
    const res = await api.post(`/util/${verb}`, {}, { timeout: 180000 });
    toast.success(
      `${res.data.message} · ${res.data.collections} collections, ${res.data.documents} documents`,
      { id: toastId }
    );
  } catch (err) {
    toast.error(
      isAtlasOfflineError(err)
        ? noInternetToast(verb)
        : err.response?.data?.message || err.message || `${verb} failed`,
      { id: toastId }
    );
  }
}
