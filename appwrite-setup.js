// appwrite-setup.js
// run with: node appwrite-setup.js

import { Client, Databases } from "node-appwrite";
import dotenv from "dotenv";

dotenv.config();

async function setup() {
  const client = new Client();

  client
    .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT) // e.g. https://cloud.appwrite.io/v1
    .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.VITE_APPWRITE_API_KEY); // must be in .env

  const databases = new Databases(client);
  const databaseId = process.env.VITE_APPWRITE_DB_ID;

  async function createCollectionWithAttributes(collectionId, name, attributes) {
    try {
      await databases.createCollection({
        databaseId,
        collectionId,
        name,
        permissions: [],
        documentSecurity: false,
        enabled: true,
      });
      console.log(`  Collection ${name} created`);
    } catch (err) {
      if (err.code === 409) {
        console.log(`    Collection ${name} already exists`);
      } else throw err;
    }

    for (const attr of attributes) {
      const { type, key, required = false, array = false, size, defaultValue } = attr;
      try {
        switch (type) {
          case "string":
            await databases.createStringAttribute({
              databaseId,
              collectionId,
              key,
              required,
              array,
              size: size || 256,
              default: defaultValue,
            });
            break;
          case "integer":
            await databases.createIntegerAttribute({
              databaseId,
              collectionId,
              key,
              required,
              array,
              default: defaultValue,
            });
            break;
          case "float":
            await databases.createFloatAttribute({
              databaseId,
              collectionId,
              key,
              required,
              array,
              default: defaultValue,
            });
            break;
          case "datetime":
            await databases.createDatetimeAttribute({
              databaseId,
              collectionId,
              key,
              required,
              array,
              default: defaultValue,
            });
            break;
          default:
            console.warn(`  Unhandled attribute type: ${type}`);
        }
        console.log(`   ➕ Attribute ${key} (${type}) added`);
      } catch (err) {
        if (err.code === 409) {
          console.log(`       Attribute ${key} already exists`);
        } else {
          console.error(`        Error on ${key}:`, err.message);
        }
      }
    }
  }

  async function createIndexIfMissing(collectionId, key, type, attributes, orders = []) {
    try {
      await databases.createIndex({
        databaseId,
        collectionId,
        key,
        type, // 'key' | 'fulltext' | 'unique'
        attributes,
        orders,
      });
      console.log(`   🔎 Index ${key} created on ${collectionId}`);
    } catch (err) {
      if (err.code === 409) {
        console.log(`       Index ${key} already exists on ${collectionId}`);
      } else {
        console.error(`        Index ${key} error:`, err.message);
      }
    }
  }

  async function ensureCollectionPermissions(collectionId, permissions) {
    // permissions format example: [ 'read("users")', 'create("users")', 'update("users")', 'delete("users")' ]
    try {
      // fetch existing collection to preserve required fields like name and documentSecurity
      const col = await databases.getCollection({ databaseId, collectionId });
      await databases.updateCollection({
        databaseId,
        collectionId,
        name: col.name,
        permissions,
        documentSecurity: col.documentSecurity,
      });
      console.log(`     Permissions updated for ${collectionId}`);
    } catch (err) {
      if (err.code === 404) {
        console.log(`       Skipped permissions for missing collection ${collectionId}`);
      } else if (err.code === 409) {
        console.log(`       Permissions already set for ${collectionId}`);
      } else {
        console.error(`        Permissions update failed for ${collectionId}:`, err.message);
      }
    }
  }

  // Collections

  await createCollectionWithAttributes(
    process.env.VITE_APPWRITE_COL_ALERTS,
    "Alerts",
    [
      { type: "string", key: "level", required: true },
      { type: "string", key: "title", required: true },
      { type: "string", key: "description" },
      { type: "datetime", key: "datetime", required: true },
      // Extra field to align with frontend ordering
      { type: "datetime", key: "ts" },
    ]
  );
  if (process.env.VITE_APPWRITE_COL_ALERTS) {
    await createIndexIfMissing(process.env.VITE_APPWRITE_COL_ALERTS, 'ts_desc', 'key', ['ts'], ['DESC']);
    await ensureCollectionPermissions(process.env.VITE_APPWRITE_COL_ALERTS, ['read("users")']);
  }

  await createCollectionWithAttributes(
    process.env.VITE_APPWRITE_COL_SENSORS,
    "Sensors",
    [
      { type: "integer", key: "heartRate", required: true },
      { type: "integer", key: "drowsiness" },
      { type: "integer", key: "alcoholLevel" },
      { type: "integer", key: "proximity" },
      { type: "integer", key: "speed" },
      { type: "string", key: "status" },
      { type: "float", key: "location_lat" },
      { type: "float", key: "location_lng" },
      { type: "datetime", key: "datetime", required: true },
      // Extra field to align with frontend ordering
      { type: "datetime", key: "ts" },
    ]
  );

  await createCollectionWithAttributes(
    process.env.VITE_APPWRITE_COL_LOCATIONS,
    "Locations",
    [
      { type: "float", key: "lat", required: true },
      { type: "float", key: "lng", required: true },
      { type: "datetime", key: "datetime", required: true },
      // Extra field to align with frontend ordering
      { type: "datetime", key: "ts" },
    ]
  );

  await createCollectionWithAttributes(
    process.env.VITE_APPWRITE_COL_CONTACTS,
    "Contacts",
    [
      { type: "string", key: "name", required: true },
      { type: "string", key: "phone", required: true },
      { type: "integer", key: "priority" },
    ]
  );
  if (process.env.VITE_APPWRITE_COL_CONTACTS) {
    await ensureCollectionPermissions(process.env.VITE_APPWRITE_COL_CONTACTS, ['read("users")', 'create("users")', 'update("users")', 'delete("users")']);
  }

  // Optional: Users collection (used by Profile/Users pages)
  if (process.env.VITE_APPWRITE_COL_USERS) {
    await createCollectionWithAttributes(
      process.env.VITE_APPWRITE_COL_USERS,
      "Users (App data)",
      [
        { type: "string", key: "name" },
        { type: "string", key: "email" },
        { type: "string", key: "role" },
        { type: "string", key: "status" },
      ]
    );
    await createIndexIfMissing(process.env.VITE_APPWRITE_COL_USERS, 'email_eq', 'key', ['email']);
    await ensureCollectionPermissions(process.env.VITE_APPWRITE_COL_USERS, ['read("users")', 'create("users")', 'update("users")', 'delete("users")']);
  }

  // Owner–Car–Driver model
  if (process.env.VITE_APPWRITE_COL_CARS) {
    await createCollectionWithAttributes(
      process.env.VITE_APPWRITE_COL_CARS,
      "Cars",
      [
        { type: "string", key: "ownerId", required: true },
        { type: "string", key: "alias" },
        { type: "string", key: "plateNumber" },
        { type: "string", key: "vin" },
        { type: "string", key: "make" },
        { type: "string", key: "model" },
        { type: "integer", key: "year" },
        { type: "string", key: "color" },
        { type: "datetime", key: "createdAt" },
      ]
    );
    await ensureCollectionPermissions(process.env.VITE_APPWRITE_COL_CARS, ['read("users")', 'create("users")', 'update("users")', 'delete("users")']);
  }

  if (process.env.VITE_APPWRITE_COL_DRIVER_PROFILES) {
    await createCollectionWithAttributes(
      process.env.VITE_APPWRITE_COL_DRIVER_PROFILES,
      "DriverProfiles",
      [
        { type: "string", key: "ownerId", required: true },
        { type: "string", key: "name" },
        { type: "string", key: "email" },
        { type: "string", key: "phone" },
        { type: "string", key: "licenseNo" },
        { type: "string", key: "backgroundNotes" },
        { type: "integer", key: "violations" },
        { type: "datetime", key: "lastMedicalCheck" },
        { type: "datetime", key: "createdAt" },
      ]
    );
    await ensureCollectionPermissions(process.env.VITE_APPWRITE_COL_DRIVER_PROFILES, ['read("users")', 'create("users")', 'update("users")', 'delete("users")']);
  }

  if (process.env.VITE_APPWRITE_COL_ASSIGNMENTS) {
    await createCollectionWithAttributes(
      process.env.VITE_APPWRITE_COL_ASSIGNMENTS,
      "Assignments",
      [
        { type: "string", key: "ownerId", required: true },
        { type: "string", key: "carId", required: true },
        { type: "string", key: "driverProfileId", required: true },
        // Boolean not handled in helper; use integer 0/1 for active
        { type: "integer", key: "active", defaultValue: 1 },
        { type: "datetime", key: "ts" },
        { type: "datetime", key: "endedAt" },
      ]
    );
    await ensureCollectionPermissions(process.env.VITE_APPWRITE_COL_ASSIGNMENTS, ['read("users")', 'create("users")', 'update("users")', 'delete("users")']);
  }

  if (process.env.VITE_APPWRITE_COL_DRIVER_RECORDS) {
    await createCollectionWithAttributes(
      process.env.VITE_APPWRITE_COL_DRIVER_RECORDS,
      "DriverRecords",
      [
        { type: "string", key: "driverProfileId", required: true },
        { type: "string", key: "type" },
        { type: "string", key: "level" },
        { type: "string", key: "title" },
        { type: "string", key: "description" },
        { type: "datetime", key: "ts" },
      ]
    );
    await ensureCollectionPermissions(process.env.VITE_APPWRITE_COL_DRIVER_RECORDS, ['read("users")', 'create("users")', 'update("users")', 'delete("users")']);
  }

  // ---------------------------------------------------------
  // V2 New Architecture Collections
  // ---------------------------------------------------------

  // A) vehicle_state (latest live snapshot per car)
  if (process.env.VITE_APPWRITE_COL_VEHICLE_STATE) {
    await createCollectionWithAttributes(
      process.env.VITE_APPWRITE_COL_VEHICLE_STATE,
      "VehicleState",
      [
        { type: "string", key: "carId", required: true },
        { type: "string", key: "driverId", required: false }, // Can be null if no driver assigned
        { type: "integer", key: "speed", defaultValue: 0 },
        { type: "string", key: "alcoholStatus", defaultValue: "normal" }, // normal / detected
        { type: "string", key: "drowsinessLevel", defaultValue: "normal" }, // normal / warning / critical
        { type: "integer", key: "heartRate", defaultValue: 0 },
        { type: "float", key: "location_lat", defaultValue: 0.0 },
        { type: "float", key: "location_lng", defaultValue: 0.0 },
        { type: "string", key: "controlMode", defaultValue: "driver" }, // driver / owner
        { type: "datetime", key: "lastUpdated" }, // critical state change time
      ]
    );
    // Index for fast lookup of live cars
    await createIndexIfMissing(process.env.VITE_APPWRITE_COL_VEHICLE_STATE, 'car_unique', 'unique', ['carId']);
    await ensureCollectionPermissions(process.env.VITE_APPWRITE_COL_VEHICLE_STATE, ['read("users")', 'create("users")', 'update("users")', 'delete("users")']);
  }

  // B) events_log (event-based storage)
  if (process.env.VITE_APPWRITE_COL_EVENTS_LOG) {
    await createCollectionWithAttributes(
      process.env.VITE_APPWRITE_COL_EVENTS_LOG,
      "EventsLog",
      [
        { type: "string", key: "eventType", required: true }, // DROWSINESS_WARNING, OVERSPEED, etc.
        { type: "string", key: "severity", required: true }, // info / warning / critical
        { type: "string", key: "carId", required: true },
        { type: "string", key: "driverId", required: false },

        // Snapshot data
        { type: "integer", key: "snap_speed" },
        { type: "integer", key: "snap_alcoholLevel" },
        { type: "integer", key: "snap_heartRate" },
        { type: "float", key: "snap_location_lat" },
        { type: "float", key: "snap_location_lng" },

        { type: "datetime", key: "timestamp", required: true },
      ]
    );
    await createIndexIfMissing(process.env.VITE_APPWRITE_COL_EVENTS_LOG, 'car_events', 'key', ['carId', 'timestamp'], ['DESC']);
    await ensureCollectionPermissions(process.env.VITE_APPWRITE_COL_EVENTS_LOG, ['read("users")', 'create("users")', 'update("users")', 'delete("users")']);
  }

  // C) driver_sessions (trip-based history)
  if (process.env.VITE_APPWRITE_COL_DRIVER_SESSIONS) {
    await createCollectionWithAttributes(
      process.env.VITE_APPWRITE_COL_DRIVER_SESSIONS,
      "DriverSessions",
      [
        { type: "string", key: "driverId", required: true },
        { type: "string", key: "carId", required: true },
        { type: "datetime", key: "sessionStart", required: true },
        { type: "datetime", key: "sessionEnd", required: false }, // Null means active
        { type: "integer", key: "maxSpeed", defaultValue: 0 },
        { type: "integer", key: "drowsinessWarningsCount", defaultValue: 0 },
        { type: "integer", key: "alcoholIncidentsCount", defaultValue: 0 },
        { type: "integer", key: "ownerInterventionsCount", defaultValue: 0 },
      ]
    );
    await createIndexIfMissing(process.env.VITE_APPWRITE_COL_DRIVER_SESSIONS, 'active_session', 'key', ['driverId', 'sessionEnd']);
    await ensureCollectionPermissions(process.env.VITE_APPWRITE_COL_DRIVER_SESSIONS, ['read("users")', 'create("users")', 'update("users")', 'delete("users")']);
  }

  // D) emergency_cases (track unresolved/resolved)
  if (process.env.VITE_APPWRITE_COL_EMERGENCY_CASES) {
    await createCollectionWithAttributes(
      process.env.VITE_APPWRITE_COL_EMERGENCY_CASES,
      "EmergencyCases",
      [
        { type: "string", key: "caseType", required: true }, // Alcohol / Drowsiness / HeartRate
        { type: "string", key: "carId", required: true },
        { type: "string", key: "driverId", required: false },
        { type: "boolean", key: "resolved", defaultValue: false },
        { type: "string", key: "ownerActionTaken" },
        { type: "datetime", key: "createdAt", required: true },
        { type: "datetime", key: "resolvedAt" },
      ]
    );
    await createIndexIfMissing(process.env.VITE_APPWRITE_COL_EMERGENCY_CASES, 'unresolved_cases', 'key', ['resolved', 'createdAt'], ['ASC']);
    await ensureCollectionPermissions(process.env.VITE_APPWRITE_COL_EMERGENCY_CASES, ['read("users")', 'create("users")', 'update("users")', 'delete("users")']);
  }

  console.log("   Setup complete.");
}

setup().catch((err) => console.error("Fatal error:", err));
