Monash Team 10 FIT 3161

## Local Network Access

- Bring the stack up with `docker compose up --build`.
- On the host machine (the laptop/desktop running Docker) determine the LAN IP address:
  - macOS: `ipconfig getifaddr en0`
  - Linux: `hostname -I` (pick the `192.168.x.x` or `10.x.x.x` entry)
  - Windows: `ipconfig` (look for the Wi-Fi/ethernet IPv4 address)
- Share **that host address** (for example `192.168.1.23`). That is the address teammates should open: `http://192.168.1.23:4200`. The `172.x.x.x` address printed by `ng serve` is the Docker container's internal IP and is **not reachable** from other devices.
- The Angular client will call the API and Socket.IO using the same host automatically. If you need different values, create `client/public/env.js` with `window.env = { API_URL: 'http://<host-ip>:8080', WS_URL: 'http://<host-ip>:8080' };` and restart the client container.
- The Nest server already binds to `0.0.0.0`; you can tighten CORS by setting `CLIENT_ORIGINS` (comma separated) or override the bind host with `SERVER_HOST`.
