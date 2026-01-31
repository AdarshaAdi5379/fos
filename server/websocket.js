const WebSocket = require('ws');

class WebSocketManager {
  constructor() {
    this.wss = null;
    this.clients = new Set();
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws) => {
      console.log('New WebSocket connection established');
      this.clients.add(ws);

      ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send initial connection confirmation
      ws.send(JSON.stringify({ type: 'connected', message: 'Connected to Unbound' }));
    });
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch (error) {
          console.error('Error sending message to client:', error);
          this.clients.delete(client);
        }
      }
    });
  }

  broadcastNewPost(post) {
    this.broadcast({
      type: 'new_post',
      data: post
    });
  }

  broadcastPostUpdate(post) {
    this.broadcast({
      type: 'post_updated',
      data: post
    });
  }

  getConnectedClientsCount() {
    return this.clients.size;
  }
}

module.exports = WebSocketManager;