import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";

// MQTT Configuration from environment
const MQTT_CONFIG = {
  host: import.meta.env.VITE_HIVEMQ_HOST,
  port: parseInt(import.meta.env.VITE_HIVEMQ_WS_PORT),
  username: import.meta.env.VITE_HIVEMQ_USERNAME ,
  password: import.meta.env.VITE_HIVEMQ_PASSWORD,
  clientId: 'safepilot-' + Math.random().toString(16).substr(2, 8),
  topics: {
    command: import.meta.env.VITE_MQTT_COMMAND_TOPIC || 'vehicle/control',
    status: import.meta.env.VITE_MQTT_STATUS_TOPIC || 'vehicle/status'
  }
};

export default function VehicleControl() {
  const { role } = useAuth();
  
  // MQTT Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [mqttClient, setMqttClient] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  
  // Vehicle State
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [driveStatus, setDriveStatus] = useState('STOPPED');
  const [steerStatus, setSteerStatus] = useState('CENTER');
  const [vehicleStatus, setVehicleStatus] = useState({
    uptime: 0,
    rssi: 0,
    temperature: 0,
    battery: 100
  });
  
  // Control State
  const [logs, setLogs] = useState([]);
  const accelerateInterval = useRef(null);
  const clientRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const isConnectingRef = useRef(false);
  
  const MAX_SPEED = parseInt(import.meta.env.VITE_MAX_SPEED) || 1023;
  const ACCELERATION_RATE = parseInt(import.meta.env.VITE_ACCELERATION_RATE) || 50;

  // Add log entry
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now() + Math.random(),
      timestamp,
      message,
      type
    };
    setLogs(prev => [logEntry, ...prev.slice(0, 19)]);
  }, []);

  // MQTT Connection
  const connectMQTT = useCallback(async () => {
    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current || isConnected) {
      console.log('Connection already in progress or established');
      return;
    }

    // Clear any pending reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    isConnectingRef.current = true;

    try {
      addLog('Connecting to MQTT broker...', 'info');
      setConnectionStatus('Connecting...');

      // Using Paho MQTT client (loaded via CDN in index.html)
      if (typeof Paho === 'undefined') {
        throw new Error('Paho MQTT library not loaded');
      }

      const client = new Paho.MQTT.Client(
        MQTT_CONFIG.host,
        MQTT_CONFIG.port,
        MQTT_CONFIG.clientId
      );

      client.onConnectionLost = (responseObject) => {
        console.log('MQTT Connection lost:', responseObject);
        setIsConnected(false);
        setConnectionStatus('Disconnected');
        isConnectingRef.current = false;
        
        if (responseObject.errorCode !== 0) {
          addLog('Connection lost: ' + responseObject.errorMessage, 'error');
          // Only auto-reconnect on unexpected disconnections
          addLog('Attempting to reconnect in 5 seconds...', 'warning');
          reconnectTimeoutRef.current = setTimeout(() => {
            connectMQTT();
          }, 5000);
        } else {
          addLog('Disconnected from MQTT broker', 'info');
        }
      };

      client.onMessageArrived = (message) => {
        try {
          const data = JSON.parse(message.payloadString);
          console.log('Message received:', data);
          if (data.type === 'status') {
            updateVehicleStatus(data);
          }
        } catch (e) {
          console.error('Error parsing message:', e);
          addLog('Error parsing message: ' + e.message, 'error');
        }
      };

      const connectOptions = {
        onSuccess: () => {
          console.log('MQTT Connected successfully');
          isConnectingRef.current = false;
          setIsConnected(true);
          setConnectionStatus('Connected');
          
          // Subscribe to status topic
          try {
            client.subscribe(MQTT_CONFIG.topics.status);
            addLog('Connected to MQTT broker!', 'success');
            addLog('Subscribed to: ' + MQTT_CONFIG.topics.status, 'success');
            
            // Request initial status
            const statusMsg = new Paho.MQTT.Message(JSON.stringify({ type: 'status_request' }));
            statusMsg.destinationName = MQTT_CONFIG.topics.command;
            client.send(statusMsg);
          } catch (err) {
            console.error('Error subscribing:', err);
            addLog('Error subscribing to topics: ' + err.message, 'error');
          }
        },
        onFailure: (message) => {
          console.error('MQTT Connection failed:', message);
          isConnectingRef.current = false;
          setIsConnected(false);
          setConnectionStatus('Failed');
          addLog('Connection failed: ' + message.errorMessage, 'error');
          addLog('Retrying in 5 seconds...', 'warning');
          reconnectTimeoutRef.current = setTimeout(() => {
            connectMQTT();
          }, 5000);
        },
        userName: MQTT_CONFIG.username,
        password: MQTT_CONFIG.password,
        useSSL: true,
        timeout: 15,
        keepAliveInterval: 30,
        cleanSession: false
      };

      client.connect(connectOptions);
      clientRef.current = client;
      setMqttClient(client);

    } catch (error) {
      console.error('Connection error:', error);
      isConnectingRef.current = false;
      addLog('Connection error: ' + error.message, 'error');
      setConnectionStatus('Error');
      addLog('Retrying in 5 seconds...', 'warning');
      reconnectTimeoutRef.current = setTimeout(() => {
        connectMQTT();
      }, 5000);
    }
  }, [isConnected, addLog]);

  // Send MQTT Command
  const sendCommand = useCallback((command) => {
    if (!isConnected || !clientRef.current) {
      addLog('Not connected to MQTT', 'error');
      return;
    }

    try {
      const message = new Paho.MQTT.Message(JSON.stringify(command));
      message.destinationName = MQTT_CONFIG.topics.command;
      clientRef.current.send(message);
      console.log('Command sent:', command);
      
      if (command.type !== 'status_request') {
        addLog('Sent: ' + JSON.stringify(command), 'info');
      }
    } catch (error) {
      console.error('Error sending command:', error);
      addLog('Error sending command: ' + error.message, 'error');
    }
  }, [isConnected, addLog]);

  // Update vehicle status from MQTT
  const updateVehicleStatus = useCallback((data) => {
    if (data.drive) {
      const direction = data.drive.direction.toUpperCase();
      const speed = data.drive.speed;
      setDriveStatus(direction);
      setCurrentSpeed(speed);
    }

    if (data.steer) {
      setSteerStatus(data.steer.direction.toUpperCase());
    }

    if (data.uptime || data.rssi || data.temperature || data.battery) {
      setVehicleStatus(prev => ({
        ...prev,
        uptime: data.uptime || prev.uptime,
        rssi: data.rssi || prev.rssi,
        temperature: data.temperature || prev.temperature,
        battery: data.battery || prev.battery
      }));
    }
  }, []);

  // Control Functions
  const startAccelerate = useCallback(() => {
    stopDrive();
    accelerateInterval.current = setInterval(() => {
      setCurrentSpeed(prev => {
        const newSpeed = Math.min(prev + ACCELERATION_RATE, MAX_SPEED);
        sendCommand({
          type: 'drive',
          direction: 'forward',
          speed: newSpeed
        });
        return newSpeed;
      });
    }, 100);
  }, [sendCommand, addLog]);

  const startBrake = useCallback(() => {
    stopDrive();
    accelerateInterval.current = setInterval(() => {
      setCurrentSpeed(prev => {
        const newSpeed = Math.min(prev + ACCELERATION_RATE, MAX_SPEED);
        sendCommand({
          type: 'drive',
          direction: 'backward',
          speed: newSpeed
        });
        return newSpeed;
      });
    }, 100);
  }, [sendCommand, addLog]);

  const stopDrive = useCallback(() => {
    if (accelerateInterval.current) {
      clearInterval(accelerateInterval.current);
      accelerateInterval.current = null;
    }
    setCurrentSpeed(0);
    if (isConnected) {
      sendCommand({
        type: 'drive',
        direction: 'stop',
        speed: 0
      });
    }
  }, [isConnected, sendCommand]);

  const sendDriveCommand = useCallback((direction) => {
    sendCommand({
      type: 'drive',
      direction: direction,
      speed: currentSpeed
    });
  }, [currentSpeed, sendCommand, addLog]);

  const steerLeft = useCallback(() => {
    sendCommand({ type: 'steer', direction: 'left' });
    addLog('Steering LEFT', 'info');
  }, [sendCommand, addLog]);

  const steerRight = useCallback(() => {
    sendCommand({ type: 'steer', direction: 'right' });
    addLog('Steering RIGHT', 'info');
  }, [sendCommand, addLog]);

  const centerSteer = useCallback(() => {
    sendCommand({ type: 'steer', direction: 'center' });
    addLog('Steering CENTERED', 'info');
  }, [sendCommand, addLog]);

  const emergencyStop = useCallback(() => {
    sendCommand({ type: 'emergency_stop' });
    addLog('EMERGENCY STOP activated!', 'error');
    stopDrive();
    centerSteer();
  }, [sendCommand, addLog, stopDrive, centerSteer]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.target.tagName === 'INPUT') return;
      
      switch(event.key.toLowerCase()) {
        case 'arrowup':
        case 'w':
          event.preventDefault();
          startAccelerate();
          break;
        case 'arrowdown':
        case 's':
          event.preventDefault();
          startBrake();
          break;
        case 'arrowleft':
        case 'a':
          event.preventDefault();
          steerLeft();
          break;
        case 'arrowright':
        case 'd':
          event.preventDefault();
          steerRight();
          break;
        case ' ':
        case 'escape':
          event.preventDefault();
          stopDrive();
          break;
        case 'c':
          event.preventDefault();
          centerSteer();
          break;
        case 'e':
          event.preventDefault();
          emergencyStop();
          break;
      }
    };

    const handleKeyUp = (event) => {
      switch(event.key.toLowerCase()) {
        case 'arrowup':
        case 'w':
        case 'arrowdown':
        case 's':
          event.preventDefault();
          stopDrive();
          break;
        case 'arrowleft':
        case 'a':
        case 'arrowright':
        case 'd':
          event.preventDefault();
          centerSteer();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [startAccelerate, startBrake, steerLeft, steerRight, stopDrive, centerSteer, emergencyStop]);

  // Auto-connect on mount
  useEffect(() => {
    const timer = setTimeout(connectMQTT, 1000);
    return () => clearTimeout(timer);
  }, [connectMQTT]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Clear acceleration interval
      if (accelerateInterval.current) {
        clearInterval(accelerateInterval.current);
      }
      
      // Disconnect MQTT client
      if (clientRef.current && isConnected) {
        try {
          clientRef.current.disconnect();
          console.log('MQTT client disconnected on unmount');
        } catch (e) {
          console.warn('Error disconnecting MQTT:', e);
        }
      }
      
      isConnectingRef.current = false;
    };
  }, [isConnected]);

  const formatUptime = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  };

  const getSpeedColor = () => {
    if (currentSpeed === 0) return 'text-rose-400';
    if (currentSpeed < 500) return 'text-amber-300';
    return 'text-emerald-400';
  };

  const getSignalColor = (rssi) => {
    if (rssi > -50) return 'text-emerald-400';
    if (rssi > -70) return 'text-amber-300';
    return 'text-rose-400';
  };

  return (
    <ProtectedRoute allowedRoles={["admin", "owner"]}>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="mb-6">
            {/* <h1 className="text-2xl font-semibold text-cyan-400 mb-2">🏎️ Vehicle Remote Control</h1> */}
            <p className="text-slate-400">Real-time MQTT control interface for ESP8266 connected vehicle</p>
          </div>

          {/* Connection Status */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></div>
              <span className="text-slate-200">{connectionStatus}</span>
              <span className="text-slate-400 text-sm">MQTT Broker: HiveMQ Cloud</span>
            </div>
            {!isConnected && (
              <button 
                onClick={connectMQTT}
                className="px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
              >
                Connect
              </button>
            )}
          </div>

          {/* Main Control Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            
            {/* Drive Control Panel */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 border-b border-slate-700 pb-2">
                  Drive Control
              </h3>
              
              {/* Speed Display */}
              <div className="text-center mb-6">
                <div className={`text-4xl font-bold ${getSpeedColor()} mb-2`}>
                  {currentSpeed}
                  <span className="text-slate-500 text-lg ml-2">PWM</span>
                </div>
                <div className="text-slate-400 text-sm">Current Speed</div>
              </div>

              {/* Speed Slider */}
              <div className="mb-6">
                <label className="text-slate-400 text-sm block mb-2">
                  Manual Speed: {currentSpeed} PWM
                </label>
                <input
                  type="range"
                  min="0"
                  max={MAX_SPEED}
                  value={currentSpeed}
                  onChange={(e) => setCurrentSpeed(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>0</span>
                  <span>{Math.floor(MAX_SPEED/2)}</span>
                  <span>{MAX_SPEED}</span>
                </div>
              </div>

              {/* Pedal Controls */}
              <div className="flex gap-4 mb-4">
                <button
                  onMouseDown={startAccelerate}
                  onMouseUp={stopDrive}
                  onTouchStart={startAccelerate}
                  onTouchEnd={stopDrive}
                  className="flex-1 h-24 bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 rounded-xl border-4 border-emerald-800 flex flex-col items-center justify-center text-white font-bold transition-all active:scale-95 active:translate-y-1"
                >
                  <div className="text-2xl mb-1">⬆️</div>
                  <div className="text-sm">ACCELERATE</div>
                </button>
                
                <button
                  onMouseDown={startBrake}
                  onMouseUp={stopDrive}
                  onTouchStart={startBrake}
                  onTouchEnd={stopDrive}
                  className="flex-1 h-24 bg-gradient-to-b from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 rounded-xl border-4 border-rose-800 flex flex-col items-center justify-center text-white font-bold transition-all active:scale-95 active:translate-y-1"
                >
                  <div className="text-2xl mb-1"> </div>
                  <div className="text-sm">BRAKE/REV</div>
                </button>
              </div>

              {/* Drive Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => sendDriveCommand('forward')}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-md text-white font-semibold transition-colors"
                >
                  ⬆️ FORWARD
                </button>
                <button
                  onClick={stopDrive}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 rounded-md text-white font-semibold transition-colors"
                >
                    STOP
                </button>
                <button
                  onClick={() => sendDriveCommand('backward')}
                  className="flex-1 py-3 bg-sky-600 hover:bg-sky-500 rounded-md text-white font-semibold transition-colors"
                >
                  ⬇️ BACKWARD
                </button>
              </div>
            </div>

            {/* Steering Control Panel */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 border-b border-slate-700 pb-2">
                  Steering Control
              </h3>
              
              {/* Steering Wheel Visual */}
              <div className="flex flex-col items-center mb-6">
                <div 
                  onClick={centerSteer}
                  className="w-32 h-32 bg-gradient-to-br from-slate-700 to-slate-800 rounded-full flex items-center justify-center border-8 border-slate-600 cursor-pointer hover:from-slate-600 hover:to-slate-700 transition-all active:scale-95 mb-4"
                >
                  <div className="w-12 h-12 bg-rose-600 rounded-full flex items-center justify-center text-white font-bold text-xs text-center leading-tight">
                    STEER<br/>WHEEL
                  </div>
                </div>
                
                {/* Steering Buttons */}
                <div className="flex gap-4 mb-4">
                  <button
                    onMouseDown={steerLeft}
                    onMouseUp={centerSteer}
                    onTouchStart={steerLeft}
                    onTouchEnd={centerSteer}
                    className="w-20 h-16 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 rounded-xl border-4 border-amber-800 flex items-center justify-center text-white font-bold transition-all active:scale-95"
                  >
                    ⬅️
                  </button>
                  
                  <button
                    onMouseDown={steerRight}
                    onMouseUp={centerSteer}
                    onTouchStart={steerRight}
                    onTouchEnd={centerSteer}
                    className="w-20 h-16 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 rounded-xl border-4 border-violet-800 flex items-center justify-center text-white font-bold transition-all active:scale-95"
                  >
                    ➡️
                  </button>
                </div>
                
                {/* Steering Control Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={steerLeft}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-md text-white font-semibold transition-colors"
                  >
                    ⬅️ LEFT
                  </button>
                  <button
                    onClick={centerSteer}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-md text-white font-semibold transition-colors"
                  >
                    🎯 CENTER
                  </button>
                  <button
                    onClick={steerRight}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-md text-white font-semibold transition-colors"
                  >
                    ➡️ RIGHT
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Stop */}
          <div className="text-center mb-6">
            <button
              onClick={emergencyStop}
              className="px-8 py-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 rounded-xl text-white font-bold text-lg shadow-lg shadow-rose-500/25 transition-all hover:scale-105 active:scale-95"
            >
                EMERGENCY STOP
            </button>
          </div>

          {/* Status and Logs Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Vehicle Status */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 border-b border-slate-700 pb-2">
                📊 Vehicle Status
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">Drive Status:</span>
                  <span className={`font-semibold ${
                    driveStatus === 'FORWARD' ? 'text-emerald-400' :
                    driveStatus === 'BACKWARD' ? 'text-sky-400' : 'text-rose-400'
                  }`}>
                    {driveStatus}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">Steering:</span>
                  <span className={`font-semibold ${
                    steerStatus === 'LEFT' ? 'text-amber-300' :
                    steerStatus === 'RIGHT' ? 'text-violet-400' : 'text-sky-400'
                  }`}>
                    {steerStatus}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">Speed:</span>
                  <span className={`font-semibold ${getSpeedColor()}`}>
                    {currentSpeed} PWM
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">Connection:</span>
                  <span className={`font-semibold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {connectionStatus}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">Uptime:</span>
                  <span className="text-slate-200">
                    {formatUptime(vehicleStatus.uptime)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">Signal:</span>
                  <span className={`font-semibold ${getSignalColor(vehicleStatus.rssi)}`}>
                    {vehicleStatus.rssi} dBm
                  </span>
                </div>
              </div>
            </div>

            {/* Control Logs */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 border-b border-slate-700 pb-2">
                   Control Logs
              </h3>
              
              <div className="h-64 overflow-y-auto space-y-1 font-mono text-sm">
                {logs.length === 0 ? (
                  <div className="text-slate-500 text-center py-8">
                    No logs yet. Connect to MQTT to start controlling.
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-2 rounded border-l-2 ${
                        log.type === 'error' ? 'border-rose-500 bg-rose-500/10 text-rose-300' :
                        log.type === 'success' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' :
                        log.type === 'warning' ? 'border-amber-500 bg-amber-500/10 text-amber-300' :
                        'border-sky-500 bg-sky-500/10 text-sky-300'
                      }`}
                    >
                      <span className="text-slate-500">[{log.timestamp}]</span> {log.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Keyboard Instructions */}
          <div className="mt-6 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h4 className="text-slate-200 font-semibold mb-2">⌨️ Keyboard Controls</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-slate-400">
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">W/↑</kbd> Accelerate</div>
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">S/↓</kbd> Brake/Reverse</div>
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">A/←</kbd> Steer Left</div>
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">D/→</kbd> Steer Right</div>
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">Space</kbd> Stop</div>
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">C</kbd> Center Steering</div>
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">E</kbd> Emergency Stop</div>
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">Esc</kbd> Full Stop</div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}