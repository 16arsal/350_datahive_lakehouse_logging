const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
require("dotenv").config();

// 350 Auth Service: registers users, hashes passwords, logs users in, and issues JWTs.
const app = express();

const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || "350_super_secret_exam_key";
const JWT_EXPIRES_IN = "2h";

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "350_admin",
  password: process.env.DB_PASSWORD || "350_password",
  database: process.env.DB_NAME || "350_datahive_db"
});

app.use(express.json());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateRegisterBody(body) {
  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!name || !email || !password) {
    return { error: "Name, email, and password are required" };
  }

  if (!email.includes("@")) {
    return { error: "A valid email address is required" };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters long" };
  }

  return { name, email, password };
}

function validateLoginBody(body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  return { email, password };
}

async function initializeDatabase() {
  while (true) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(150) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log("[350_AUTH_SERVICE] Users table is ready");
      return;
    } catch (error) {
      console.error("[350_AUTH_SERVICE] PostgreSQL not ready, retrying in 5 seconds:", error.message);
      await sleep(5000);
    }
  }
}

app.get("/", (req, res) => {
  res.json({
    service: "350_auth_service",
    status: "running",
    message: "Authentication service for DataHive lakehouse logging system"
  });
});

app.get("/health", asyncHandler(async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "350_auth_service",
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: "350_auth_service",
      status: "unhealthy",
      database: "disconnected",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

app.post("/register", asyncHandler(async (req, res) => {
  const validated = validateRegisterBody(req.body);

  if (validated.error) {
    return res.status(400).json({ error: validated.error });
  }

  const duplicateUser = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [validated.email]
  );

  if (duplicateUser.rows.length > 0) {
    return res.status(409).json({ error: "Email is already registered" });
  }

  const passwordHash = await bcrypt.hash(validated.password, 10);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, created_at`,
    [validated.name, validated.email, passwordHash]
  );

  res.status(201).json({
    message: "User registered successfully",
    user: result.rows[0]
  });
}));

app.post("/login", asyncHandler(async (req, res) => {
  const validated = validateLoginBody(req.body);

  if (validated.error) {
    return res.status(400).json({ error: validated.error });
  }

  const result = await pool.query(
    "SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1",
    [validated.email]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const user = result.rows[0];
  const isPasswordValid = await bcrypt.compare(validated.password, user.password_hash);

  if (!isPasswordValid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.json({
    message: "Login successful",
    token,
    expires_in: JWT_EXPIRES_IN,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at
    }
  });
}));

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
  console.error("[350_AUTH_SERVICE] Error:", error.message);
  res.status(500).json({ error: "Internal server error" });
});

async function startServer() {
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`[350_AUTH_SERVICE] Running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("[350_AUTH_SERVICE] Failed to start:", error);
  process.exit(1);
});
