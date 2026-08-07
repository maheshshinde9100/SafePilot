# SafePilot – IoT Alcohol & Drowsiness Safety System

SafePilot is an IoT-enabled safety platform that authenticates drivers (RFID/Fingerprint), screens for alcohol and drowsiness, and empowers car owners/admins with real-time controls, telemetry, and alerting. It integrates edge Python for drowsiness detection with a modern React web app and Appwrite for secure data storage.

![Admin Dashboard](screenshots/admin-dashboard.png)

## Features

- **Driver Authentication** via RFID or Fingerprint. Ignition is allowed only after successful verification.
- **Alcohol Screening** before and during drive. Critical detection enables owner remote control and raises emergency alerts.
- **Drowsiness Detection (Python)** with camera pipeline; raises warnings/critical alerts.
- **Real-time Telemetry** (heart rate, speed, proximity, location) over WebSockets.
- **Owner Portal** to manage cars, drivers, and assignments; view records/history.
- **Admin Utilities** for users and project management.
- **Emergency Flow** bundles alcohol + heartbeat + driver + car + location to the owner.

## Architecture

### System Architecture Diagram

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'textColor': '#1e293b',
    'primaryTextColor': '#1e293b',
    'lineColor': '#64748b',
    'edgeLabelBackground': '#ffffff'
  }
}}%%
graph TD
    %% Define styles
    classDef hardware fill:#f97316,stroke:#ea580c,color:#ffffff,stroke-width:3px;
    classDef edge fill:#8b5cf6,stroke:#7c3aed,color:#ffffff,stroke-width:3px;
    classDef backend fill:#06b6d4,stroke:#0891b2,color:#ffffff,stroke-width:3px;
    classDef frontend fill:#10b981,stroke:#059669,color:#ffffff,stroke-width:3px;
    classDef db fill:#f59e0b,stroke:#d97706,color:#ffffff,stroke-width:3px;

    linkStyle default stroke:#64748b,stroke-width:2px;

    %% Hardware Layer
    subgraph IoT_Edge ["IoT Edge Layer (Vehicle)"]
        style IoT_Edge fill:#fff7ed,stroke:#fed7aa,stroke-width:2px;
        RFID_Fingerprint["RFID/Fingerprint Sensor"]:::hardware
        Alcohol["Alcohol Sensor (MQ-3)"]:::hardware
        HeartRate["Heart Rate (MAX30102)"]:::hardware
        Proximity["Proximity (HC-SR04)"]:::hardware
        GPS["GPS (NEO-6M)"]:::hardware
        Camera["Camera Module"]:::hardware
        MCU["ESP8266 Controller"]:::hardware
        Actuators["Actuators (Ignition/Brakes)"]:::hardware
    end

    %% Edge Software
    subgraph Edge_Software ["Edge Software (Python)"]
        style Edge_Software fill:#faf5ff,stroke:#e9d5ff,stroke-width:2px;
        Drowsiness["Drowsiness Detection"]:::edge
        DataPreprocessing["Data Preprocessing"]:::edge
    end

    %% Backend Layer
    subgraph Backend ["Backend Layer"]
        style Backend fill:#ecfeff,stroke:#a5f3fc,stroke-width:2px;
        SocketIO["Socket.IO Server"]:::backend
        MQTT["MQTT Broker (HiveMQ)"]:::backend
        DecisionEngine["Decision Engine"]:::backend
        EventLogger["Event Logger"]:::backend
    end

    %% Frontend Layer
    subgraph Frontend ["Web Application"]
        style Frontend fill:#ecfdf5,stroke:#a7f3d0,stroke-width:2px;
        React["React + Vite"]:::frontend
        Dashboard["Dashboard"]:::frontend
        Controls["Remote Controls"]:::frontend
        OwnerPortal["Owner Portal"]:::frontend
        Admin["Admin Utilities"]:::frontend
    end

    %% Database Layer
    subgraph Database ["Appwrite Cloud"]
        style Database fill:#fefce8,stroke:#fde047,stroke-width:2px;
        Auth["Authentication"]:::db
        DB_Collections["Collections"]:::db
        Storage["File Storage"]:::db
    end

    %% Connections
    RFID_Fingerprint -->|Auth Data| MCU
    Alcohol -->|Alcohol Level| MCU
    HeartRate -->|BPM| MCU
    Proximity -->|Distance| MCU
    GPS -->|Lat/Lng| MCU
    Camera -->|Video| Drowsiness
    Drowsiness -->|Drowsiness Score| DataPreprocessing
    DataPreprocessing -->|Filtered Data| MCU
    MCU <-->|MQTT| MQTT
    MQTT <-->|Events| SocketIO
    SocketIO -->|Process| DecisionEngine
    DecisionEngine -->|Log| EventLogger
    EventLogger -->|Save| DB_Collections
    SocketIO <-->|Updates| React
    React <-->|CRUD| DB_Collections
    React <-->|Login| Auth
    React --> Dashboard
    React --> Controls
    React --> OwnerPortal
    React --> Admin
    Controls -->|Signals| SocketIO
    SocketIO -->|Commands| MQTT
    MQTT -->|Actuate| MCU
    MCU -->|Control| Actuators
```

### Component Diagram

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'textColor': '#1e293b',
    'primaryTextColor': '#1e293b',
    'lineColor': '#64748b',
    'edgeLabelBackground': '#ffffff'
  }
}}%%
graph TB
    %% Styles
    classDef webapp fill:#10b981,stroke:#059669,color:#ffffff,stroke-width:3px;
    classDef backend fill:#06b6d4,stroke:#0891b2,color:#ffffff,stroke-width:3px;
    classDef iot fill:#f97316,stroke:#ea580c,color:#ffffff,stroke-width:3px;
    classDef db fill:#f59e0b,stroke:#d97706,color:#ffffff,stroke-width:3px;

    linkStyle default stroke:#64748b,stroke-width:2px;

    %% Web App Components
    subgraph WebApp ["Web Application Components"]
        style WebApp fill:#ecfdf5,stroke:#a7f3d0,stroke-width:2px;
        ReactApp["React App"]:::webapp
        WebSocketCtx["WebSocketContext.jsx"]:::webapp
        AuthCtx["AuthContext.jsx"]:::webapp
        DataService["dataService.js"]:::webapp
        
        subgraph Pages ["Pages"]
            style Pages fill:#f0fdf4,stroke:#86efac,stroke-width:2px;
            DashboardComp["Dashboard.jsx"]:::webapp
            OwnerGarage["OwnerGarage.jsx"]:::webapp
            OwnerDrivers["OwnerDrivers.jsx"]:::webapp
            RemoteControls["RemoteControl.jsx"]:::webapp
            Alerts["Alerts.jsx"]:::webapp
            Records["Records.jsx"]:::webapp
        end
    end

    %% Backend Components
    subgraph Backend ["Backend Services"]
        style Backend fill:#ecfeff,stroke:#a5f3fc,stroke-width:2px;
        AppwriteCloud["Appwrite Cloud"]:::db
        SocketIOServer["Socket.IO Server"]:::backend
        subgraph SocketIO_Features ["Socket.IO Features"]
            style SocketIO_Features fill:#cffafe,stroke:#67e8f9,stroke-width:2px;
            RealTimeEvents["Real-time Events"]:::backend
            ControlCommands["Control Commands"]:::backend
            SessionManagement["Session Management"]:::backend
        end
    end

    %% IoT Edge Components
    subgraph IoT_Edge ["IoT Edge Layer"]
        style IoT_Edge fill:#fff7ed,stroke:#fed7aa,stroke-width:2px;
        ESP32["ESP8266"]:::iot
        subgraph Sensors ["Sensor Suite"]
            style Sensors fill:#ffedd5,stroke:#fdba74,stroke-width:2px;
            RFID["RFID Reader"]:::iot
            Fingerprint["Fingerprint Scanner"]:::iot
            AlcoholSensor["Alcohol Sensor"]:::iot
            HeartRateSensor["Heart Rate"]:::iot
            Ultrasonic["Ultrasonic"]:::iot
            GPS_Module["GPS"]:::iot
        end
        PythonDrowsiness["Python Drowsiness Engine"]:::iot
        CameraMod["Camera Module"]:::iot
        ActuatorMod["Actuators"]:::iot
    end

    %% Connections
    ReactApp -->|Provides| WebSocketCtx
    ReactApp -->|Provides| AuthCtx
    ReactApp -->|Uses| DataService
    ReactApp -->|Renders| Pages
    DataService -->|API| AppwriteCloud
    WebSocketCtx <-->|WebSocket| SocketIOServer
    SocketIOServer -->|Implements| SocketIO_Features
    SocketIOServer <-->|MQTT| ESP32
    ESP32 -->|Reads| Sensors
    CameraMod -->|Frames| PythonDrowsiness
    PythonDrowsiness -->|Data| ESP32
    ESP32 -->|Controls| ActuatorMod
```

### Sequence Diagram

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'primaryColor': '#e0f2fe',
    'primaryTextColor': '#1e293b',
    'primaryBorderColor': '#0284c7',
    'lineColor': '#475569',
    'textColor': '#1e293b',
    'actorTextColor': '#1e293b',
    'actorBkg': '#e0f2fe',
    'actorBorder': '#0284c7',
    'signalColor': '#475569',
    'signalTextColor': '#1e293b',
    'labelTextColor': '#1e293b',
    'loopTextColor': '#1e293b',
    'noteBkgColor': '#fef9c3',
    'noteTextColor': '#1e293b',
    'noteBorderColor': '#eab308',
    'sequenceNumberColor': '#1e293b'
  }
}}%%
sequenceDiagram
    autonumber
    participant Owner as Owner
    participant React as React App
    participant SocketIO as Socket.IO Server
    participant IoT as IoT Edge
    participant Appwrite as Appwrite DB

    %% Driver Profile Setup
    rect rgb(219,234,254)
        Note over Owner,Appwrite: Driver Profile Setup
        Owner->>React: Add Driver Profile
        React->>Appwrite: createDocument(DriverProfiles)
        Appwrite-->>React: 201 Created
        Owner->>React: Add Car
        React->>Appwrite: createDocument(Cars)
        Appwrite-->>React: 201 Created
        Owner->>React: Assign Driver to Car
        React->>Appwrite: createDocument(Assignments)
        Appwrite-->>React: 201 Created
    end

    %% Authentication Flow
    rect rgb(209,250,229)
        Note over Owner,Appwrite: Driver Authentication
        IoT->>IoT: Scan RFID/Fingerprint
        IoT->>SocketIO: auth_event
        SocketIO->>React: auth_event
        React->>Appwrite: createDocument(DriverSessions)
        Appwrite-->>React: 201 Created
    end

    %% Sensor Data Flow
    rect rgb(254,249,195)
        Note over Owner,Appwrite: Sensor Data Telemetry
        loop Every 1-5 seconds
            IoT->>IoT: Read all sensors
            IoT->>SocketIO: sensor_data
            SocketIO->>SocketIO: Threshold checks
            SocketIO->>React: sensor_data
            opt Thresholds crossed
                SocketIO->>Appwrite: createDocument(EventsLog)
                SocketIO->>React: new_alert
            end
            SocketIO->>Appwrite: updateDocument(VehicleState)
        end
    end

    %% Emergency Flow
    rect rgb(254,226,226)
        Note over Owner,Appwrite: Emergency Response
        alt Critical thresholds
            IoT->>SocketIO: emergency_event
            SocketIO->>Appwrite: createDocument(EmergencyCases)
            SocketIO->>React: emergency_event
            Owner->>React: Send remote command
            React->>SocketIO: control_command
            SocketIO->>IoT: control_command
            IoT->>IoT: Execute command
            IoT->>SocketIO: command_ack
            SocketIO->>React: command_ack
            React->>Appwrite: updateDocument(DriverSessions)
        end
    end

    %% Session End
    rect rgb(243,232,255)
        Note over Owner,Appwrite: Session End
        IoT->>SocketIO: ignition_status OFF
        SocketIO->>React: ignition_status
        React->>Appwrite: updateDocument(DriverSessions)
        Appwrite-->>React: 200 OK
    end
```

### State Machine Diagram

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'primaryColor': '#ede9fe',
    'primaryTextColor': '#1e293b',
    'primaryBorderColor': '#7c3aed',
    'lineColor': '#475569',
    'textColor': '#1e293b',
    'labelTextColor': '#1e293b',
    'stateLabelColor': '#1e293b',
    'stateBkg': '#ede9fe',
    'transitionColor': '#475569',
    'transitionLabelColor': '#1e293b',
    'compositeTitleBackground': '#ddd6fe',
    'compositeBackground': '#f5f3ff',
    'altBackground': '#f5f3ff'
  }
}}%%
stateDiagram-v2
    direction LR
    [*] --> AwaitVerification

    state AwaitVerification {
        [*] --> WaitingForAuth
        WaitingForAuth: Waiting for RFID/Fingerprint
        WaitingForAuth --> IgnitionReady: auth_success
        WaitingForAuth --> IgnitionBlocked: auth_fail
    }

    state IgnitionReady {
        [*] --> PreDriveCheck
        PreDriveCheck: Pre-drive Alcohol Check
        PreDriveCheck --> Driving: alcohol < 20
        PreDriveCheck --> IgnitionBlocked: alcohol >= 20
    }

    state Driving {
        [*] --> Normal
        Normal: Normal Driving
        Normal --> Warning: metrics slightly off
        Warning: Warning State
        Warning --> Normal: conditions ok
        Warning --> Critical: metrics critical
    }

    Critical: Critical State
    RemoteControlEnabled: Remote Control Enabled
    IgnitionBlocked: Ignition Blocked

    Critical --> RemoteControlEnabled: emergency_event
    RemoteControlEnabled --> Normal: owner ok
    IgnitionBlocked --> AwaitVerification: retry
    Driving --> [*]: ignition off
```

### Tech Stack

#### Hardware (Suggested)
- RFID reader (e.g., RC522) or Fingerprint sensor (e.g., R307)
- Alcohol sensor (MQ-3 / MQ-135)
- Heart-rate sensor (MAX30102)
- Ultrasonic proximity (HC-SR04)
- GPS (NEO‑6M), Motor controller/actuators
- Microcontroller: ESP32 or Raspberry Pi (depending on IO needs)

#### Edge Software (Python)
- Python 3.10+
- OpenCV, MediaPipe or dlib (for eye-aspect ratio or blink detection)
- asyncio + socket client (websocket or Socket.IO Python client)
- Requests/HTTP client (fallback)

#### Web Application
- React + Vite + React Router
- Socket.IO client
- Tailwind-style utility classes
- Appwrite Web SDK

#### BaaS / Database
- Appwrite Cloud (Auth, DB, Documents)

## Data Model (Appwrite Collections)

The system manages these data collections:

- `Alerts`: level, title, description, ts
- `Sensors`: heartRate, drowsiness, alcoholLevel, proximity, speed, location_lat/lng, ts
- `Locations`: lat, lng, ts
- `Contacts`
- `Users (App data)` (optional)
- `Cars`: ownerId, alias, plateNumber, vin, make, model, year (int), color
- `DriverProfiles`: ownerId, name, email, phone, licenseNo, notes, violations, lastMedicalCheck
- `Assignments`: ownerId, carId, driverProfileId, active (int 0/1), ts, endedAt
- `DriverRecords`: driverProfileId, type, level, title, description, ts
- `VehicleState`: carId, driverId, speed, alcoholStatus, drowsinessLevel, heartRate, location_lat/lng, controlMode, lastUpdated
- `EventsLog`: eventType, severity, carId, driverId, snap_speed, snap_alcoholLevel, snap_heartRate, snap_location_lat, snap_location_lng, timestamp
- `DriverSessions`: driverId, carId, sessionStart, sessionEnd, maxSpeed, drowsinessWarningsCount, alcoholIncidentsCount, ownerInterventionsCount
- `EmergencyCases`: caseType, carId, driverId, resolved, ownerActionTaken, createdAt, resolvedAt

Permissions are configured for authenticated users with appropriate read/write access.

## Core Flows

1. **Verification → Ignition**: Edge verifies driver (RFID/Fingerprint). Web shows `auth_event` and sets ignition ready.
2. **Pre-drive Alcohol Check**: If alcohol detected, ignition is blocked and alert is sent.
3. **During Trip**: If alcohol suddenly spikes, emergency event is raised, remote control enables, and the car slows down (IoT side).
4. **Owner Controls**: Remote control panel is enabled only on critical events; actions are emitted over WebSockets.

## Drowsiness Detection (Python) – Overview

- Captures camera frames and computes eye-aspect ratio using MediaPipe Face Mesh
- Maintains scoring algorithms with time-window analysis
- Emits `warning` or `critical` alerts when thresholds are crossed
- Sends events and metrics to the web server via WebSocket/HTTP protocols

## Key System Components

- `WebSocketContext` – Real-time events and state management (ignition, remote-control, auth, emergency)
- `DataService` – Appwrite document operations (Cars, Drivers, Assignments, Records, Alerts)
- `Owner Management` – Vehicle and driver administration interface
- `Control Systems` – Remote control UI and emergency response
- `Database Setup` – Collection creation with attributes, indexes, and permissions

## Project Aim

SafePilot addresses critical road safety challenges by creating an integrated IoT ecosystem that prevents impaired and drowsy driving through multi-layered verification and real-time monitoring. The system empowers vehicle owners with remote oversight capabilities while maintaining driver privacy and providing immediate emergency response protocols.

## Screenshots

### Admin Dashboard
Real-time monitoring view for admins showing live sensor telemetry (heart rate, alcohol level, speed), driver verification status, ignition/remote control state, and active critical/warning alerts.
![Admin Dashboard](screenshots/admin-dashboard.png)

### Owner/Admin – Garage Management
Interface for adding and managing vehicles, including plate number, VIN, make, model, year, and color — along with active driver assignments per car.
![Garage Management](screenshots/garage-management.png)

### Driver Dashboard
Driver-facing real-time view showing live heart rate, alcohol level, and speed readings, along with ignition status, remote control state, and active alerts relevant to the current session.
![Driver Dashboard](screenshots/driver-dashboard.png)

### Driver Records
Historical view of a driver's session stats (heart rate, drowsiness, alcohol level, proximity) along with a log of recent warning and critical alerts.
![Driver Records](screenshots/driver-records.png)