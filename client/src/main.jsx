import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import TitleBar, { useIsElectron } from './components/TitleBar';
import './index.css';

function Root() {
  const electron = useIsElectron();

  return (
    <BrowserRouter>
      <AuthProvider>
        <TitleBar />
        <div
          className={
            electron
              ? 'pt-10 h-[100dvh] box-border flex flex-col overflow-hidden'
              : 'h-[100dvh] flex flex-col overflow-hidden'
          }
        >
          <div className="flex-1 min-h-0 overflow-hidden">
            <App />
          </div>
        </div>
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
