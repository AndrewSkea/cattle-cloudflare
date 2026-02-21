# Auth & Multi-Tenancy Design

> Date: 2026-02-18
> Status: Approved

## Overview

Add Google OAuth authentication with Cloudflare Turnstile bot protection, multi-farm tenancy with role-based access, and an invite system for farm membership. No credentials or passwords stored.

---

## 1. Authentication Flow

**Approach:** Custom Google OAuth + Turnstile (no Cloudflare Access dependency).

**Login flow:**
1. User lands on `/login` (public page)
2. Turnstile widget validates they're human
3. User clicks "Sign in with Google" - redirects to Google OAuth consent screen
4. Google redirects to `/api/auth/callback/google` with authorization code
5. Worker exchanges code for Google tokens server-side, extracts `email`, `name`, `googleId`
6. Worker looks up user by `googleId` in `users` table
7. **Existing user:** Issues JWT cookie, redirects to `/dashboard`
8. **New user:** Creates user record, redirects to `/onboarding`

**Session management:** Stateless JWT in HttpOnly cookie.
- `HttpOnly`, `Secure`, `SameSite=Lax`
- 7-day expiry
- Payload: `{ sub: userId, email, activeFarmId, role, exp }`
- New JWT issued when switching farms
- No session table needed

---

## 2. Database Schema

### New Tables

```sql
-- Users (no passwords, just Google identity)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Farms (tenancy unit)
CREATE TABLE farms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Farm memberships with roles and expiry
CREATE TABLE farm_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'owner' | 'manager' | 'worker' | 'viewer'
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT, -- null = permanent
  removed_at TEXT, -- null = active, set on manual removal
  UNIQUE(farm_id, user_id)
);

-- Farm invite links
CREATE TABLE farm_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL, -- random 8-char code
  role TEXT NOT NULL,
  max_uses INTEGER, -- null = unlimited
  used_count INTEGER DEFAULT 0,
  access_duration INTEGER, -- null = permanent, otherwise days of access
  expires_at TEXT, -- null = never (link expiry)
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Existing Tables Modified

All farm-scoped tables gain `farm_id INTEGER NOT NULL REFERENCES farms(id)`:
- `cattle`
- `calving_events`
- `service_events`
- `sale_events`
- `health_events`
- `fields`
- `field_assignments`

**Migration strategy:** Starting fresh (no data migration).

---

## 3. Roles & Permissions

| Action | Owner | Manager | Worker | Viewer |
|--------|-------|---------|--------|--------|
| View all data | Y | Y | Y | Y |
| Log health events, move cattle | Y | Y | Y | N |
| CRUD cattle, fields, breeding, sales | Y | Y | N | N |
| Create invites | Y | Y | N | N |
| Manage members & roles | Y | N | N | N |
| Farm settings, delete farm | Y | N | N | N |

### Membership Expiry & Removal

- **Timed access:** Invites carry an optional `accessDuration` (days). On accept, `farm_members.expires_at = joined_at + accessDuration`.
- **Manual removal:** Owner sets `removed_at` on the member (soft delete for audit trail).
- **Auth middleware checks:** On every request, verify membership is not expired and not removed. Expired/removed users see a message and are redirected.
- **Owners can edit expiry** on any member at any time (extend, shorten, or make permanent).

---

## 4. API Routes

### Auth Routes (public)
```
GET  /api/auth/login              -- Validates Turnstile, returns Google OAuth URL
GET  /api/auth/callback/google    -- Exchanges code, sets JWT cookie
POST /api/auth/logout             -- Clears JWT cookie
GET  /api/auth/me                 -- Returns current user + farm memberships
```

### Farm Routes (JWT required)
```
POST   /api/farms                         -- Create farm (user becomes Owner)
GET    /api/farms                         -- List user's farms
PUT    /api/farms/:id                     -- Update farm (Owner)
DELETE /api/farms/:id                     -- Delete farm (Owner)
POST   /api/farms/:id/switch              -- Switch active farm (new JWT)

GET    /api/farms/:id/members             -- List members (Manager+)
PUT    /api/farms/:id/members/:userId     -- Update role/expiry (Owner)
DELETE /api/farms/:id/members/:userId     -- Remove member (Owner)

POST   /api/farms/:id/invites             -- Create invite (Owner/Manager)
GET    /api/farms/:id/invites             -- List invites (Owner/Manager)
DELETE /api/farms/:id/invites/:inviteId   -- Revoke invite (Owner/Manager)
```

### Invite Routes (mixed auth)
```
GET  /api/invite/:code          -- Public: get invite details (farm name, role)
POST /api/invite/:code/accept   -- JWT required: accept invite, join farm
```

### Middleware Stack
1. **Auth middleware** (all `/api/*` except `/api/auth/*` and `GET /api/invite/:code`): Read JWT cookie, verify signature & expiry, attach userId/farmId/role to Hono context. Check membership not expired/removed.
2. **Farm scoping middleware**: Inject `farmId` for all data queries.
3. **Role helper**: `requireRole('manager')` returns 403 if insufficient.

---

## 5. Frontend Architecture

### New Pages
```
/login              -- Turnstile + "Sign in with Google"
/onboarding         -- "Create a Farm" or "Join a Farm" (enter code)
/join/:code         -- Public invite landing page
/settings/profile   -- User info (read-only from Google)
/settings/farm      -- Farm name, members, invites (Owner/Manager)
```

### Auth Context
React context provider (`AuthProvider`) wraps the app:
- Calls `GET /api/auth/me` on mount
- Provides: `user`, `activeFarm`, `role`, `isLoading`, `switchFarm()`
- `(auth)` layout redirects to `/login` if no user, `/onboarding` if no farms

### Farm Switcher
Dropdown in sidebar showing all user's farms with role badge. Calls `POST /api/farms/:id/switch` on selection.

### API Client Changes
- Add `credentials: 'include'` to all fetch calls (cookie auth)
- On 401 response, redirect to `/login`
- No manual auth headers needed

### Role-Based UI
Components check `role` from auth context to show/hide actions (delete buttons, settings links, etc.).

---

## 6. Onboarding & Invite Flow

### First-Time User
After Google login, lands on `/onboarding`:
1. **Create a Farm:** Form with farm name. `POST /api/farms` creates farm + owner membership. New JWT issued, redirect to `/dashboard`.
2. **Join a Farm:** Paste invite URL or code. Preview shows farm name + role. Confirm to join.

### Invite Link Flow
Visiting `/join/ABC123`:
- **Logged out:** See farm name, role, "Sign in with Google to join" button. After auth, invite auto-accepted.
- **Logged in:** Confirmation screen, click to accept. Farm appears in switcher.

### Invite Management (Owner/Manager)
On `/settings/farm`:
- Create invite: select role, optional max uses, optional expiry, optional access duration
- Table of active invites: code, role, uses remaining, expiry, copy-link button
- Revoke button to deactivate

### Invite Validation
On accept: invite exists, not expired, uses remaining > 0, user not already a member. `used_count` incremented atomically.

---

## 7. Security

### Stored Data (minimal)
- `googleId` - identity linkage (opaque string)
- `email`, `name`, `avatarUrl` - display only, from Google profile

### Never Stored
- Passwords
- Google OAuth tokens (used once in callback, discarded)
- Session tokens in database (stateless JWT)

### Security Layers
- **Turnstile** on login page prevents automated attacks
- **Google OAuth** handles credential verification
- **JWT signing secret** as Wrangler secret, never in code
- **HttpOnly + Secure + SameSite=Lax** cookies prevent XSS/CSRF
- **Farm-scoped queries** prevent cross-farm data access
- **Role checks per route** enforce permissions server-side
- **Membership expiry/removal checks** in middleware on every request

### Environment Secrets (Wrangler)
```
JWT_SECRET           -- random 256-bit key
GOOGLE_CLIENT_ID     -- from Google Cloud Console
GOOGLE_CLIENT_SECRET -- from Google Cloud Console
TURNSTILE_SECRET_KEY -- from Cloudflare dashboard
```

### Frontend Environment Variables
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID
NEXT_PUBLIC_TURNSTILE_SITE_KEY
```

### CORS
Existing config (allows `cattle-management.pages.dev` + `localhost`) with `credentials: true` already set.
