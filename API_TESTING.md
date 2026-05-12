# API Testing Order

Run these commands in Windows PowerShell from the project root after starting Docker Compose.

## 1. Start the system

```powershell
docker compose up --build
```

Open a second PowerShell terminal for the API commands below.

## 2. Check running containers

```powershell
docker compose ps
```

## 3. Check Auth Service health

```powershell
curl.exe -X GET "http://localhost:5001/health"
```

## 4. Check Event Service health

```powershell
curl.exe -X GET "http://localhost:5002/health"
```

## 5. Register user

```powershell
curl.exe -X POST "http://localhost:5001/register" `
  -H "Content-Type: application/json" `
  -d '{"name":"Muhammad Arsal","email":"arsal@example.com","password":"123456"}'
```

## 6. Login and save token

```powershell
$login = curl.exe -X POST "http://localhost:5001/login" `
  -H "Content-Type: application/json" `
  -d '{"email":"arsal@example.com","password":"123456"}'

$login = $login | ConvertFrom-Json
$token = $login.token
$token
```

## 7. Create event

```powershell
curl.exe -X POST "http://localhost:5002/events" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -d '{"title":"Cloud Computing Final Lab","description":"Lakehouse logging prototype event","location":"GIKI Lab","event_date":"2026-05-12"}'
```

## 8. View all events

```powershell
curl.exe -X GET "http://localhost:5002/events" `
  -H "Authorization: Bearer $token"
```

## 9. View single event

```powershell
curl.exe -X GET "http://localhost:5002/events/1" `
  -H "Authorization: Bearer $token"
```

## 10. Confirm notification worker consumed the message

```powershell
docker compose logs 350_notification_service
```

## 11. Confirm JSON log files were created

```powershell
Get-ChildItem .\logs
Get-ChildItem .\notification_logs
```

## 12. Stop containers

```powershell
docker compose down
```

## 13. Stop containers and remove database volume

```powershell
docker compose down -v
```
