const SERPER_URL = "https://google.serper.dev/shopping";
const DEFAULT_LOCATION = "South Carolina, United States";
const MAX_ITEMS = 50;
const MAX_RESULTS_PER_ITEM = 5;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function numberFromPrice(value) {
  if (typeof value === "number") return value;
  const s = String(value || "").replace(/,/g, "");
  const m = s.match(/(?:\$|USD\s*)?(\d+(?:\.\d{1,2})?)/i);
  return m ? Number(m[1]) : null;
}

function normalizeStore(value) {
  return String(value || "").trim();
}

function scoreResult(result, preferredStores = []) {
  let score = 0;
  const source = normalizeStore(result.source).toLowerCase();
  const title = String(result.title || "").toLowerCase();

  preferredStores.forEach((store, idx) => {
    const s = String(store || "").toLowerCase();
    if (!s) return;
    if (source.includes(s) || title.includes(s)) score += Math.max(25 - idx * 2, 10);
  });

  if (numberFromPrice(result.price) != null) score += 10;
  if (result.link) score += 2;
  return score;
}

async function searchShopping(query, location, preferredStores) {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY is not configured in Vercel.");

  const response = await fetch(SERPER_URL, {
    method: "POST",
    headers: {
      "X-API-KEY": key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      q: query,
      gl: "us",
      hl: "en",
      location: location || DEFAULT_LOCATION,
      num: 10
    })
  });

  const bodyText = await response.text();
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    data = { raw: bodyText };
  }

  if (!response.ok) {
    const msg = data?.message || data?.error || `Serper returned HTTP ${response.status}`;
    throw new Error(msg);
  }

  const shopping = Array.isArray(data.shopping) ? data.shopping : [];

  return shopping
    .map((r) => ({
      title: r.title || "",
      store: r.source || "",
      priceText: r.price || "",
      price: numberFromPrice(r.price),
      link: r.link || "",
      delivery: r.delivery || "",
      rating: r.rating ?? null,
      ratingCount: r.ratingCount ?? null,
      position: r.position ?? null,
      score: scoreResult(r, preferredStores)
    }))
    .filter((r) => r.price != null)
    .sort((a, b) => b.score - a.score || a.price - b.price)
    .slice(0, MAX_RESULTS_PER_ITEM);
}

async function runLimited(items, worker, concurrency = 5) {
  const results = new Array(items.length);
  let next = 0;

  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (error) {
        results[i] = {
          id: items[i]?.id ?? null,
          name: items[i]?.name || "",
          searchIngredient: items[i]?.searchIngredient || items[i]?.name || "",
          ok: false,
          error: error?.message || String(error),
          results: []
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runner)
  );
  return results;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST /api/prices" });
  }

  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const location = String(body.location || DEFAULT_LOCATION);
  const preferredStores = Array.isArray(body.preferredStores)
    ? body.preferredStores.map(String)
    : [];

  if (!items.length) {
    return res.status(400).json({ error: "No items were provided." });
  }

  if (items.length > MAX_ITEMS) {
    return res.status(400).json({
      error: `Maximum ${MAX_ITEMS} items per pricing update.`
    });
  }

  const cleaned = items.map((item) => ({
    id: item.id ?? null,
    name: String(item.name || ""),
    searchIngredient: String(
      item.searchIngredient || item.name || ""
    ).trim()
  }));

  const results = await runLimited(cleaned, async (item) => {
    const query = `${item.searchIngredient} grocery food service`;
    const matches = await searchShopping(query, location, preferredStores);

    return {
      id: item.id,
      name: item.name,
      searchIngredient: item.searchIngredient,
      ok: true,
      results: matches
    };
  });

  return res.status(200).json({
    ok: true,
    checkedAt: new Date().toISOString(),
    location,
    itemCount: cleaned.length,
    results
  });
}
