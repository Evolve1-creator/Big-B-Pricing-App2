const SERPER_URL = "https://google.serper.dev/shopping";
const DEFAULT_LOCATION = "South Carolina, United States";
const MAX_ITEMS = 50;
const MAX_RESULTS_PER_ITEM = 8;

const ALLOWED_STORES = [
  "walmart",
  "chef'store",
  "chef store",
  "us foods chef'store",
  "costco",
  "food lion",
  "foodlion",
  "webstaurantstore"
];

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

function storeAllowed(source) {
  const s = String(source || "").toLowerCase().replace(/\s+/g, " ").trim();
  return ALLOWED_STORES.some((allowed) => s.includes(allowed));
}

function parsePackage(title, priceText='', descriptionText='', extraText='') {
  const titleText = String(title || "").replace(/\s+/g, " ").trim();
  const description = String(descriptionText || "").replace(/\s+/g, " ").trim();
  const extra = String(extraText || "").replace(/\s+/g, " ").trim();
  const p = String(priceText || "").replace(/\s+/g, " ").trim();

  const normUnit = (u) => {
    u = String(u || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
    if (["lb","lbs","pound","pounds"].includes(u)) return "lb";
    if (["oz","ounce","ounces"].includes(u)) return "oz";
    if (["fl oz","fluid ounce","fluid ounces"].includes(u)) return "fl oz";
    if (["gal","gallon","gallons"].includes(u)) return "gal";
    if (["qt","quart","quarts"].includes(u)) return "qt";
    return u;
  };

  function parseOne(s) {
    if (!s) return null;

    const formMatch = s.match(/\b(breasts?|fillets?|portions?|links?|patties|racks?|rolls?|buns?|bottles?|cans?|bags?|trays?|cases?|packs?|pieces?|pcs)\b/i);
    const form = formMatch ? formMatch[0].toLowerCase() : "";

    // "40 pieces, 4 oz each"
    let m = s.match(/\b(\d+)\s*(pieces?|pcs|portions?|breasts?|fillets?|links?|patties|rolls?|buns?|bottles?|cans?|bags?)\b[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|lbs?|pounds?|oz|ounces?)\s*(?:each|ea)?\b/i);
    if (m) return `${m[1]} x ${m[3]} ${normUnit(m[4])} ${m[2].toLowerCase()}`;

    // "(16) 6 oz"
    m = s.match(/\((\d+)\)\s*(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|lbs?|pounds?|oz|ounces?|gallons?|gal|quarts?|qt)\b/i);
    if (m) return `${m[1]} x ${m[2]} ${normUnit(m[3])}${form ? " " + form : ""}`;

    // "16 x 6 oz"
    m = s.match(/\b(\d+)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|lbs?|pounds?|oz|ounces?|gallons?|gal|quarts?|qt)\b/i);
    if (m) return `${m[1]} x ${m[2]} ${normUnit(m[3])}${form ? " " + form : ""}`;

    // "4/5 lb" or "4-5 lb"
    m = s.match(/\b(\d+)\s*[-/]\s*(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|lbs?|pounds?|oz|ounces?|gallons?|gal|quarts?|qt)\b/i);
    if (m) return `${m[1]} x ${m[2]} ${normUnit(m[3])}${form ? " " + form : ""}`;

    // "24 ct"
    m = s.match(/\b(\d+)\s*[- ]?\s*(ct|count|pk|pack|pcs|pieces)\b/i);
    if (m) return `${m[1]} count${form && !/pack|pcs|pieces/i.test(form) ? " " + form : ""}`;

    // "case of 12"
    m = s.match(/\b(pack|case|box|bag)\s+of\s+(\d+)\b/i);
    if (m) return `${m[2]} count ${m[1].toLowerCase()}`;

    // "10 lb case", "5 lb bag", "8 oz"
    m = s.match(/\b(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|lbs?|pounds?|oz|ounces?|gallons?|gal|quarts?|qt)\b(?:\s+(case|bag|box|pack))?/i);
    if (m) return `${m[1]} ${normUnit(m[2])}${m[3] ? " " + m[3].toLowerCase() : (form ? " " + form : "")}`;

    return null;
  }

  let parsed = parseOne(titleText);
  if (parsed) return parsed;

  parsed = parseOne(description);
  if (parsed) return parsed;

  parsed = parseOne(extra);
  if (parsed) return parsed;

  const combined = `${titleText} ${description} ${extra} ${p}`.toLowerCase();

  if (/(?:\/\s*lb\b|per\s+(?:lb|pound)\b|each\s+lb\b|\blb\s+price\b)/i.test(combined)) {
    return "Sold by the pound";
  }
  if (/(?:\/\s*(?:ea|each)\b|per\s+(?:ea|each)\b|\beach\b)/i.test(combined)) {
    return "1 each";
  }
  if (/(?:\/\s*oz\b|per\s+ounce\b)/i.test(combined)) {
    return "Sold by the ounce";
  }

  return "Size / selling unit not stated";
}

function scoreResult(result, preferredStores = []) {
  let score = 0;
  const source = String(result.source || "").toLowerCase();
  const title = String(result.title || "").toLowerCase();

  preferredStores.forEach((store, idx) => {
    const s = String(store || "").toLowerCase();
    if (!s) return;
    if (source.includes(s) || title.includes(s)) score += Math.max(30 - idx * 3, 12);
  });

  if (numberFromPrice(result.price) != null) score += 10;
  if (result.link) score += 2;
  if (!parsePackage(result.title, result.price, result.snippet || result.description || "", result.delivery || "").startsWith("Size /")) score += 6;
  return score;
}

async function searchShopping(query, location, preferredStores) {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY is not configured in Vercel.");

  const response = await fetch(SERPER_URL, {
    method: "POST",
    headers: {"X-API-KEY": key, "Content-Type": "application/json"},
    body: JSON.stringify({
      q: query,
      gl: "us",
      hl: "en",
      location: location || DEFAULT_LOCATION,
      num: 20
    })
  });

  const bodyText = await response.text();
  let data;
  try { data = JSON.parse(bodyText); } catch { data = { raw: bodyText }; }

  if (!response.ok) {
    const msg = data?.message || data?.error || `Serper returned HTTP ${response.status}`;
    throw new Error(msg);
  }

  const shopping = Array.isArray(data.shopping) ? data.shopping : [];

  return shopping
    .filter((r) => storeAllowed(r.source))
    .map((r) => ({
      title: r.title || "",
      description: r.snippet || r.description || "",
      snippet: r.snippet || r.description || "",
      packageDescription: parsePackage(
        r.title || "",
        r.price || "",
        r.snippet || r.description || "",
        r.delivery || ""
      ),
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
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, runner));
  return results;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST /api/prices" });

  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const location = String(body.location || DEFAULT_LOCATION);
  const preferredStores = Array.isArray(body.preferredStores)
    ? body.preferredStores.map(String)
    : ["Walmart","CHEF'STORE","Costco","Food Lion","WebstaurantStore"];

  if (!items.length) return res.status(400).json({ error: "No items were provided." });
  if (items.length > MAX_ITEMS) return res.status(400).json({ error: `Maximum ${MAX_ITEMS} items per pricing update.` });

  const cleaned = items.map((item) => ({
    id: item.id ?? null,
    name: String(item.name || ""),
    searchIngredient: String(item.searchIngredient || item.name || "").trim()
  }));

  const results = await runLimited(cleaned, async (item) => {
    const query = `${item.searchIngredient} bulk food service package`;
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
    allowedStores: ["Walmart","CHEF'STORE","Costco","Food Lion","WebstaurantStore"],
    results
  });
}
