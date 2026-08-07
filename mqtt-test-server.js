require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');

// Simple MQTT-like WebSocket server for testing
const server = http.createServer();
const wss = new WebSocket.Server({ server });

let vehicleState = {
  drive: { direction: 'stop', speed: 0 },
  steer: { direction: 'center' },
  uptime: 0,
  rssi: -45,
  temperature: 25,
  battery: 100
};

// Update uptime every second
setInterval(() => {
  vehicleState.uptime += 1000;
}, 1000);

wss.on('connection', (ws) => {
  console.log('🔌 Client connected to MQTT test server');
  
  // Send initial status
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'status',
      ...vehicleState
    }));
  }, 1000);

  ws.on('message', (data) => {
    try {
      const command = JSON.parse(data.toString());
      console.log('  Received command:', command);
      
      // Process commands
      switch (command.type) {
        case 'drive':
          vehicleState.drive = {
            direction: command.direction,
            speed: command.speed || 0
          };
          console.log(`  Drive: ${command.direction} at ${command.speed} PWM`);
          break;
          
        case 'steer':
          vehicleState.steer = {
            direction: command.direction
          };
          console.log(`  Steer: ${command.direction}`);
          break;
          
        case 'emergency_stop':
          vehicleState.drive = { direction: 'stop', speed: 0 };
          vehicleState.steer = { direction: 'center' };
          console.log('  EMERGENCY STOP!');
          break;
          
        case 'status_request':
          // Send current status
          ws.send(JSON.stringify({
            type: 'status',
            ...vehicleState
          }));
          return;
      }
      
      // Send updated status back
      ws.send(JSON.stringify({
        type: 'status',
        ...vehicleState
      }));
      
    } catch (error) {
      console.error('     Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Client disconnected from MQTT test server');
  });

  ws.on('error', (error) => {
    console.error('     WebSocket error:', error);
  });
});

const PORT = process.env.MQTT_TEST_PORT || 3002;
server.listen(PORT, () => {
  console.log('  MQTT Test Server running on port', PORT);
  console.log('  WebSocket endpoint: ws://localhost:' + PORT);
  console.log('  Use this for testing vehicle controls without real MQTT broker');
  console.log('');
  console.log('Vehicle State:');
  console.log('- Drive:', vehicleState.drive);
  console.log('- Steer:', vehicleState.steer);
  console.log('- Uptime:', vehicleState.uptime + 'ms');
  console.log('- RSSI:', vehicleState.rssi + 'dBm');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n  Shutting down MQTT test server...');
  server.close(() => {
    console.log('  Server closed');
    process.exit(0);
  });
});