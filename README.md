# Crownfall Chess

A real-time multiplayer chess web application with a multi-page architecture, server-authoritative clocks, and a live side evaluation bar during gameplay.

## Pages Included
- `/` — **Home**: Overview and quick navigation
- `/lobby` — **Match Lobby**: Create a private room (time control, side, live eval bar toggle) or join via 6-character room code
- `/game/:roomId` — **Live Match Arena**: Interactive SVG board, live side evaluation bar (Web Worker), server-synced clocks, captured pieces, move history inspection, draw/resign/rematch, and match chat
- `/analysis` — **Analysis & Bot**: Review finished games, test FEN positions, or play against the built-in AI bot (Depth 1–3)
- `/rules` — **Rules & Guide**: Quick reference for rules, live eval bar, and multi-device play

---

## Run Locally (Same Wi-Fi or Testing)

1. Install [Node.js](https://nodejs.org/) (v18 or newer).
2. Unzip `crownfall-chess.zip` and open a terminal inside the folder:
   ```bash
   npm install
   npm test
   npm start
   ```
3. Open `http://localhost:3000` in your browser.
4. To play with someone on the **same Wi-Fi**, find your computer's local IP (e.g., `192.168.1.42`) and have them open `http://192.168.1.42:3000`.

---

## Deploy Free Online (Play From Anywhere on Different Devices)

### Option A: Render (Recommended)
1. Push this folder to a free GitHub repository (or upload it to GitHub).
2. Go to [Render](https://render.com/) and create a **New Web Service** connected to your repo.
3. Set:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Click **Deploy Web Service**. Render will give you a live `https://...onrender.com` URL.
5. Open `/lobby`, create a room, and send the invite link to your friend!

### Option B: Replit
1. Go to [Replit](https://replit.com/) and create a new **Node.js** Repl.
2. Upload the unzipped project files.
3. Click **Run** — Replit automatically runs `npm install` and `npm start` and gives you a live public URL to share.

---

## Enabling Google Sign-In (Optional)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth 2.0 Client ID** (Web application).
2. Add your Authorized Redirect URI:
   - Local: `http://localhost:3000/auth/google/callback`
   - Render: `https://<your-app>.onrender.com/auth/google/callback`
3. Set these environment variables on Render / Replit:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `BASE_URL` (e.g. `https://<your-app>.onrender.com`)
