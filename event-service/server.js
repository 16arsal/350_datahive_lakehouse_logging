const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const amqp = require("amqplib");
const fs = require("fs/promises");
const path = require("path");
require("dotenv").config();

// 350 Event Service: stores JWT-protected events, publishes RabbitMQ messages, and writes lakehouse JSON logs.
const app = express();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in the environment`);
  }
  return value;
}

const PORT = process.env.PORT || 5002;
const JWT_SECRET = requireEnv("JWT_SECRET");
const RABBITMQ_URL = requireEnv("RABBITMQ_URL");
const QUEUE_NAME = process.env.RABBITMQ_QUEUE || "350_event_notifications";
const LOGS_DIR = process.env.LOGS_DIR || "/app/logs";

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "datahive_app",
  password: requireEnv("DB_PASSWORD"),
  database: process.env.DB_NAME || "datahive_db"
});

let rabbitConnection = null;
let rabbitChannel = null;
let rabbitConnected = false;
let rabbitConnectingPromise = null;

app.use(express.json());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function validateEventBody(body) {
  const title = String(body.title || "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const location = body.location ? String(body.location).trim() : null;
  const eventDate = body.event_date ? String(body.event_date).trim() : null;

  if (!title) {
    return { error: "Event title is required" };
  }

  return {
    title,
    description,
    location,
    event_date: eventDate
  };
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Authorization header must be in the format: Bearer TOKEN_HERE" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function initializeDatabase() {
  while (true) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          title VARCHAR(200) NOT NULL,
          description TEXT,
          location VARCHAR(200),
          event_date VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log("[350_EVENT_SERVICE] Events table is ready");
      return;
    } catch (error) {
      console.error("[350_EVENT_SERVICE] PostgreSQL not ready, retrying in 5 seconds:", error.message);
      await sleep(5000);
    }
  }
}

function markRabbitDisconnected() {
  rabbitConnected = false;
  rabbitChannel = null;
  rabbitConnection = null;
}

async function connectRabbitMQ() {
  if (rabbitConnected && rabbitChannel) {
    return;
  }

  if (rabbitConnectingPromise) {
    return rabbitConnectingPromise;
  }

  rabbitConnectingPromise = (async () => {
    while (!rabbitConnected) {
      try {
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });

        connection.on("error", (error) => {
          console.error("[350_EVENT_SERVICE] RabbitMQ connection error:", error.message);
        });

        connection.on("close", () => {
          markRabbitDisconnected();
          console.error("[350_EVENT_SERVICE] RabbitMQ connection closed, reconnecting in 5 seconds");
          setTimeout(() => {
            connectRabbitMQ().catch((error) => {
              console.error("[350_EVENT_SERVICE] RabbitMQ reconnect failed:", error.message);
            });
          }, 5000);
        });

        rabbitConnection = connection;
        rabbitChannel = channel;
        rabbitConnected = true;

        console.log(`[350_EVENT_SERVICE] Connected to RabbitMQ queue ${QUEUE_NAME}`);
      } catch (error) {
        markRabbitDisconnected();
        console.error("[350_EVENT_SERVICE] RabbitMQ not ready, retrying in 5 seconds:", error.message);
        await sleep(5000);
      }
    }

    return;
  })();

  try {
    await rabbitConnectingPromise;
  } finally {
    rabbitConnectingPromise = null;
  }
}

async function publishEventNotification(message) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await connectRabbitMQ();

    try {
      const wasPublished = rabbitChannel.sendToQueue(
        QUEUE_NAME,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          contentType: "application/json"
        }
      );

      if (!wasPublished) {
        console.warn("[350_EVENT_SERVICE] RabbitMQ publish buffer is full; message is queued by amqplib");
      }

      return;
    } catch (error) {
      markRabbitDisconnected();

      if (attempt === 2) {
        throw error;
      }

      console.error("[350_EVENT_SERVICE] RabbitMQ publish failed, retrying once:", error.message);
      await sleep(1000);
    }
  }
}

async function writeLakehouseEventLog(event) {
  await fs.mkdir(LOGS_DIR, { recursive: true });

  const lakehouseLog = {
    lakehouse_log_type: "event_ingestion",
    resource_prefix: "350",
    event,
    ingested_at: new Date().toISOString(),
    storage_format: "json",
    purpose: "basic analytical data ingestion workflow"
  };

  const fileName = `event_350_${event.id}_${safeTimestamp()}.json`;
  const filePath = path.join(LOGS_DIR, fileName);

  await fs.writeFile(filePath, JSON.stringify(lakehouseLog, null, 2));
  return filePath;
}

app.get("/", (req, res) => {
  res.json({
    service: "350_event_service",
    status: "running",
    message: "Event service for DataHive lakehouse logging system"
  });
});

app.get("/health", asyncHandler(async (req, res) => {
  const rabbitHealthy = rabbitConnected && Boolean(rabbitChannel);

  try {
    await pool.query("SELECT 1");

    res.status(rabbitHealthy ? 200 : 503).json({
      service: "350_event_service",
      status: rabbitHealthy ? "healthy" : "degraded",
      database: "connected",
      rabbitmq: rabbitHealthy ? "connected" : "disconnected",
      queue: QUEUE_NAME,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: "350_event_service",
      status: "unhealthy",
      database: "disconnected",
      rabbitmq: rabbitHealthy ? "connected" : "disconnected",
      queue: QUEUE_NAME,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

app.post("/events", authenticateToken, asyncHandler(async (req, res) => {
  const validated = validateEventBody(req.body);

  if (validated.error) {
    return res.status(400).json({ error: validated.error });
  }

  const insertResult = await pool.query(
    `INSERT INTO events (user_id, title, description, location, event_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, title, description, location, event_date, created_at`,
    [
      req.user.userId,
      validated.title,
      validated.description,
      validated.location,
      validated.event_date
    ]
  );

  const event = insertResult.rows[0];
  const eventMessage = {
    event_id: event.id,
    user_id: event.user_id,
    title: event.title,
    description: event.description,
    location: event.location,
    event_date: event.event_date,
    created_at: event.created_at,
    source: "350_event_service",
    message_type: "EVENT_CREATED"
  };

  await publishEventNotification(eventMessage);
  const log_file = await writeLakehouseEventLog(event);

  res.status(201).json({
    message: "Event created, stored, published to RabbitMQ, and logged as JSON",
    event,
    rabbitmq_queue: QUEUE_NAME,
    log_file
  });
}));

app.get("/events", authenticateToken, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, user_id, title, description, location, event_date, created_at
     FROM events
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [req.user.userId]
  );

  res.json({
    count: result.rows.length,
    events: result.rows
  });
}));

app.get("/events/:id", authenticateToken, asyncHandler(async (req, res) => {
  const eventId = Number(req.params.id);

  if (!Number.isInteger(eventId) || eventId <= 0) {
    return res.status(400).json({ error: "Event id must be a positive number" });
  }

  const result = await pool.query(
    `SELECT id, user_id, title, description, location, event_date, created_at
     FROM events
     WHERE id = $1 AND user_id = $2`,
    [eventId, req.user.userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Event not found" });
  }

  res.json({ event: result.rows[0] });
}));

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
  console.error("[350_EVENT_SERVICE] Error:", error.message);
  res.status(500).json({ error: "Internal server error" });
});

async function startServer() {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await initializeDatabase();
  await connectRabbitMQ();

  app.listen(PORT, () => {
    console.log(`[350_EVENT_SERVICE] Running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("[350_EVENT_SERVICE] Failed to start:", error);
  process.exit(1);
});
