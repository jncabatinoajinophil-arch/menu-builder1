# Menu Update Request Builder (PERN: PostgreSQL + Express + React + Node)

PostgreSQL + Express + React (Vite) + Node. Two roles:

- **User** – registers, builds menu update requests, saves drafts, downloads the Excel Master Template, submits for review.
  Submitted requests are locked until an admin sets them to "Needs changes".
- **Administrator** – dashboard with totals by status and request type, all requests (search, filter, set status,
  leave a note for the user, download .xlsx, delete) and user management (role, deactivate, delete).

Status flow: Draft → Submitted → In progress → Completed (admin can send it back with "Needs changes").

## Run locally
1. Install Node 20+ and PostgreSQL 14+ (or use a hosted database such as Neon, Supabase or Render Postgres).
2. Create a database, e.g. `createdb menu_builder`.
3. `cp server/.env.example server/.env` and edit it: DATABASE_URL, a long random JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD.
4. Two terminals:
   - `cd server && npm install && npm run dev`   (API on :5000; creates the tables and the first admin on startup)
   - `cd client && npm install && npm run dev`   (app on http://localhost:5173)
5. Log in with the admin email/password. Anyone who registers through the site gets the "user" role;
   admins can promote people from the Users page.

Tables: users, requests, categories, products, modifiers, options (menu data is stored relationally, so it is queryable with SQL).

## Deploy so anyone can open it (Render)
1. Push this folder to a GitHub repository.
2. In Render: New > Blueprint, pick the repository. `render.yaml` creates the web service and a PostgreSQL database.
3. When prompted, enter ADMIN_EMAIL and ADMIN_PASSWORD (your first administrator). JWT_SECRET is generated for you.
4. Wait for the deploy. Your public address is shown on the service page (https://<name>.onrender.com).
   Log in with the admin email and password; people register themselves from the same address.

Free-tier notes (check Render's current docs): free web services sleep after ~15 minutes without traffic and take about
a minute to wake; free Postgres expires 30 days after creation and has no backups. For real use, upgrade the database
(and the web service to avoid sleeping) in the Render dashboard.

Any other host that runs Node works too: build with `npm run build`, start with `npm start`, set DATABASE_URL,
JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD and NODE_ENV=production. This server does not run on Vercel as written.
