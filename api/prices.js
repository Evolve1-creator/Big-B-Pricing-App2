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

function parseProductForm(title='', descriptionText='', extraText='') {
  const text = `${title} ${descriptionText} ${extraText}`.toLowerCase().replace(/\s+/g,' ').trim();
  const checks = [
    ["IQF / Frozen", /\biqf\b/],
    ["Frozen", /\bfrozen\b|\bfreezer\b/],
    ["Fresh", /\bfresh\b/],
    ["Refrigerated", /\brefrigerated\b|\bkeep refrigerated\b|\bchilled\b/],
    ["Canned", /\bcanned\b|\bin a can\b/],
    ["Dried", /\bdried\b|\bdry\b/],
    ["Dehydrated", /\bdehydrated\b/],
    ["Shelf-stable", /\bshelf[- ]?stable\b/],
    ["Ready-to-cook", /\bready[- ]?to[- ]?cook\b/],
    ["Fully cooked", /\bfully cooked\b|\bprecooked\b|\bpre-cooked\b/],
    ["Raw", /\braw\b|\buncooked\b/],
    ["Smoked", /\bsmoked\b/]
  ];
  const found = [];
  for (const [label, pattern] of checks) {
    if (pattern.test(text) && !found.includes(label)) found.push(label);
  }
  return found.length ? found.join(" / ") : "Not stated";
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


function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function findProductJsonLd(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const found = findProductJsonLd(x);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;

  const type = node["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return node;

  if (node["@graph"]) {
    const found = findProductJsonLd(node["@graph"]);
    if (found) return found;
  }
  return null;
}

function metaContent(html, keys) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const a = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"));
    if (a) return stripHtml(a[1]);
    const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i"));
    if (b) return stripHtml(b[1]);
  }
  return "";
}

async function fetchProductPageDetails(url) {
  if (!url || !/^https?:\/\//i.test(url)) return { fetched: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BigBsPricingBot/1.0; +https://vercel.app)",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) {
      return { fetched: false, fetchStatus: response.status };
    }

    const html = await response.text();
    const details = {
      fetched: true,
      finalUrl: response.url || url,
      description: "",
      sku: "",
      gtin: "",
      brand: "",
      pageTitle: "",
      rawProductText: ""
    };

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) details.pageTitle = stripHtml(titleMatch[1]);

    // Prefer structured Product JSON-LD where retailers expose it.
    const ldScripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of ldScripts) {
      try {
        const parsed = JSON.parse(match[1].trim());
        const product = findProductJsonLd(parsed);
        if (product) {
          details.description = stripHtml(product.description || "");
          details.sku = String(product.sku || "");
          details.gtin = String(product.gtin13 || product.gtin12 || product.gtin14 || product.gtin || "");
          const brand = product.brand;
          details.brand = typeof brand === "string" ? brand : String(brand?.name || "");
          const extraPieces = [
            product.name,
            product.description,
            product.size,
            product.weight,
            product.model,
            product.category,
            product.additionalProperty && JSON.stringify(product.additionalProperty)
          ].filter(Boolean);
          details.rawProductText = stripHtml(extraPieces.join(" "));
          break;
        }
      } catch {}
    }

    // Fall back to common meta descriptions.
    if (!details.description) {
      details.description = metaContent(html, ["description", "og:description", "twitter:description"]);
    }

    if (!details.rawProductText) {
      details.rawProductText = stripHtml([
        details.pageTitle,
        details.description,
        metaContent(html, ["product:price:amount", "product:availability"])
      ].filter(Boolean).join(" "));
    } else {
      details.rawProductText = stripHtml(
        `${details.rawProductText} ${details.pageTitle} ${details.description}`
      );
    }

    return details;
  } catch (error) {
    return {
      fetched: false,
      fetchError: error?.name === "AbortError" ? "Timed out" : (error?.message || String(error))
    };
  } finally {
    clearTimeout(timeout);
  }
}

function searchRelevanceScore(searchIngredient, result) {
  const q = String(searchIngredient || "").toLowerCase();
  const text = `${result.title || ""} ${result.description || ""} ${result.rawProductText || ""}`.toLowerCase();
  let score = 0;

  const words = q.split(/\s+/).filter(w => w.length > 2);
  for (const w of words) {
    if (text.includes(w)) score += 4;
  }

  // Obvious mismatches we do not want when looking for raw catering ingredients.
  if (/\bjerky\b/.test(text) && !/\bjerky\b/.test(q)) score -= 20;
  if (/\bdog food\b|\bpet food\b|\btreats?\b/.test(text)) score -= 30;

  return score;
}


function normalizeUnit(u) {
  const s=String(u||'').toLowerCase().replace(/\./g,'').trim();
  if(['lb','lbs','pound','pounds'].includes(s)) return 'lb';
  if(['oz','ounce','ounces'].includes(s)) return 'oz';
  if(['each','ea','unit','piece','pieces','pc','pcs','count','ct','roll','rolls','bun','buns','bottle','bottles','link','links'].includes(s)) return 'each';
  if(['gal','gallon','gallons'].includes(s)) return 'gal';
  if(['qt','quart','quarts'].includes(s)) return 'qt';
  return s;
}
function convertQty(qty, fromUnit, toUnit) {
  qty=Number(qty); fromUnit=normalizeUnit(fromUnit); toUnit=normalizeUnit(toUnit);
  if(!Number.isFinite(qty)) return null;
  if(fromUnit===toUnit) return qty;
  if(fromUnit==='lb' && toUnit==='oz') return qty*16;
  if(fromUnit==='oz' && toUnit==='lb') return qty/16;
  if(fromUnit==='gal' && toUnit==='oz') return qty*128;
  if(fromUnit==='oz' && toUnit==='gal') return qty/128;
  return null;
}
function parseStructuredPackage(title='', priceText='', descriptionText='', extraText='') {
  const titleText=String(title||'').replace(/\s+/g,' ').trim();
  const desc=String(descriptionText||'').replace(/\s+/g,' ').trim();
  const extra=String(extraText||'').replace(/\s+/g,' ').trim();
  const price=String(priceText||'').replace(/\s+/g,' ').trim();
  const blocks=[titleText,desc,extra].filter(Boolean);
  const all=`${blocks.join(' | ')} ${price}`;
  if(/(?:\/\s*lb\b|per\s+(?:lb|pound)\b)/i.test(all)) return {basis:'lb',totalQuantity:1,totalUnit:'lb',count:null,portionQuantity:null,portionUnit:null,confidence:'high',source:'selling unit'};
  if(/(?:\/\s*(?:ea|each)\b|per\s+(?:ea|each)\b)/i.test(all)) return {basis:'each',totalQuantity:1,totalUnit:'each',count:1,portionQuantity:null,portionUnit:null,confidence:'high',source:'selling unit'};
  if(/(?:\/\s*oz\b|per\s+ounce\b)/i.test(all)) return {basis:'oz',totalQuantity:1,totalUnit:'oz',count:null,portionQuantity:null,portionUnit:null,confidence:'high',source:'selling unit'};
  function scan(s){
    if(!s)return null;let m;
    m=s.match(/\b(\d+)\s*(pieces?|pcs|portions?|breasts?|fillets?|links?|patties|rolls?|buns?|bottles?|cans?|bags?)\b[^0-9]{0,24}(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\s*(?:each|ea)?\b/i);
    if(m){const count=Number(m[1]),portion=Number(m[3]),unit=normalizeUnit(m[4]);return {basis:'package',totalQuantity:count*portion,totalUnit:unit,count,portionQuantity:portion,portionUnit:unit,confidence:'high',source:'count x portion'}}
    m=s.match(/\((\d+)\)\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\b/i);
    if(m){const count=Number(m[1]),portion=Number(m[2]),unit=normalizeUnit(m[3]);return {basis:'package',totalQuantity:count*portion,totalUnit:unit,count,portionQuantity:portion,portionUnit:unit,confidence:'high',source:'count x portion'}}
    m=s.match(/\b(\d+)\s*(?:[xX×]|\/)\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\b/i);
    if(m){const count=Number(m[1]),portion=Number(m[2]),unit=normalizeUnit(m[3]);return {basis:'package',totalQuantity:count*portion,totalUnit:unit,count,portionQuantity:portion,portionUnit:unit,confidence:'high',source:'count x portion'}}
    m=s.match(/\b(\d+)\s*[- ]?\s*(?:ct|count|pk|pack|pcs|pieces)\b/i);
    if(m){const count=Number(m[1]);return {basis:'package',totalQuantity:count,totalUnit:'each',count,portionQuantity:null,portionUnit:null,confidence:'high',source:'count'}}
    m=s.match(/\b(?:pack|case|box|bag)\s+of\s+(\d+)\b/i);
    if(m){const count=Number(m[1]);return {basis:'package',totalQuantity:count,totalUnit:'each',count,portionQuantity:null,portionUnit:null,confidence:'medium',source:'count'}}
    m=s.match(/\b(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?|gal|gallons?)\s+(case|bag|box|pack|package|pail|tub|container)\b/i);
    if(m)return {basis:'package',totalQuantity:Number(m[1]),totalUnit:normalizeUnit(m[2]),count:null,portionQuantity:null,portionUnit:null,confidence:'high',source:'package weight'};
    m=s.match(/\b(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?|gal|gallons?)\b/i);
    if(m){const unit=normalizeUnit(m[2]);const around=(s.slice(Math.max(0,m.index-28),m.index)+s.slice(m.index+m[0].length,m.index+m[0].length+28)).toLowerCase();if(/\b(portions?|breasts?|fillets?|pieces?|links?|patties)\b/.test(around)&&unit==='oz')return {basis:'unknown',totalQuantity:null,totalUnit:null,count:null,portionQuantity:Number(m[1]),portionUnit:unit,confidence:'low',source:'portion size only'};return {basis:'package',totalQuantity:Number(m[1]),totalUnit:unit,count:null,portionQuantity:null,portionUnit:null,confidence:'medium',source:'stated weight'}}
    return null;
  }
  for(const block of blocks){const hit=scan(block);if(hit)return hit}
  return {basis:'unknown',totalQuantity:null,totalUnit:null,count:null,portionQuantity:null,portionUnit:null,confidence:'none',source:'not determined'};
}
function buildCostNormalization(price,title,priceText,description,extra){
  price=Number(price);const pkg=parseStructuredPackage(title,priceText,description,extra);
  if(!Number.isFinite(price)||price<0)return {...pkg,unitCost:null,unitCostUnit:null,costingReady:false,costingReason:'No usable price'};
  if(pkg.basis==='lb')return {...pkg,unitCost:price,unitCostUnit:'lb',costingReady:true,costingReason:''};
  if(pkg.basis==='oz')return {...pkg,unitCost:price,unitCostUnit:'oz',costingReady:true,costingReason:''};
  if(pkg.basis==='each')return {...pkg,unitCost:price,unitCostUnit:'each',costingReady:true,costingReason:''};
  if(pkg.basis==='package'&&Number(pkg.totalQuantity)>0&&pkg.totalUnit)return {...pkg,unitCost:price/Number(pkg.totalQuantity),unitCostUnit:normalizeUnit(pkg.totalUnit),costingReady:true,costingReason:''};
  return {...pkg,unitCost:null,unitCostUnit:null,costingReady:false,costingReason:pkg.portionQuantity?'Portion size found, but total package quantity is unknown':'Package quantity / selling unit could not be established'};
}
function calculatePerPersonFromNormalized(normalized,item){
  if(!normalized?.costingReady)return {ready:false,reason:normalized?.costingReason||'Price is not normalized'};
  const servingQty=Number(item?.servingQty),servingUnit=normalizeUnit(item?.servingUnit);
  if(!(servingQty>0)||!servingUnit)return {ready:false,reason:'Big B quantity per person is missing'};
  const isMeat=String(item?.category||'')==='Meats';
  const yieldPct=isMeat?Math.min(100,Math.max(1,Number(item?.cookedYieldPct)||100)):100;
  const purchaseServingQty=isMeat?servingQty/(yieldPct/100):servingQty;
  const purchaseQtyInCostUnit=convertQty(purchaseServingQty,servingUnit,normalized.unitCostUnit);
  if(purchaseQtyInCostUnit==null)return {ready:false,reason:`Serving unit ${servingUnit} cannot be converted to price unit ${normalized.unitCostUnit}`};
  return {ready:true,perPersonCost:purchaseQtyInCostUnit*Number(normalized.unitCost),purchaseQtyPerPerson:purchaseQtyInCostUnit,purchaseUnit:normalized.unitCostUnit,servingQty,servingUnit,yieldPct};
}

async function searchShopping(query, location, preferredStores, searchIngredient) {
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

  // First keep only approved stores and priced results.
  const base = shopping
    .filter((r) => storeAllowed(r.source))
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
      shoppingSnippet: r.snippet || r.description || ""
    }))
    .filter((r) => r.price != null)
    .slice(0, 12);

  // Second stage: fetch the actual retailer product page so package information
  // in the retailer description/structured data is available to the parser.
  const enriched = await Promise.all(base.map(async (r) => {
    const page = await fetchProductPageDetails(r.link);
    const description = page.description || r.shoppingSnippet || "";
    const rawProductText = page.rawProductText || description || "";
    const packageDescription = parsePackage(
      r.title,
      r.priceText,
      `${description} ${rawProductText}`,
      r.delivery || ""
    );
    const productForm = parseProductForm(
      r.title,
      `${description} ${rawProductText}`,
      r.delivery || ""
    );
    const normalizedCost = buildCostNormalization(r.price,r.title,r.priceText,`${description} ${rawProductText}`,r.delivery || "");

    return {
      ...r,
      description,
      rawProductText,
      pageDetailsFetched: !!page.fetched,
      pageFetchStatus: page.fetchStatus || "",
      pageFetchError: page.fetchError || "",
      finalUrl: page.finalUrl || r.link || "",
      sku: page.sku || "",
      gtin: page.gtin || "",
      brand: page.brand || "",
      packageDescription,
      productForm,
      ...normalizedCost
    };
  }));

  return enriched
    .map((r) => ({
      ...r,
      relevanceScore: searchRelevanceScore(searchIngredient, r),
      score: scoreResult(
        {
          ...r,
          source: r.store,
          snippet: r.description,
          description: r.description
        },
        preferredStores
      ) + searchRelevanceScore(searchIngredient, r)
    }))
    .filter((r) => r.relevanceScore >= 0)
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
    searchIngredient: String(item.searchIngredient || item.name || "").trim(),
    servingQty: Number(item.servingQty) || 0,
    servingUnit: String(item.servingUnit || ""),
    cookedYieldPct: Number(item.cookedYieldPct) || 100,
    category: String(item.category || "")
  }));

  const results = await runLimited(cleaned, async (item) => {
    const query = `${item.searchIngredient} bulk food service package`;
    const matches = await searchShopping(query, location, preferredStores, item.searchIngredient);
    const withPerPerson = matches.map((r) => ({...r, perPerson: calculatePerPersonFromNormalized(r, item)}));
    return {
      id: item.id, name: item.name, searchIngredient: item.searchIngredient,
      servingQty: item.servingQty, servingUnit: item.servingUnit, cookedYieldPct: item.cookedYieldPct, category: item.category,
      ok: true, results: withPerPerson
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
