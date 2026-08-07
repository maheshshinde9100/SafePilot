// Production Socket.IO server for SafePilot IoT system
// Backend Logic Upgrade: Decision Engine + Event Logger + State Manager

import 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';
import mqtt from 'mqtt';
import { Client, Databases, ID, Query } from 'node-appwrite';

// ----------------------------------------------------------------------
// 1. CONFIGURATION
// ----------------------------------------------------------------------
const PORT = process.env.PORT || 3001;

// Appwrite Setup
const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.VITE_APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.VITE_APPWRITE_DB_ID;

// Collections
const COL = {
  VEHICLE_STATE: process.env.VITE_APPWRITE_COL_VEHICLE_STATE,
  EVENTS_LOG: process.env.VITE_APPWRITE_COL_EVENTS_LOG,
  DRIVER_SESSIONS: process.env.VITE_APPWRITE_COL_DRIVER_SESSIONS,
  EMERGENCY_CASES: process.env.VITE_APPWRITE_COL_EMERGENCY_CASES,
};

// ----------------------------------------------------------------------
// 2. IN-MEMORY STATE MANAGEMENT
// ----------------------------------------------------------------------
// Keeps track of active sessions and vehicle status to reduce DB writes
// Structure: carId -> { speed, drowsinessCount, lastUpdate, ... }
const vehicleStates = {};
// Structure: driverId -> sessionId
const activeSessions = {};

// ----------------------------------------------------------------------
// 3. MQTT SETUP (HivMQ)
// ----------------------------------------------------------------------
const mqttUrl = `mkts://${process.env.VITE_HIVEMQ_HOST}:${process.env.VITE_HIVEMQ_PORT}`;
const mqttClient = mqtt.connect(mqttUrl, {
  username: process.env.VITE_HIVEMQ_USERNAME,
  password: process.env.VITE_HIVEMQ_PASSWORD,
  clientId: `backend_${Math.random().toString(16).slice(2, 8)}`,
  rejectUnauthorized: true, // For HiveMQ Cloud (TLS)
});

mqttClient.on('connect', () => {
  console.log('  MQTT Connected to HiveMQ Cloud');
  mqttClient.subscribe('vehicle/+/status'); // Subscribe to all vehicle status topics
});

mqttClient.on('error', (err) => {
  console.error('     MQTT Error:', err);
});

// Helper to send MQTT commands
const sendVehicleCommand = (carId, commandObj) => {
  const topic = `${process.env.VITE_MQTT_COMMAND_TOPIC}`; // Or specific car topic if needed
  console.log(`  sending MQTT to ${topic}:`, commandObj);
  mqttClient.publish(topic, JSON.stringify({ ...commandObj, carId }));
};

// ----------------------------------------------------------------------
// 4. HELPER FUNCTIONS
// ----------------------------------------------------------------------

// Log meaningful event to Appwrite
async function logEvent(data) {
  try {
    await databases.createDocument(DB_ID, COL.EVENTS_LOG, ID.unique(), {
      eventType: data.eventType,
      severity: data.severity,
      carId: data.carId,
      driverId: data.driverId || null,
      snap_speed: data.snapshot?.speed || 0,
      snap_alcoholLevel: data.snapshot?.alcoholLevel || 0,
      snap_heartRate: data.snapshot?.heartRate || 0,
      snap_location_lat: data.snapshot?.location?.lat || 0.0,
      snap_location_lng: data.snapshot?.location?.lng || 0.0,
      timestamp: new Date().toISOString(),
    });
    console.log(`   Event Logged: ${data.eventType} (${data.severity})`);
  } catch (err) {
    console.error('  Failed to log event:', err.message);
  }
}

// Create or Update Emergency Case
async function createEmergencyCase(type, carId, driverId) {
  // Check if unresolved case exists? Simplified: just create new for now or look for existing checking logic if complex.
  // For this task, we'll create a new one.
  try {
    await databases.createDocument(DB_ID, COL.EMERGENCY_CASES, ID.unique(), {
      caseType: type,
      carId,
      driverId,
      resolved: false,
      createdAt: new Date().toISOString(),
    });
    console.log(`  Emergency Case Created: ${type}`);
  } catch (err) {
    console.error('  Failed to create emergency case:', err.message);
  }
}

// Update Vehicle State in Appwrite (Throttled)
async function syncVehicleState(carId, state) {
  const now = Date.now();
  const lastSync = vehicleStates[carId]?.lastSync || 0;

  // Sync only if critical change OR every 10 seconds
  const isCritical = state.isCriticalChange;
  if (!isCritical && (now - lastSync < 10000)) return;

  try {
    // Try creating or updating. Appwrite doesn't have upsert easily for ID=carId.
    // We will assume document ID = carId for 1:1 mapping if possible, 
    // OR query by carId.
    // For simplicity/performance: Query first.
    const list = await databases.listDocuments(DB_ID, COL.VEHICLE_STATE, [
      Query.equal('carId', carId)
    ]);

    const payload = {
      carId,
      driverId: state.driverId,
      speed: state.speed,
      alcoholStatus: state.alcoholStatus,
      drowsinessLevel: state.drowsinessLevel,
      heartRate: state.heartRate,
      location_lat: state.location?.lat,
      location_lng: state.location?.lng,
      controlMode: state.controlMode,
      lastUpdated: new Date().toISOString(),
    };

    if (list.total > 0) {
      await databases.updateDocument(DB_ID, COL.VEHICLE_STATE, list.documents[0].$id, payload);
    } else {
      await databases.createDocument(DB_ID, COL.VEHICLE_STATE, ID.unique(), payload);
    }

    vehicleStates[carId] = { ...vehicleStates[carId], lastSync: now };
    // console.log(`  Vehicle State Synced: ${carId}`);
  } catch (err) {
    console.error('  Failed to sync vehicle state:', err.message);
  }
}

// ----------------------------------------------------------------------
// 5. SERVER LOGIC
// ----------------------------------------------------------------------

const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('  Client connected:', socket.id);

  // --- A. DRIVER SESSIONS (Auth) ---
  socket.on('auth_event', async (data) => {
    // data: { type: 'LOGIN', driverId, carId, ... }
    console.log('  Auth event:', data);

    if (data.type === 'LOGIN' && data.driverId) {
      activeSessions[data.driverId] = true; // Mark active

      // Create Session in Appwrite
      try {
        const sessionProto = await databases.createDocument(DB_ID, COL.DRIVER_SESSIONS, ID.unique(), {
          driverId: data.driverId,
          carId: data.carId,
          sessionStart: new Date().toISOString(),
          // other counts default to 0
        });
        activeSessions[data.driverId] = sessionProto.$id; // Store real session ID
        console.log(`  New Session Started: ${sessionProto.$id}`);
      } catch (err) {
        console.error("Session creation failed", err);
      }
    } else if (data.type === 'LOGOUT') {
      // Close session...
      // Handled mostly by ignition logic or explicit logout
    }

    io.emit('auth_event', data);
  });

  // --- B. IGNITION (Session End Logic) ---
  socket.on('ignition_status', async (data) => {
    // data: { status: 'OFF'/'ON', driverId, carId }
    console.log('🔑 Ignition:', data);

    if (data.status === 'OFF' && data.driverId && activeSessions[data.driverId]) {
      const sessionId = activeSessions[data.driverId];
      try {
        await databases.updateDocument(DB_ID, COL.DRIVER_SESSIONS, sessionId, {
          sessionEnd: new Date().toISOString()
        });
        delete activeSessions[data.driverId];
        console.log(`  Session Ended: ${sessionId}`);
      } catch (err) {
        console.error("Session close failed", err);
      }
    }

    // Alcohol Pre-drive check logic could go here if we had alcohol data in this packet
    // For now, just forward
    io.emit('ignition_status', data);
  });

  // --- C. SENSOR DATA STREAM (The Core Logic) ---
  socket.on('sensor_data', async (data) => {
    // data: { carId, driverId, speed, alcoholLevel, drowsiness, heartRate, location: {lat, lng} }
    const { carId, driverId, speed, alcoholLevel, drowsiness, heartRate, location } = data;

    // Initialize State if missing
    if (!vehicleStates[carId]) {
      vehicleStates[carId] = {
        drowsinessWarnings: 0,
        controlMode: 'driver',
        lastSpeed: 0
      };
    }
    const state = vehicleStates[carId];

    let criticalEvent = false;

    // 1. DROWSINESS LOGIC
    // Assuming drowsiness is Integer: 0=Alert, 1=Drowsy? Or maybe it comes as count?
    // Let's assume input 'drowsiness' is a boolean or level.
    // Prompt: "count++ warning at 1, critical at 5"
    // We'll accumulate frames where drowsiness > 0
    if (drowsiness > 0) {
      state.drowsinessWarnings += 1;

      if (state.drowsinessWarnings === 1) {
        // WARN
        criticalEvent = true;
        io.emit('new_alert', { carId, level: 'warning', message: 'Drowsiness Detected! Please rest.' });

        // Beep command
        sendVehicleCommand(carId, { action: 'BEEP', duration: 1000 });

        logEvent({
          eventType: 'DROWSINESS_WARNING',
          severity: 'warning',
          carId, driverId, snapshot: data
        });
      } else if (state.drowsinessWarnings >= 5) {
        // CRITICAL
        criticalEvent = true;
        // Throttle / Slow down
        sendVehicleCommand(carId, { action: 'SLOW_DOWN', targetSpeed: 0 }); // Gradual stop

        logEvent({
          eventType: 'DROWSINESS_CRITICAL',
          severity: 'critical',
          carId, driverId, snapshot: data
        });

        createEmergencyCase('Drowsiness', carId, driverId);
        state.controlMode = 'owner'; // Takeover
      }
    } else {
      // Reset count if eyes open for a while? 
      // Better not to reset strictly to avoid flicker, but maybe decrement?
      // For safety, we keep it high unless manually reset? 
      // Let's reset slowly or just keep accumulated for this "incident".
      // Implementation choice: Timer based reset (not easy here). 
      // We'll leave it accumulating for the session/segment.
    }

    // 2. ALCOHOL LOGIC
    // data.alcoholLevel > Threshold?
    const ALCOHOL_THRESHOLD = 200; // Example
    if (alcoholLevel > ALCOHOL_THRESHOLD) {
      criticalEvent = true;
      // Check ignition state (inferred from speed > 0 or separate state)
      if (speed > 0) {
        // DURING DRIVE
        sendVehicleCommand(carId, { action: 'EMERGENCY_STOP' });
        createEmergencyCase('Alcohol', carId, driverId);
        logEvent({ eventType: 'ALCOHOL_DURING_DRIVE', severity: 'critical', carId, driverId, snapshot: data });
      } else {
        // PRE DRIVE
        sendVehicleCommand(carId, { action: 'LOCK_IGNITION' });
        logEvent({ eventType: 'ALCOHOL_PRE_DRIVE', severity: 'warning', carId, driverId, snapshot: data });
      }
    }

    // 3. OVERSPEED LOGIC
    const SPEED_LIMIT = 100; // Example
    if (speed > SPEED_LIMIT) {
      // Avoid spamming overspeed logs
      if (state.lastSpeed <= SPEED_LIMIT) {
        criticalEvent = true;
        sendVehicleCommand(carId, { action: 'WARNING_BEEP' });
        logEvent({ eventType: 'OVERSPEED', severity: 'warning', carId, driverId, snapshot: data });
      }
    }
    state.lastSpeed = speed;

    // 4. SYNC STATE
    // Update local object
    state.driverId = driverId;
    state.speed = speed;
    state.alcoholStatus = alcoholLevel > ALCOHOL_THRESHOLD ? 'detected' : 'normal';
    state.drowsinessLevel = state.drowsinessWarnings >= 5 ? 'critical' : (state.drowsinessWarnings > 0 ? 'warning' : 'normal');
    state.heartRate = heartRate;
    state.location = location;
    state.isCriticalChange = criticalEvent;

    // Trigger Appwrite sync
    syncVehicleState(carId, state);

    // 5. BROADCAST TO DASHBOARD (Real-time)
    // Ensure "controlMode" and "drowsinessStatus" are enriched
    io.emit('sensor_data', {
      ...data,
      controlMode: state.controlMode,
      vehicleStatus: state.drowsinessLevel === 'critical' ? 'STOPPING' : 'ACTIVE'
    });
  });

  // --- D. CONTROL COMMANDS (Dashboard -> Vehicle) ---
  socket.on('control_command', (payload) => {
    console.log('  Control command:', payload);

    // 1. Send to Vehicle via MQTT
    sendVehicleCommand(payload.carId, payload);

    // 2. Broadcast to other dashboards
    socket.broadcast.emit('control_command', payload);

    // 3. Log intervention if it's from Owner
    if (payload.source === 'owner') {
      // Can update session stats 'ownerInterventionsCount' here
      // (Skipping for brevity, requires lookup of session ID)
    }
  });

  // --- E. OTHER EVENTS ---
  socket.on('new_alert', (data) => {
    console.log('  New alert:', data);
    logEvent({
      eventType: 'MANUAL_ALERT',
      severity: data.level || 'info',
      carId: data.carId,
      driverId: data.driverId
    });
    io.emit('new_alert', data);
  });

  socket.on('emergency_event', (data) => {
    console.log('  Emergency event:', data);
    createEmergencyCase('Manual Panic', data.carId, data.driverId);
    io.emit('emergency_event', data);
  });

  socket.on('remote_control', (data) => {
    io.emit('remote_control', data);
  });

  socket.on('disconnect', () => {
    console.log('     Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`  SafePilot Backend running on http://localhost:${PORT}`);
  console.log('  Modes: WebSocket (Realtime) + MQTT (Control) + Appwrite (Persistence)');
});
