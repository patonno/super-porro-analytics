import express from "express";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const SB_URL = process.env.SUPABASE_URL || "https://ommnhntlgkdirarmdqac.supabase.co";
const SB_KEY = process.env.SUPABASE_KEY || "";

// Cache structure (works in local server; in serverless, cache is per-container and short-lived)
let cachedData: any = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds cache

export const app = express();

// --- Middleware ---
app.use(express.json());

// --- API Routes (registered at top level so they're available when imported as a module) ---

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// League data endpoint (combines porras, resultados_reales, and pagos)
app.get("/api/league-data", async (req, res) => {
  const now = Date.now();
  if (cachedData && now - lastCacheTime < CACHE_TTL_MS) {
    return res.json({ ...cachedData, cached: true });
  }

  try {
    console.log("Fetching live league data from Supabase...");

    // Fetch in parallel to optimize load speed
    const [porrasRes, rrRes, pagosRes, polyRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/porras?select=*`, {
        headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }
      }),
      fetch(`${SB_URL}/rest/v1/resultados_reales?select=*&id=eq.1`, {
        headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }
      }),
      fetch(`${SB_URL}/rest/v1/pagos?select=nombre,pagado`, {
        headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }
      }).catch(() => null),
      fetch("https://gamma-api.polymarket.com/events?closed=false&limit=1000")
        .catch(() => null)
    ]);

    if (!porrasRes.ok || !rrRes.ok) {
      throw new Error(`Failed to fetch from Supabase. Porras: ${porrasRes.status}, RealResults: ${rrRes.status}`);
    }

    const porras = await porrasRes.json();
    const rrList = await rrRes.json();
    const realResults = rrList[0] || null;

    let pagos: any[] = [];
    if (pagosRes && pagosRes.ok) {
      pagos = await pagosRes.json();
    }

    let polymarketOdds: Record<string, number> = {};
    if (polyRes && polyRes.ok) {
      try {
        const events = await polyRes.json();
        const wcEvent = events.find((e: any) => e.title && e.title.toLowerCase().includes("world cup winner"));
        if (wcEvent && wcEvent.markets) {
          for (const market of wcEvent.markets) {
            const team = market.groupItemTitle;
            if (team && market.outcomePrices) {
              const prices = JSON.parse(market.outcomePrices);
              if (prices && prices.length > 0) {
                polymarketOdds[team] = parseFloat(prices[0]);
              }
            }
          }
        }
      } catch (e) {
        console.error("Polymarket parse error", e);
      }
    }

    let pmMatchOdds: Record<string, { teamA: string, teamB: string, priceA: number, priceB: number }> = {};
    try {
      console.log("Fetching Polymarket World Cup page for slugs...");
      const pmPageRes = await fetch("https://polymarket.com/sports/world-cup");
      const pmHtml = await pmPageRes.text();
      const slugs = Array.from(new Set(pmHtml.match(/fifwc-[a-z]{3}-[a-z]{3}-2026-[0-9]{2}-[0-9]{2}/g) || []));
      console.log(`Found ${slugs.length} match slugs`);

      const eventPromises = slugs.map(slug =>
        fetch(`https://gamma-api.polymarket.com/events?slug=${slug}-more-markets`)
          .then(r => r.json())
          .catch(() => null)
      );
      const eventResults = await Promise.all(eventPromises);

      for (const data of eventResults) {
        if (data && data.length > 0) {
          const event = data[0];
          if (event.markets) {
            const advanceMarket = event.markets.find((m: any) => m.groupItemTitle === "Team to Advance" || m.groupItemTitle === "To Advance" || (m.question && m.question.toLowerCase().includes("team to advance")));
            if (advanceMarket && advanceMarket.outcomes && advanceMarket.outcomePrices) {
              const outcomes = JSON.parse(advanceMarket.outcomes);
              const prices = JSON.parse(advanceMarket.outcomePrices);
              if (outcomes.length >= 2 && prices.length >= 2) {
                // Use a standardized key, maybe by team names
                pmMatchOdds[event.slug] = {
                  teamA: outcomes[0],
                  teamB: outcomes[1],
                  priceA: parseFloat(prices[0]),
                  priceB: parseFloat(prices[1]),
                };
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Error fetching polymarket match odds", e);
    }

    cachedData = {
      success: true,
      porras,
      realResults,
      pagos,
      polymarketOdds,
      pmMatchOdds,
      updatedAt: new Date().toISOString()
    };
    lastCacheTime = now;

    res.json({ ...cachedData, cached: false });
  } catch (error: any) {
    console.error("Error fetching league data:", error);
    // Return stale cache if available, otherwise 500
    if (cachedData) {
      return res.json({ ...cachedData, cached: true, stale: true, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scrape endpoint to fetch the HTML of the website
app.get("/api/scrape", async (req, res) => {
  try {
    const targetUrl = req.query.url as string || "https://porramediobanca.pages.dev";
    console.log(`Scraping target URL: ${targetUrl}`);
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    res.json({ success: true, url: targetUrl, length: html.length, html: html });
  } catch (error: any) {
    console.error("Scrape error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Local dev server startup (NOT used on Vercel) ---

async function startServer() {
  const PORT = 3000;

  // Vite middleware for development (dynamic import so it doesn't crash when vite isn't installed)
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only start the local server when NOT running on Vercel
if (!process.env.VERCEL) {
  startServer();
}

export default app;
