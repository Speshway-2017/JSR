import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    // Connect dynamically based on window.location or fallback to standard server port
    const isHttp = typeof window !== 'undefined' && window.location.protocol.startsWith('http');
    const socketUrl = isHttp ? window.location.origin : 'http://127.0.0.1:5050';

    socket = io(socketUrl, {
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket.io] Connected to server:', socket.id);
    });

    const handleDataEvent = (payload) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('jsr_data_updated', { detail: payload }));
        window.dispatchEvent(new CustomEvent('jsr:data-updated', { detail: payload }));
        window.dispatchEvent(new Event('jsr:data-restored'));
      }
    };

    socket.on('jsr:data-updated', handleDataEvent);
    socket.on('jsr_data_updated', handleDataEvent);
    socket.on('jsr:data-restored', handleDataEvent);

    socket.on('disconnect', (reason) => {
      console.warn('[Socket.io] Disconnected from server:', reason);
    });
  }

  return socket;
}

// Auto-initialize socket connection on module import
getSocket();
