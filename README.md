# 🧭 TrakMass

**TrakMass** is a smart, offline-first body-mass tracking app built with **Expo + React Native (TypeScript)**.
It helps users record and visualize their weight (mass) over time—daily, weekly, fortnightly, or monthly—and provides **smart analytics**, **intuitive charts**, and **AI-style insights** to reveal progress trends and stability patterns.

---

## 📱 Overview

TrakMass makes personal progress tracking simple yet data-rich.
Users can log their mass, visualize change over time, and receive intelligent feedback—without ever needing spreadsheets or fitness integrations.

Key principles:

* **Simplicity** — log, view, understand
* **Insight** — smart statistics over raw data
* **Privacy** — offline-first with optional sync
* **Flexibility** — multiple cadences, multiple profiles

---

## ✨ Features

### 🧩 Core

* Quick “Add Mass” input (kg/lb)
* Flexible cadence (daily / weekly / fortnightly / monthly)
* Editable & back-dated entries
* Optional notes + tags per entry
* Multi-profile support (self, clients, devices)
* Smart reminders aligned with cadence
* Settings toggle auto-sync, reminders, and manual sync controls
* Unified shell with header + sidebar navigation (no auth, data local)
* Insights tab now derives live stats (trend, volatility, 7-day avg) from the offline log
* Settings page outlines the open-mode experience and sync control guidance

### 📊 Dashboard

* Live KPI cards:

  * **Current Mass**
  * **7-day / 30-day average**
  * **Trend rate (kg/week)**
  * **Volatility (std dev)**
  * **Adherence %**
  * **Goal progress**
* Interactive charts:

  * Line chart with moving averages
  * Histogram + distribution overview
  * Week-over-week delta bars
  * Calendar heatmap for adherence

### 🤖 Smart Intelligence Cards

TrakMass automatically generates contextual insights:

* “You’re trending **−0.32 kg/week** over the last 28 days.”
* “Two high outliers detected on Nov 2 & Nov 9 — tagged ‘cheat day’.”
* “Projected to reach your goal in **5–7 weeks (80 % CI)**.”
* “Variance dropped 18 % vs last month — more stable readings.”

### 🛎 Notifications

* Smart reminders based on cadence
* Missed-log follow-ups
* Streak notifications & milestones

### 🔐 Privacy & Data

* Offline-first using SQLite (Expo SQLite / WatermelonDB)
* Optional cloud sync via Supabase or FastAPI
* Biometric lock (Face/Touch)
* CSV / JSON export + import
* Local-only mode for full privacy

---

## 🧠 Analytics Engine

| Metric              | Formula / Logic                     | Insight           |
| ------------------- | ----------------------------------- | ----------------- |
| **Trend Rate**      | Linear regression slope (kg / week) | Overall direction |
| **Volatility**      | Standard deviation (σ)              | Consistency       |
| **Outliers**        | |z| ≥ 2                             | Unusual entries   |
| **Adherence**       | actual / expected logs              | Discipline        |
| **Projection ETA**  | (current – target)/slope            | Goal forecast     |
| **Moving Averages** | 7 / 30-day windows                  | Smoothing         |

---

## 🏗 Architecture

### Tech Stack

* **Expo SDK 51+**
* **React Native (0.76+)**
* **TypeScript**
* **React Navigation v6**
* **Zustand** (state)
* **React Hook Form + Zod** (validation)
* **react-native-svg-charts / victory-native** (graphs)
* **Expo SQLite** (persistence)
* **expo-network** + custom queue (sync detection)
* **expo-notifications** (reminders)
* **Restyle / React Native Paper** (UI kit)
* **Supabase / FastAPI** (optional backend sync)

### Backend sync API

* A lightweight FastAPI service lives in `backend/` and implements `/v1/mass` for create/patch/delete sync mutations.
* Run it locally via `python -m uvicorn app.main:app --reload` or `docker compose up --build` to satisfy `EXPO_PUBLIC_SYNC_ENDPOINT`.
* The API keeps an in-memory store so you can test sync end-to-end; see `backend/README.md` for details.
 * Auth0 JWT validation is enabled via `AUTH0_DOMAIN` and `AUTH0_AUDIENCE`. Tokens issued by that tenant must be sent as `Authorization: Bearer <token>` when calling the sync endpoints.

### Offline Architecture

1. **Local SQLite store** — `app/services/storage.ts` boots the schema (`mass_entries`, `sync_queue`) and writes every mutation on-device before any network call.
2. **Sync queue** — `app/services/sync.ts` batches pending mutations, retries, and updates entry statuses once the API confirms receipt.
3. **Background watcher** — `hooks/use-offline-sync.ts` listens for connectivity (via `expo-network`) and runs periodic flushes so pending work clears automatically when the device reconnects.
4. **State store** — `app/store/useMassStore.ts` hydrates UI state straight from SQLite so screens continue to work offline; the store also enqueues writes for later sync.

Set `EXPO_PUBLIC_SYNC_ENDPOINT` to point at your FastAPI/Supabase instance when you want the queue to push data. Leaving it undefined keeps TrakMass fully local/offline.
On the web build, the same API surface is backed by `localStorage` to avoid the current SharedArrayBuffer restrictions—data remains device-local but does not share the SQLite file with native clients.

### Analytics Stack

* `app/services/analytics.ts` centralizes trend, volatility, goal projection, and outlier detection logic powering the Insights feed.
* `components/ui/sparkline.tsx` renders compact bar sparklines from the most recent entries without pulling in heavy SVG/chart libraries.
* The Insights tab now combines the sparkline + KPI tiles with narrative cards (momentum, consistency, projection) derived from the analytics helper.

### Layout & Navigation

* `components/layout/AppShell.tsx` renders a responsive header + sidebar (desktop) or drawer (mobile) so navigation feels consistent across platforms.
* Header surfaces the current page title, offline state, and a quick profile summary; tapping it opens the profile editor.
* Sidebar items route between Dashboard, Profile, and upcoming Insights without relying on auth—everything is open mode.
* Profile data is stored locally via the same persistence layer (`app/store/useProfileStore.ts`), so users can capture preferences/goals without signing in.
* Settings (`app/(tabs)/settings.tsx`) expose toggles for auto-sync/reminders, reminder hour input, and a manual “Sync Now” action; these preferences persist via the same offline storage.
* Reminder scheduling uses `expo-notifications` (`app/services/reminders.ts`) and re-schedules automatically when you change the hour or toggle reminders off/on.

### Directory Structure

```
/trakmass
  ├─ app/
  │   ├─ (tabs)/
  │   │   ├─ _layout.tsx
  │   │   ├─ index.tsx           # dashboard
  │   │   ├─ insights.tsx        # coming-soon analytics hub
  │   │   └─ profile.tsx         # open profile editor
  │   ├─ services/
  │   │   ├─ database.ts
  │   │   ├─ storage.ts
  │   │   └─ sync.ts
  │   ├─ store/
  │   │   ├─ useMassStore.ts
  │   │   └─ useProfileStore.ts
  │   ├─ types/
  │   │   ├─ mass.ts
  │   │   └─ profile.ts
  │   ├─ _layout.tsx
  │   └─ modal.tsx
  ├─ hooks/
  │   ├─ use-color-scheme(.ts/.web.ts)
  │   ├─ use-theme-color.ts
  │   └─ use-offline-sync.ts
  ├─ components/
  │   └─ layout/
  │       └─ AppShell.tsx
  ├─ constants/
  ├─ assets/
  ├─ scripts/
  ├─ package.json
  └─ README.md
```

---

## 🚀 Getting Started

### 1️⃣ Prerequisites

* Node 18 +
* Expo CLI (`npm i -g expo-cli`)
* Android Studio / Xcode for emulators

### 2️⃣ Install

```bash
git clone https://github.com/simlexx-k/trakmass.git
cd trakmass
npm install
```

### 3️⃣ Run Development Server

```bash
npx expo start
```

Scan the QR code with the Expo Go app (Android/iOS) or press `a` / `i` to launch an emulator.

### 4️⃣ Build

```bash
npx expo run:android
# or
npx expo run:ios
```

---

## ⚙ Configuration

| Setting                    | Purpose                                | Location               |
| -------------------------- | -------------------------------------- | ---------------------- |
| `EXPO_PUBLIC_SYNC_ENDPOINT`| Optional cloud API base URL            | `.env` → `process.env` |
| `offlineSyncInterval`      | Poll interval (ms) for queue flushing  | `hooks/use-offline-sync.ts` |
| Local DB schema            | Customize columns / extra tables       | `app/services/storage.ts` |
| Theme tokens               | Update light/dark palettes             | `constants/theme.ts`   |

Add your `.env` file (for Supabase/FastAPI sync):

```bash
EXPO_PUBLIC_SYNC_ENDPOINT=https://api.trakmass.app
SUPABASE_URL=https://trakmass-central.supabase.co
SUPABASE_KEY=public-anon-key
```

---

## ☁️ Optional Cloud Sync

When `EXPO_PUBLIC_SYNC_ENDPOINT` is set, every local mutation is enqueued in `app/services/sync.ts` and replayed against your API once connectivity returns. Implement the following handlers on your backend (Supabase edge function, FastAPI route, etc.):

```http
POST /v1/mass
Content-Type: application/json

{
  "id": "clrk1...",
  "profileId": "default",
  "mass": 70.4,
  "unit": "kg",
  "note": "Leg day",
  "loggedAt": "2025-01-04T07:12:11.168Z"
}
```

Return a `2xx` response to mark the row as synced; anything else leaves the item in the queue for retry with exponential backoff. To disable sync entirely, remove the env var—the UI keeps working offline thanks to the SQLite store + Zustand state.

---

## 🧩 API (Sync Layer Optional)

| Method                              | Endpoint      | Description |
| ----------------------------------- | ------------- | ----------- |
| `POST /v1/mass`                     | Upload entry  |             |
| `GET /v1/mass?profileId=&from=&to=` | Fetch entries |             |
| `PATCH /v1/mass/:id`                | Update entry  |             |
| `GET /v1/insights?profileId=`       | Pull insights |             |
| `POST /v1/import`                   | Bulk import   |             |
| `GET /v1/export?profileId=`         | Download CSV  |             |

---

## 🧪 Testing

* **Unit:** analytics (math, regression, volatility)
* **Component:** cards & charts rendering
* **E2E:** profile creation → logging → insight generation → export

Run tests:

```bash
npm run test
```

---

## 🔮 Roadmap

| Version        | Highlights                                                                |
| -------------- | ------------------------------------------------------------------------- |
| **v1.0 (MVP)** | Profiles, logging, dashboard KPIs, trend chart, basic insights            |
| **v1.1**       | Outliers + distribution charts, goal ETA, reminders                       |
| **v1.2**       | Multi-profile, biometric lock, widgets                                    |
| **v2.0**       | Device/Bluetooth scale integration, web dashboard, predictive forecasting |

---

## 🎨 UI/UX Design

* Minimal, card-based dashboard
* Smooth micro-animations (Framer Motion)
* Adaptive light/dark themes
* Accessible typography + VoiceOver labels

---

## 🔐 Privacy Statement

TrakMass stores your data locally and never shares it unless you export or sync.
All exports are user-initiated; no analytics SDKs or ads are included.

---

## 💡 Future Intelligence

* AI-powered **trend summarization** (“This month your variance dropped 15 %, signaling consistency.”)
* **Goal adherence heatmaps**
* **Predictive ETA bands** using exponential smoothing
* **Mood / context correlation** (e.g., tags → variance)

---

## 🤝 Contributing

Pull requests are welcome!
Please open an issue to discuss major changes first.

```bash
# lint and format
npm run lint
npm run format
```

---

## 🧰 License

MIT © 2025 TrakMass by A3S Labs

---

## 📫 Contact

**Email:** [hello@trakmass.app](mailto:hello@trakmass.app)
**GitHub:** [@yourusername](https://github.com/simlexx-k)
**Twitter:** [@TrakMassApp](https://twitter.com/a3slabs)

---
