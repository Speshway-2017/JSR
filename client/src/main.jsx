import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import LicenseGate from './components/LicenseGate';
import './utils/socket';
import './index.css';

// Auto-select text on focus for all input & textarea fields throughout the application
if (typeof window !== 'undefined') {
  window.addEventListener(
    'focusin',
    (e) => {
      const el = e.target;
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
        !['button', 'submit', 'checkbox', 'radio', 'file', 'image', 'range', 'color'].includes(el.type)
      ) {
        setTimeout(() => {
          if (document.activeElement === el && typeof el.select === 'function') {
            try {
              el.select();
            } catch (err) {
              // Ignore non-selectable inputs
            }
          }
        }, 0);
      }
    },
    true
  );
}

function Root() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <LicenseGate>
        <div className="h-[100dvh] box-border flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            <App />
          </div>
        </div>
        </LicenseGate>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#e6ede8',
              color: '#425448',
              border: '1px solid #cdd9d0',
              borderRadius: '12px',
              fontSize: '15px',
              padding: '12px 20px',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
