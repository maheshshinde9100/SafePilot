import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";

export default function RemoteControl() {
  const { role } = useAuth();
  
  // WebSocket Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [websocket, setWebsocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [espIP, setEspIP] = useState('');
  
  // Vehicle State
  const [currentSpeed, setCurrentSpeed] = useState(0); // 0-20 km/h
  const [driveStatus, setDriveStatus] = useState('Unknown');
  const [steerStatus, setSteerStatus] = useState('Unknown');
  const [vehicleStatus, setVehicleStatus] = useState({
    uptime: 0,
    ip: 'Unknown'
  });
  
  // Control State
  const [logs, setLogs] = useState([]);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

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

  // WebSocket Connection
  const connectWebSocket = useCallback(() => {
    const ip = espIP.trim();
    if (!ip) {
      addLog('Please enter ESP8266 IP address', 'error');
      return;
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      addLog(`Connecting to ws://${ip}:81...`, 'info');
      setConnectionStatus('Connecting...');

      const ws = new WebSocket(`ws://${ip}:81`);
      
      ws.onopen = () => {
        setIsConnected(true);
        setConnectionStatus(`Connected to ${ip}`);
        addLog('WebSocket connected successfully', 'success');
        localStorage.setItem('esp8266_ip', ip);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setConnectionStatus('Disconnected');
        addLog('WebSocket disconnected', 'error');
        
        // Auto-reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          addLog('Attempting to reconnect...', 'warning');
          connectWebSocket();
        }, 5000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'status') {
            updateVehicleStatus(data);
          }
        } catch (e) {
          addLog('Received: ' + event.data, 'info');
        }
      };

      ws.onerror = (error) => {
        addLog('WebSocket error occurred', 'error');
        console.error('WebSocket error:', error);
      };

      wsRef.current = ws;
      setWebsocket(ws);

    } catch (error) {
      addLog('Connection failed: ' + error.message, 'error');
      setConnectionStatus('Failed');
    }
  }, [espIP, addLog]);

  // Send WebSocket Command
  const sendCommand = useCallback((command) => {
    if (!isConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog('Not connected to ESP8266', 'error');
      return;
    }

    try {
      wsRef.current.send(JSON.stringify(command));
      console.log('Command sent:', command);
    } catch (error) {
      addLog('Error sending command: ' + error.message, 'error');
    }
  }, [isConnected, addLog]);

  // Update vehicle status from WebSocket
  const updateVehicleStatus = useCallback((data) => {
    if (data.drive) {
      const direction = data.drive.direction;
      const pwmSpeed = data.drive.speed;
      const speedKmh = (pwmSpeed / 1023) * 20; // Convert PWM to km/h
      
      setDriveStatus(direction.charAt(0).toUpperCase() + direction.slice(1));
      setCurrentSpeed(speedKmh);
    }

    if (data.steer) {
      setSteerStatus(data.steer.direction.charAt(0).toUpperCase() + data.steer.direction.slice(1));
    }

    if (data.ip) {
      setVehicleStatus(prev => ({ ...prev, ip: data.ip }));
    }

    if (data.uptime) {
      setVehicleStatus(prev => ({ ...prev, uptime: data.uptime }));
    }
  }, []);

  // Control Functions
  const sendDriveCommand = useCallback((direction) => {
    // Convert km/h to PWM (0-20 km/h maps to 0-1023 PWM)
    const pwmSpeed = Math.round((currentSpeed / 20) * 1023);
    
    const command = {
      type: 'drive',
      direction: direction,
      speed: pwmSpeed
    };
    
    sendCommand(command);
    addLog(`${direction} at ${currentSpeed.toFixed(1)} km/h`, 'info');
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

  const stopDrive = useCallback(() => {
    sendCommand({
      type: 'drive',
      direction: 'stop',
      speed: 0
    });
    addLog('Vehicle STOPPED', 'info');
  }, [sendCommand, addLog]);

  const emergencyStop = useCallback(() => {
    sendCommand({ type: 'drive', direction: 'stop', speed: 0 });
    sendCommand({ type: 'steer', direction: 'center' });
    addLog('  EMERGENCY STOP activated!', 'error');
  }, [sendCommand, addLog]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.target.tagName === 'INPUT') return;
      
      switch(event.key.toLowerCase()) {
        case 'arrowup':
        case 'w':
          event.preventDefault();
          sendDriveCommand('forward');
          break;
        case 'arrowdown':
        case 's':
          event.preventDefault();
          sendDriveCommand('backward');
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
          centerSteer();
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

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sendDriveCommand, steerLeft, steerRight, stopDrive, centerSteer, emergencyStop]);

  // Load saved IP on mount
  useEffect(() => {
    const savedIP = localStorage.getItem('esp8266_ip');
    if (savedIP) {
      setEspIP(savedIP);
      addLog('Loaded saved IP: ' + savedIP, 'info');
    }
    addLog('System ready. Enter ESP8266 IP and connect.', 'success');
  }, [addLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const formatUptime = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  };

  const getSpeedColor = () => {
    if (currentSpeed === 0) return 'text-rose-400';
    if (currentSpeed < 10) return 'text-amber-300';
    return 'text-emerald-400';
  };

  return (
    <ProtectedRoute allowedRoles={["admin", "owner"]}>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="mb-6">
            {/* <h1 className="text-2xl font-semibold text-cyan-400 mb-2">🏎️ Vehicle Remote Control</h1> */}
            <p className="text-slate-400">Real-time WebSocket control interface for ESP8266 connected vehicle</p>
          </div>

          {/* Connection Status */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-6">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></div>
                <span className="text-slate-200">{connectionStatus}</span>
              </div>
              <div className="flex gap-2 ml-auto">
                <input
                  type="text"
                  value={espIP}
                  onChange={(e) => setEspIP(e.target.value)}
                  placeholder="ESP8266 IP Address (e.g., 192.168.1.100)"
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  disabled={isConnected}
                />
                <button 
                  onClick={connectWebSocket}
                  disabled={isConnected}
                  className={`px-4 py-2 rounded-md text-white transition-colors ${
                    isConnected 
                      ? 'bg-slate-600 cursor-not-allowed' 
                      : 'bg-cyan-600 hover:bg-cyan-500'
                  }`}
                >
                  {isConnected ? 'Connected' : 'Connect'}
                </button>
              </div>
            </div>
          </div>

          {/* Main Control Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            
            {/* Drive Control Panel */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 border-b border-slate-700 pb-2">
                🚗 Drive Control (BTS7960)
              </h3>
              
              {/* Speed Display */}
              <div className="text-center mb-6">
                <div className={`text-4xl font-bold ${getSpeedColor()} mb-2`}>
                  {currentSpeed.toFixed(1)}
                  <span className="text-slate-500 text-lg ml-2">km/h</span>
                </div>
                <div className="text-slate-400 text-sm">Current Speed</div>
              </div>

              {/* Speed Slider */}
              <div className="mb-6">
                <label className="text-slate-400 text-sm block mb-2">
                  Speed: {currentSpeed.toFixed(1)} km/h
                </label>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="0.5"
                  value={currentSpeed}
                  onChange={(e) => setCurrentSpeed(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>0 km/h</span>
                  <span>10 km/h</span>
                  <span>20 km/h</span>
                </div>
              </div>

              {/* Drive Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => sendDriveCommand('forward')}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-semibold transition-all hover:scale-105 active:scale-95"
                >
                  ⬆️ FORWARD
                </button>
                <button
                  onClick={stopDrive}
                  className="w-full py-4 bg-rose-600 hover:bg-rose-500 rounded-lg text-white font-semibold transition-all hover:scale-105 active:scale-95"
                >
                    STOP
                </button>
                <button
                  onClick={() => sendDriveCommand('backward')}
                  className="w-full py-4 bg-sky-600 hover:bg-sky-500 rounded-lg text-white font-semibold transition-all hover:scale-105 active:scale-95"
                >
                  ⬇️ BACKWARD
                </button>
              </div>
            </div>

            {/* Steering Control Panel */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 border-b border-slate-700 pb-2">
                🎮 Steering Control (L298N)
              </h3>
              
              {/* Steering Wheel Visual */}
              <div className="flex flex-col items-center mb-6">
                <div 
                  onClick={centerSteer}
                  className="w-32 h-32 bg-gradient-to-br from-slate-700 to-slate-800 rounded-full flex items-center justify-center border-8 border-slate-600 cursor-pointer hover:from-slate-600 hover:to-slate-700 transition-all active:scale-95 mb-6"
                >
                  <div className="w-12 h-12 bg-rose-600 rounded-full flex items-center justify-center text-white font-bold text-xs text-center leading-tight">
                    🎯<br/>CENTER
                  </div>
                </div>
                
                {/* Steering Buttons */}
                <div className="grid grid-cols-3 gap-2 w-full">
                  <button
                    onClick={steerLeft}
                    className="py-4 bg-amber-600 hover:bg-amber-500 rounded-lg text-white font-semibold transition-all hover:scale-105 active:scale-95"
                  >
                    ⬅️ LEFT
                  </button>
                  <button
                    onClick={centerSteer}
                    className="py-4 bg-slate-600 hover:bg-slate-500 rounded-lg text-white font-semibold transition-all hover:scale-105 active:scale-95"
                  >
                    🎯 CENTER
                  </button>
                  <button
                    onClick={steerRight}
                    className="py-4 bg-violet-600 hover:bg-violet-500 rounded-lg text-white font-semibold transition-all hover:scale-105 active:scale-95"
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
                📊 Current Status
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">Drive:</span>
                  <span className={`font-semibold ${
                    driveStatus.toLowerCase() === 'forward' ? 'text-emerald-400' :
                    driveStatus.toLowerCase() === 'backward' ? 'text-sky-400' : 
                    driveStatus.toLowerCase() === 'stop' ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {driveStatus}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">Steering:</span>
                  <span className={`font-semibold ${
                    steerStatus.toLowerCase() === 'left' ? 'text-amber-300' :
                    steerStatus.toLowerCase() === 'right' ? 'text-violet-400' : 
                    steerStatus.toLowerCase() === 'center' ? 'text-sky-400' : 'text-slate-400'
                  }`}>
                    {steerStatus}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">Speed:</span>
                  <span className={`font-semibold ${getSpeedColor()}`}>
                    {currentSpeed.toFixed(1)} km/h
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">Connection:</span>
                  <span className={`font-semibold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {connectionStatus}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">IP Address:</span>
                  <span className="text-slate-200 text-sm">
                    {vehicleStatus.ip}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400">Uptime:</span>
                  <span className="text-slate-200">
                    {formatUptime(vehicleStatus.uptime)}
                  </span>
                </div>
              </div>
            </div>

            {/* Control Logs */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4 border-b border-slate-700 pb-2">
                   System Logs
              </h3>
              
              <div className="h-80 overflow-y-auto space-y-1 font-mono text-sm">
                {logs.length === 0 ? (
                  <div className="text-slate-500 text-center py-8">
                    No logs yet. Connect to ESP8266 to start controlling.
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
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">W/↑</kbd> Forward</div>
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">S/↓</kbd> Backward</div>
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">A/←</kbd> Steer Left</div>
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">D/→</kbd> Steer Right</div>
              <div><kbd className="bg-slate-800 px-2 py-1 rounded">Space</kbd> Stop All</div>
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