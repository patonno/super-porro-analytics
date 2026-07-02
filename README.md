# 🏆 Super Porro BMPS Analytics

Real-time leaderboard analytics, performance tracker, and scenario simulator for the **BMPS World Cup fantasy league**.

This project provides a comprehensive dashboard to track participant rankings, simulate future match outcomes, and compare predictions side-by-side with real-time odds integrated from Polymarket.

---

## ⚡ Key Features

* **📊 Live Leaderboard:** Displays participant rankings, calculated points (based on custom rules), breakdown by phase, and payment status.
* **⚔️ Head-to-Head Rival Comparison:** Compare group stage and knockout predictions side-by-side between any two players (with a focus on tracking the gap with the leader/rival).
* **🔮 Standings & Scenario Simulator:** Run interactive simulations ("Optimal" or "Probable" scenarios) on upcoming matches to see how the leaderboard will shift under different outcomes.
* **📈 Polymarket Odds Integration:** Pulls live prediction market data for overall World Cup winner odds and individual match advancement probabilities.
* **🔥 Match Hotness Indicator:** Highlights "HOT" matches where predictions differ significantly between top contenders, indicating crucial swing matches for the leaderboard.

---

## 🛠️ Tech Stack

* **Frontend:** React 19, Vite, Tailwind CSS, Recharts (data visualization), Motion (smooth animations), Lucide React (icons)
* **Backend:** Express API (TypeScript)
* **Database:** Supabase (PostgreSQL)
* **Deployment:** Pre-configured for seamless serverless deployment on Vercel

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18 or higher recommended)
* A **Supabase** instance populated with the league's schema (`porras`, `resultados_reales`, `pagos`)

### Local Setup

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   Copy the example file to `.env` and fill in your Supabase credentials:
   ```bash
   cp .env.example .env
   ```
   Open the newly created `.env` file and set your keys:
   ```ini
   SUPABASE_URL="https://your-project-id.supabase.co"
   SUPABASE_KEY="your-anon-public-key"
   ```

3. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   This runs the Express API and the Vite frontend concurrently. The app will be available at **[http://localhost:3000](http://localhost:3000)**.

---

## ☁️ Deployment on Vercel

This repository is optimized for Vercel out of the box using Serverless Functions:

1. **Import the project** into the Vercel Dashboard.
2. In the Vercel project settings, configure the following **Environment Variables**:
   * `SUPABASE_URL`
   * `SUPABASE_KEY`
3. Vercel will automatically use the `vercel.json` configuration to:
   * Build the React frontend statically using `npm run vercel-build` (`vite build`).
   * Deploy the Express backend inside Vercel Serverless Functions under `api/index.ts`.
