# Monash Team 10 FIT 3161

## Backend Architecture

### Diagram

![Architecture Diagram](./Docs/out/Docs/sequence_diagram/Annotation%20Tool.svg)

### Key technologies

- **NestJS + TypeScript** for structured modules, global validation/interceptors, and shared config.
- **PostgreSQL + TypeORM** for relational entities (users, projects, slides, annotations, roles).
- **JWT + RolesGuard** for authentication/authorization, with scoped guards for project membership.
- **Socket.IO + BullMQ/Redis** for real-time collaboration and safe async persistence of comments, boxes, and skeletons.
- **FastAPI analyzer** (YOLO + ONNX species + pose) running in the same Docker image to provide AI-assisted annotations.

### What powers the backend

- The NestJS server orchestrates HTTP, WebSocket, and queue work under a single TypeScript codebase. Global validation, serialization helpers, and flexible CORS keep incoming payloads clean whether they arrive from the Angular dashboard or a remote script.
- Authentication centers on JWT. Registration and login flows issue signed tokens, and a guard checks them for every protected endpoint. Project actions are cross-checked against per-user roles (admin/write/read) so permissions are enforced centrally.
- Persistent state lives in PostgreSQL entities: users, projects, slides, annotations, and project-role links. Services enforce business rules—projects ship with an admin role, slides cascade their annotations, and uploads stream to disk before persisting the updated metadata.
- BullMQ queues for comments, bounding boxes, and skeletals keep annotation work asynchronous. Socket.IO gateways validate incoming events, enqueue jobs, and processors persist changes before broadcasting updates to every client in the slide room.
- The AI-assisted path feeds slide metadata to a FastAPI analyzer running alongside the Nest app. That service downloads images, runs YOLO detection/pose estimation, and returns bounding boxes and keypoints that are treated as normal annotation updates so the UI reflects them instantly.

### Workflow snapshot

- The diagram starts with project selection via `/project/all`. The backend verifies the user’s `ProjectUserRole` (admin/write/read) and only surfaces the projects the person is allowed to access.
- Picking a slide makes the client join `slide:{id}` through the Socket.IO gateway, which broadcasts presence so teammates can see who is editing and establishes a shared room for annotations.
- Annotation changes—whether REST uploads, WebSocket messages, or AI outputs—are validated, enqueued on BullMQ, processed, saved to PostgreSQL, and broadcast back to `slide:{id}` so everyone stays in sync.
- Calling `/ai_auto/:project_id` kicks off the analyzer, which returns bounding boxes/skeletals that are injected into the same processing loop, allowing automated predictions to appear in the collaboration room immediately.

## Local network setup & run

- Step 1: Create a `.env` file inside `server/` with at least these values:

  ```env
  CLIENT_ORIGINS="*"
  PORT=8080
  SQL_PORT=5432
  DATABASE="webAnnotation"
  DATABASE_PASS="password"
  USER_NAME="admin"       # change this if your Postgres user is different
  HOST="localhost"
  JWT_SECRET="webAnnotation_secret_key"
  JWT_EXPIRES_IN="4d"
  AI_ANALYZE_ENDPOINT="http://localhost:8000/analyze"
  ```

- Step 2: Start the stack by running `docker compose up --build` from the repo root so Docker spins up Postgres, Redis, the FastAPI analyzer, the Nest backend, and the Angular client.
- Step 3: Share the host machine’s LAN IP with teammates (macOS: `ipconfig getifaddr en0`, Linux: `hostname -I`, Windows: `ipconfig`) and point browsers to `http://<host-ip>:4200`.
- Step 4: The Angular client and Socket.IO reuse that host; override it via `client/public/env.js` if you need a custom API/WS host.
