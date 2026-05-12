const amqp = require("amqplib");
const fs = require("fs/promises");
const path = require("path");
require("dotenv").config();

// 350 Notification Service: consumes event messages asynchronously and stores notification JSON logs.
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://350_rabbit:350_rabbit_password@localhost:5672";
const QUEUE_NAME = process.env.RABBITMQ_QUEUE || "350_event_notifications";
const NOTIFICATION_LOGS_DIR = process.env.NOTIFICATION_LOGS_DIR || "/app/notification_logs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let workerStarting = false;

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function saveNotificationLog(message) {
  await fs.mkdir(NOTIFICATION_LOGS_DIR, { recursive: true });

  const logPayload = {
    notification_log_type: "event_notification",
    resource_prefix: "350",
    message,
    consumed_at: new Date().toISOString(),
    queue: QUEUE_NAME
  };

  const eventId = message.event_id || "unknown";
  const fileName = `notification_350_${eventId}_${safeTimestamp()}.json`;
  const filePath = path.join(NOTIFICATION_LOGS_DIR, fileName);

  await fs.writeFile(filePath, JSON.stringify(logPayload, null, 2));
  return filePath;
}

async function startWorker() {
  if (workerStarting) {
    return;
  }

  workerStarting = true;
  await fs.mkdir(NOTIFICATION_LOGS_DIR, { recursive: true });

  while (true) {
    try {
      const connection = await amqp.connect(RABBITMQ_URL);

      connection.on("error", (error) => {
        console.error("[350_NOTIFICATION_SERVICE] RabbitMQ connection error:", error.message);
      });

      connection.on("close", () => {
        console.error("[350_NOTIFICATION_SERVICE] RabbitMQ connection closed, reconnecting in 5 seconds");
        setTimeout(startWorker, 5000);
      });

      const channel = await connection.createChannel();
      await channel.assertQueue(QUEUE_NAME, { durable: true });
      channel.prefetch(1);

      console.log(`[350_NOTIFICATION_SERVICE] Waiting for messages from ${QUEUE_NAME}`);

      await channel.consume(QUEUE_NAME, async (msg) => {
        if (!msg) {
          return;
        }

        try {
          const eventMessage = JSON.parse(msg.content.toString());
          console.log(`[350_NOTIFICATION] New event created: ${eventMessage.title} for user ${eventMessage.user_id}`);

          const logFile = await saveNotificationLog(eventMessage);
          console.log(`[350_NOTIFICATION_SERVICE] Notification log saved: ${logFile}`);

          channel.ack(msg);
        } catch (error) {
          console.error("[350_NOTIFICATION_SERVICE] Failed to process message:", error.message);
          channel.nack(msg, false, true);
        }
      });

      workerStarting = false;
      return;
    } catch (error) {
      console.error("[350_NOTIFICATION_SERVICE] RabbitMQ not ready, retrying in 5 seconds:", error.message);
      await sleep(5000);
    }
  }
}

startWorker().catch((error) => {
  console.error("[350_NOTIFICATION_SERVICE] Failed to start:", error);
  process.exit(1);
});
