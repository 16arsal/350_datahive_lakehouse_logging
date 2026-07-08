# DataHive Lakehouse Logging System

A Dockerized microservices prototype for user authentication, event creation, asynchronous notifications, PostgreSQL storage, and JSON log files that simulate a simple lakehouse ingestion workflow.

This project was built for the CE408L Cloud Computing Lab final exam. It is intentionally small, but it demonstrates how multiple backend services can coordinate through a database, message queue, and structured file logs.

## What the System Does

The system lets a user register, log in, create events, and retrieve their own events. When an event is created, the event service performs three actions:

1. Stores the event in PostgreSQL.
2. Publishes an `EVENT_CREATED` message to RabbitMQ.
3. Writes a structured JSON event log to `logs/`.

A separate notification worker consumes the RabbitMQ message and writes a second structured JSON log to `notification_logs/`.

## Architecture

```text
Client
  |
  | register/login
  v
Auth Service --------------> PostgreSQL

Client
  |
  | Bearer JWT + event request
  v
Event Service -------------> PostgreSQL
  |                              
  | publish EVENT_CREATED
  v
RabbitMQ Queue ------------> Notification Worker
  |
  +--> logs/event_350_<event_id>_<timestamp>.json

Notification Worker -------> notification_logs/notification_350_<event_id>_<timestamp>.json
```

## Services

| Service | Source | Responsibility | Port |
| --- | --- | --- | --- |
| `350_auth_service` | `auth-service/server.js` | Registers users, hashes passwords with bcrypt, validates login, and issues JWTs. | `5001` |
| `350_event_service` | `event-service/server.js` | Verifies JWTs, stores events, publishes RabbitMQ messages, and writes event ingestion logs. | `5002` |
| `350_notification_service` | `notification-service/worker.js` | Consumes RabbitMQ messages and writes notification logs. | Internal worker |
| `350_postgres` | `docker-compose.yml` | Stores `users` and `events` tables. | `5432` |
| `350_rabbitmq` | `docker-compose.yml` | Provides AMQP messaging and the RabbitMQ management dashboard. | `5672`, `15672` |

## Verified Tech Stack

- Node.js and Express
- PostgreSQL 16 Alpine
- RabbitMQ 3.13 Management Alpine
- Docker and Docker Compose
- `pg` for PostgreSQL access
- `jsonwebtoken` for JWT authentication
- `bcryptjs` for password hashing
- `amqplib` for RabbitMQ publish/consume flow
- JSON file logging through Node's filesystem APIs

## Repository Structure

```text
.
|-- API_TESTING.md
|-- CE-408-LAB-FINAL-SCREENSHOTS.pdf
|-- docker-compose.yml
|-- auth-service/
|   |-- Dockerfile
|   |-- package.json
|   `-- server.js
|-- event-service/
|   |-- Dockerfile
|   |-- package.json
|   `-- server.js
`-- notification-service/
    |-- Dockerfile
    |-- package.json
    `-- worker.js
```

The generated runtime JSON logs are ignored by Git through `.gitignore`:

```text
logs/*.json
notification_logs/*.json
```

## Database Tables

The services create their own tables on startup if they do not already exist.

### `users`

```sql
id SERIAL PRIMARY KEY
name VARCHAR(100) NOT NULL
email VARCHAR(150) UNIQUE NOT NULL
password_hash TEXT NOT NULL
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### `events`

```sql
id SERIAL PRIMARY KEY
user_id INTEGER NOT NULL
title VARCHAR(200) NOT NULL
description TEXT
location VARCHAR(200)
event_date VARCHAR(100)
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

## Authentication Flow

1. `POST /register` receives `name`, `email`, and `password`.
2. The auth service normalizes the email, checks for duplicates, hashes the password with bcrypt, and inserts a user record.
3. `POST /login` checks the password and returns a JWT that expires in 2 hours.
4. Event routes require this header:

```text
Authorization: Bearer TOKEN_HERE
```

## RabbitMQ Flow

The queue name is defined in `docker-compose.yml` and used by both the event service and notification worker:

```text
350_event_notifications
```

When an event is created, the event service publishes a persistent JSON message with this structure:

```json
{
  "event_id": 1,
  "user_id": 1,
  "title": "Cloud Computing Final Lab",
  "description": "Lakehouse logging prototype event",
  "location": "GIKI Lab",
  "event_date": "2026-05-12",
  "created_at": "2026-05-12T00:00:00.000Z",
  "source": "350_event_service",
  "message_type": "EVENT_CREATED"
}
```

The notification worker calls `channel.prefetch(1)`, processes one message at a time, writes a notification log, and acknowledges the message. If message processing fails, it negatively acknowledges the message with requeue enabled.

## Structured JSON Logging

### Event ingestion log

Created by `event-service/server.js` in `logs/`:

```text
event_350_<event_id>_<timestamp>.json
```

The log includes the inserted event, ingestion timestamp, storage format, resource prefix, and ingestion purpose.

### Notification log

Created by `notification-service/worker.js` in `notification_logs/`:

```text
notification_350_<event_id>_<timestamp>.json
```

The log includes the consumed RabbitMQ message, queue name, resource prefix, and consumption timestamp.

## Run Locally

Prerequisite: Docker Desktop or Docker Compose support.

From the repository root:

```powershell
docker compose up --build
```

Useful service URLs:

```text
Auth health:        http://localhost:5001/health
Event health:       http://localhost:5002/health
RabbitMQ dashboard: http://localhost:15672
```

RabbitMQ dashboard credentials from `docker-compose.yml`:

```text
Username: 350_rabbit
Password: 350_rabbit_password
```

Stop the system:

```powershell
docker compose down
```

Stop the system and remove the PostgreSQL volume:

```powershell
docker compose down -v
```

## API Endpoints

### Auth service

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `http://localhost:5001/` | Service info |
| `GET` | `http://localhost:5001/health` | Health check with database connectivity |
| `POST` | `http://localhost:5001/register` | Create a user |
| `POST` | `http://localhost:5001/login` | Return a JWT for a valid user |

### Event service

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `http://localhost:5002/` | Service info |
| `GET` | `http://localhost:5002/health` | Health check with PostgreSQL and RabbitMQ status |
| `POST` | `http://localhost:5002/events` | Create an event for the authenticated user |
| `GET` | `http://localhost:5002/events` | List events for the authenticated user |
| `GET` | `http://localhost:5002/events/:id` | Retrieve one authenticated user's event |

## API Testing Order

The full testing sequence is documented in `API_TESTING.md`. A short version is below.

Register a user:

```powershell
curl.exe -X POST "http://localhost:5001/register" `
  -H "Content-Type: application/json" `
  -d '{"name":"Muhammad Arsal","email":"arsal@example.com","password":"123456"}'
```

Log in and store the JWT:

```powershell
$login = curl.exe -X POST "http://localhost:5001/login" `
  -H "Content-Type: application/json" `
  -d '{"email":"arsal@example.com","password":"123456"}'

$login = $login | ConvertFrom-Json
$token = $login.token
```

Create an event:

```powershell
curl.exe -X POST "http://localhost:5002/events" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -d '{"title":"Cloud Computing Final Lab","description":"Lakehouse logging prototype event","location":"GIKI Lab","event_date":"2026-05-12"}'
```

View events:

```powershell
curl.exe -X GET "http://localhost:5002/events" `
  -H "Authorization: Bearer $token"
```

Check worker output and generated logs:

```powershell
docker compose logs 350_notification_service
Get-ChildItem .\logs
Get-ChildItem .\notification_logs
```

## Evidence

The repository includes `CE-408-LAB-FINAL-SCREENSHOTS.pdf`, a 4-page PDF evidence file for the lab submission. It is kept as an artifact rather than embedded in this README.

## Limitations

- The credentials and JWT secret in `docker-compose.yml` are local demo values for coursework, not production secrets.
- There is no refresh-token flow, role system, or external identity provider.
- The `events` table stores `event_date` as text rather than a typed date column.
- JSON logs are written to local mounted folders; there is no object storage or query engine connected to them.
- The services do not include automated tests in the repository.

## Future Improvements

- Move secrets into environment-specific configuration.
- Add automated API tests for auth, event creation, and message consumption.
- Store `event_date` with a database date or timestamp type.
- Add migrations instead of table creation inside service startup code.
- Replace local JSON folders with object storage for a more realistic lakehouse-style pipeline.
