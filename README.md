# 350 DataHive Lakehouse Logging System

## Student

**Name:** Muhammad Arsal  
**Roll No:** 2022350

## Problem Statement Summary

DataHive needs a lightweight private cloud backend where users can register and log in, create events, notify another service asynchronously, and store event logs for lakehouse-style ingestion. This project is a Dockerized microservices prototype built for the CE408L Cloud Computing Lab Final Term Exam.

## Architecture

```text
Client -> Auth Service -> PostgreSQL
Client -> Event Service -> PostgreSQL
Event Service -> RabbitMQ -> Notification Service
Event Service -> JSON Logs
Notification Service -> Notification JSON Logs
```

The system has three Node.js services:

- **350_auth_service** handles user registration, login, password hashing, JWT creation, and user table setup.
- **350_event_service** protects event APIs with JWT, stores events in PostgreSQL, publishes event-created messages to RabbitMQ, and writes JSON event logs for lakehouse-style ingestion.
- **350_notification_service** is a worker that consumes RabbitMQ messages asynchronously, prints notification output, and saves consumed messages as JSON files.

Infrastructure services:

- **350_postgres** stores users and events in one PostgreSQL database.
- **350_rabbitmq** provides asynchronous messaging and a browser management dashboard.

## Tech Stack

- Node.js
- Express.js
- PostgreSQL
- RabbitMQ
- Docker
- Docker Compose
- JWT authentication
- bcrypt password hashing
- JSON file logging

## Project Structure

```text
350_datahive_lakehouse_logging/
├── docker-compose.yml
├── README.md
├── .gitignore
├── .env.example
├── logs/
│   └── .gitkeep
├── notification_logs/
│   └── .gitkeep
├── auth-service/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── event-service/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
└── notification-service/
    ├── Dockerfile
    ├── package.json
    └── worker.js
```

## Services and Ports

| Service | Container Name | Port |
| --- | --- | --- |
| Auth Service | `350_auth_service` | `5001:5001` |
| Event Service | `350_event_service` | `5002:5002` |
| PostgreSQL | `350_postgres` | `5432:5432` |
| RabbitMQ AMQP | `350_rabbitmq` | `5672:5672` |
| RabbitMQ Dashboard | `350_rabbitmq` | `15672:15672` |

## Database Design

### users

```sql
id SERIAL PRIMARY KEY
name VARCHAR(100) NOT NULL
email VARCHAR(150) UNIQUE NOT NULL
password_hash TEXT NOT NULL
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### events

```sql
id SERIAL PRIMARY KEY
user_id INTEGER NOT NULL
title VARCHAR(200) NOT NULL
description TEXT
location VARCHAR(200)
event_date VARCHAR(100)
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

## RabbitMQ Queue

Queue name:

```text
350_event_notifications
```

Message format:

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

## JSON Lakehouse Logging

When an event is created, the Event Service writes a file in `logs/` using this filename pattern:

```text
event_350_<event_id>_<timestamp>.json
```

The file contains:

```json
{
  "lakehouse_log_type": "event_ingestion",
  "resource_prefix": "350",
  "event": {},
  "ingested_at": "2026-05-12T00:00:00.000Z",
  "storage_format": "json",
  "purpose": "basic analytical data ingestion workflow"
}
```

The Notification Service writes consumed RabbitMQ messages in `notification_logs/` using this filename pattern:

```text
notification_350_<event_id>_<timestamp>.json
```

## How to Run

From inside the project directory:

```bash
docker compose up --build
```

Open the RabbitMQ dashboard:

```text
http://localhost:15672
```

RabbitMQ credentials:

```text
Username: 350_rabbit
Password: 350_rabbit_password
```

## API Endpoints

### Auth Service

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `http://localhost:5001/` | Auth service info |
| `GET` | `http://localhost:5001/health` | Auth service health |
| `POST` | `http://localhost:5001/register` | Register a new user |
| `POST` | `http://localhost:5001/login` | Login and receive JWT |

### Event Service

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `http://localhost:5002/` | Event service info |
| `GET` | `http://localhost:5002/health` | Event service health |
| `POST` | `http://localhost:5002/events` | Create event, requires JWT |
| `GET` | `http://localhost:5002/events` | View logged-in user's events, requires JWT |
| `GET` | `http://localhost:5002/events/:id` | View one logged-in user's event, requires JWT |

## Testing Commands

### 1. Register

```bash
curl -X POST http://localhost:5001/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Muhammad Arsal","email":"arsal@example.com","password":"123456"}'
```

### 2. Login

```bash
curl -X POST http://localhost:5001/login \
  -H "Content-Type: application/json" \
  -d '{"email":"arsal@example.com","password":"123456"}'
```

Copy the `token` value from the login response.

### 3. Create Event

```bash
curl -X POST http://localhost:5002/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PASTE_TOKEN_HERE" \
  -d '{"title":"Cloud Computing Final Lab","description":"Lakehouse logging prototype event","location":"GIKI Lab","event_date":"2026-05-12"}'
```

### 4. View Events

```bash
curl -X GET http://localhost:5002/events \
  -H "Authorization: Bearer PASTE_TOKEN_HERE"
```

### 5. View Single Event

```bash
curl -X GET http://localhost:5002/events/1 \
  -H "Authorization: Bearer PASTE_TOKEN_HERE"
```

## Expected Evidence for Exam Submission

Capture screenshots showing:

- Auth service running
- Event service running
- PostgreSQL container running
- RabbitMQ container running
- Successful user registration
- Successful login response with JWT token
- Successful event creation response
- Event retrieval response
- RabbitMQ queue `350_event_notifications`
- Notification service consumed message in Docker logs
- JSON files created in `logs/`
- JSON files created in `notification_logs/`

## Useful Docker Commands

```bash
docker compose ps
```

```bash
docker compose logs 350_auth_service
```

```bash
docker compose logs 350_event_service
```

```bash
docker compose logs 350_notification_service
```

```bash
docker compose down
```

```bash
docker compose down -v
```

Use `docker compose down -v` after the exam if you want to remove the PostgreSQL named volume and start with a clean database next time.

## GitHub Submission Instructions

```bash
git init
git add .
git commit -m "Add 350 DataHive lakehouse logging system"
git branch -M main
```

After creating a GitHub repository named `350_datahive_lakehouse_logging`, GitHub will show the exact `git remote add origin ...` and `git push -u origin main` commands for your account. Run those two commands, then submit the accessible repository link and include the required screenshots in your exam submission.

## Health Check URLs

```text
http://localhost:5001/health
http://localhost:5002/health
```

## Notes

- The Auth Service auto-creates the `users` table on startup.
- The Event Service auto-creates the `events` table on startup.
- The Event Service and Notification Service include RabbitMQ retry logic because RabbitMQ can take a little time to become ready.
- Event routes require this header:

```text
Authorization: Bearer TOKEN_HERE
```
