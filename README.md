# be-tasmil — Quick Start

1) Start Docker Compose:

```powershell
docker compose up --build -d
```

2) Run Migration container API init schema:

```powershell
docker exec -it be-tasmil-api-1 sh -c "npm run typeorm:migration:run"
```

3) Test Login Wallet index.html
- Connect Wallet 
- Login Wallet 
- Copy Payload

4) Test Swagger:
- Swagger `http://localhost:3000/api/docs`

5) Update role Admin create Campaigns, Tasks:

```powershell
docker exec -it be-tasmil-postgres-1 psql -U postgres -d tasmil -c "UPDATE users SET role='admin' WHERE id='';"   
```
