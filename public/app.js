// Roll Sheet Client
// This is a placeholder - functionality will be added incrementally

(function() {
  'use strict';

  // WebSocket connection
  let ws = null;

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to server');
    };

    ws.onmessage = (event) => {
      console.log('Received:', event.data);
      // Message handling will be implemented later
    };

    ws.onclose = () => {
      console.log('Disconnected from server');
      // Attempt to reconnect after 2 seconds
      setTimeout(connect, 2000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    console.log('Roll Sheet initialized');
    connect();
  });
})();
