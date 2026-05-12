# Screenshots Checklist

Take screenshots of these items for the CE408L final submission:

1. Project folder structure showing `350_datahive_lakehouse_logging`.
2. `docker compose up --build` terminal output showing services starting.
3. `docker compose ps` showing these containers running:
   - `350_postgres`
   - `350_rabbitmq`
   - `350_auth_service`
   - `350_event_service`
   - `350_notification_service`
4. Auth service health response from `http://localhost:5001/health`.
5. Event service health response from `http://localhost:5002/health`.
6. Successful register API response.
7. Successful login API response showing JWT token.
8. Successful create event API response.
9. Successful view events API response.
10. Successful view single event API response.
11. RabbitMQ dashboard at `http://localhost:15672`.
12. RabbitMQ queue named `350_event_notifications`.
13. `docker compose logs 350_notification_service` showing `[350_NOTIFICATION] New event created`.
14. JSON event log file inside `logs/`.
15. JSON notification log file inside `notification_logs/`.
16. GitHub repository page showing the pushed project.
