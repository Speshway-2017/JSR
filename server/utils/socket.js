import { Server } from 'socket.io';

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    },
  });

  io.on('connection', (socket) => {
    socket.on('disconnect', () => {});
  });

  return io;
}

export function getIO() {
  return io;
}

export function notifyDataChange(entity, action, data = null) {
  if (io) {
    const payload = {
      entity: entity || 'general',
      action: action || 'update',
      data,
      timestamp: Date.now(),
    };
    io.emit('jsr:data-updated', payload);
    io.emit('jsr_data_updated', payload);
    io.emit('jsr:data-restored', payload);
  }
}
