const SERPER_URL = "https://google.serper.dev/shopping";
const DEFAULT_LOCATION = "South Carolina, United States";
const MAX_ITEMS = 40;
const MAX_RESULTS = 8;

const STORES = [
  {name:"Walmart", hosts:["walmart.com"]},
  {name:"CHEF'STORE", hosts:["chefstore.com"]},
  {name:"Costco", hosts:["costco.com"]},
  {name:"Food Lion", hosts:["foodlion.com"]},
  {name:"WebstaurantStore", hosts:["webstaurantstore.com"]}
];

function cors(res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
}
function cleanText(s){return String(s||"").replace(/\s+/g," ").trim()}
function priceNumber(v){
  if(typeof v==="number") return v;
  const m=String(v||"").replace(/,/g,"").match(/(?:\$|USD\s*)?(\d+(?:\.\d{1,2})?)/i);
  return m?Number(m[1]):null;
}
function canonicalStore(url){
  try{
    const host=new URL(url).hostname.toLowerCase().replace(/^www\./,"");
    for(const s of STORES){
      if(s.hosts.some(h=>host===h||host.endsWith("."+h))) return s.name;
    }
  }catch{}
  return null;
}
function decodeHtml(s){
  return String(s||"")
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function stripHtml(s){return cleanText(decodeHtml(String(s||"").replace(/<[^>]+>/g," ")))}
function findProduct(node){
  if(!node) return null;
  if(Array.isArray(node)){for(const x of node){const f=findProduct(x);if(f)return f} return null}
  if(typeof node!=="object") return null;
  const t=node["@type"];
  if(t==="Product"||(Array.isArray(t)&&t.includes("Product"))) return node;
  if(node["@graph"]) return findProduct(node["@graph"]);
  return null;
}
function metaContent(html,names){
  for(const n of names){
    const e=n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    let m=html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${e}["'][^>]+content=["']([^"']*)["'][^>]*>`,"i"));
    if(m) return stripHtml(m[1]);
    m=html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${e}["'][^>]*>`,"i"));
    if(m) return stripHtml(m[1]);
  }
  return "";
}
async function pageDetails(url){
  if(!url) return {fetched:false};
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),6500);
  try{
    const r=await fetch(url,{
      redirect:"follow",signal:ctl.signal,
      headers:{
        "User-Agent":"Mozilla/5.0 (compatible; BigBsPricing/2.0)",
        "Accept":"text/html,application/xhtml+xml"
      }
    });
    if(!r.ok) return {fetched:false,status:r.status};
    const html=await r.text();
    let description="", raw="", brand="", sku="", gtin="";
    const scripts=[...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for(const sm of scripts){
      try{
        const product=findProduct(JSON.parse(sm[1].trim()));
        if(product){
          description=stripHtml(product.description||"");
          brand=typeof product.brand==="string"?product.brand:String(product.brand?.name||"");
          sku=String(product.sku||"");
          gtin=String(product.gtin13||product.gtin12||product.gtin14||product.gtin||"");
          raw=stripHtml([
            product.name,product.description,product.size,product.weight,
            product.category,product.model,
            product.additionalProperty?JSON.stringify(product.additionalProperty):""
          ].filter(Boolean).join(" "));
          break;
        }
      }catch{}
    }
    if(!description) description=metaContent(html,["description","og:description","twitter:description"]);
    const tm=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle=tm?stripHtml(tm[1]):"";
    raw=stripHtml(`${raw} ${pageTitle} ${description}`);
    return {fetched:true,description,raw,brand,sku,gtin,finalUrl:r.url||url};
  }catch(e){
    return {fetched:false,error:e?.name==="AbortError"?"Timed out":String(e?.message||e)};
  }finally{clearTimeout(timer)}
}

function normUnit(u){
  u=String(u||"").toLowerCase().replace(/\./g,"").trim();
  if(["lb","lbs","pound","pounds"].includes(u)) return "lb";
  if(["oz","ounce","ounces"].includes(u)) return "oz";
  if(["ea","each","count","ct","piece","pieces","pcs"].includes(u)) return "each";
  if(["gal","gallon","gallons"].includes(u)) return "gal";
  if(["qt","quart","quarts"].includes(u)) return "qt";
  return u;
}
function parsePackage(title,desc,extra,priceText){
  const blocks=[cleanText(title),cleanText(desc),cleanText(extra)].filter(Boolean);
  const all=blocks.join(" | ");
  let m;

  // 40 pieces, 4 oz each
  m=all.match(/\b(\d+)\s*(pieces?|pcs|portions?|breasts?|fillets?|links?|patties|rolls?|buns?|bottles?|cans?)\b[^0-9]{0,24}(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\s*(?:each|ea)?\b/i);
  if(m){
    const count=Number(m[1]), eachQty=Number(m[3]), unit=normUnit(m[4]);
    return {label:`${count} x ${eachQty} ${unit} ${m[2].toLowerCase()}`, quantity:count*eachQty, unit, count, eachQuantity:eachQty, eachUnit:unit, confident:true};
  }
  // (16) 6 oz
  m=all.match(/\((\d+)\)\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\b/i);
  if(m){
    const count=Number(m[1]), eachQty=Number(m[2]), unit=normUnit(m[3]);
    return {label:`${count} x ${eachQty} ${unit}`, quantity:count*eachQty, unit, count, eachQuantity:eachQty, eachUnit:unit, confident:true};
  }
  // 16 x 6 oz
  m=all.match(/\b(\d+)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\b/i);
  if(m){
    const count=Number(m[1]), eachQty=Number(m[2]), unit=normUnit(m[3]);
    return {label:`${count} x ${eachQty} ${unit}`, quantity:count*eachQty, unit, count, eachQuantity:eachQty, eachUnit:unit, confident:true};
  }
  // 4/5 lb
  m=all.match(/\b(\d+)\s*\/\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\b/i);
  if(m){
    const count=Number(m[1]), eachQty=Number(m[2]), unit=normUnit(m[3]);
    return {label:`${count} x ${eachQty} ${unit}`, quantity:count*eachQty, unit, count, eachQuantity:eachQty, eachUnit:unit, confident:true};
  }
  // 24 ct
  m=all.match(/\b(\d+)\s*(?:ct|count|pieces?|pcs|pack)\b/i);
  if(m){
    const count=Number(m[1]);
    return {label:`${count} count`, quantity:count, unit:"each", count, confident:true};
  }
  // case of 12
  m=all.match(/\b(?:case|pack|box|bag)\s+of\s+(\d+)\b/i);
  if(m){
    const count=Number(m[1]);
    return {label:`${count} count`, quantity:count, unit:"each", count, confident:true};
  }
  // 10 lb case, 5lbs, 8 oz
  m=all.match(/\b(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\b(?:\s+(case|bag|box|pack))?/i);
  if(m){
    const quantity=Number(m[1]), unit=normUnit(m[2]);
    return {label:`${quantity} ${unit}${m[3]?" "+m[3].toLowerCase():""}`,quantity,unit,confident:true};
  }

  const sell=cleanText(`${all} ${priceText}`).toLowerCase();
  if(/\/\s*lb\b|per\s+(?:lb|pound)\b/.test(sell))
    return {label:"Sold by the pound",quantity:1,unit:"lb",sellingUnit:"lb",confident:true};
  if(/\/\s*(?:ea|each)\b|per\s+(?:ea|each)\b|\beach\b/.test(sell))
    return {label:"1 each",quantity:1,unit:"each",sellingUnit:"each",confident:true};
  if(/\/\s*oz\b|per\s+ounce\b/.test(sell))
    return {label:"Sold by the ounce",quantity:1,unit:"oz",sellingUnit:"oz",confident:true};

  return {label:"Needs package review",quantity:null,unit:null,confident:false};
}
function productForm(title,desc,extra){
  const t=cleanText(`${title} ${desc} ${extra}`).toLowerCase();
  const found=[];
  const add=(label,re)=>{if(re.test(t)&&!found.includes(label))found.push(label)};
  add("IQF / Frozen",/\biqf\b/);
  if(!found.includes("IQF / Frozen")) add("Frozen",/\bfrozen\b/);
  add("Fresh",/\bfresh\b/);
  add("Refrigerated",/\brefrigerated\b|\bchilled\b/);
  add("Canned",/\bcanned\b|\b#10 can\b/);
  add("Dried",/\bdried\b/);
  add("Dehydrated",/\bdehydrated\b/);
  add("Shelf-stable",/\bshelf[- ]?stable\b/);
  add("Ready-to-cook",/\bready[- ]?to[- ]?cook\b/);
  add("Fully cooked",/\bfully cooked\b|\bprecooked\b|\bpre-cooked\b/);
  add("Raw",/\braw\b|\buncooked\b/);
  add("Smoked",/\bsmoked\b/);
  return found.length?found.join(" / "):"Not stated";
}
function unitCost(price,pkg){
  if(price==null||!pkg?.confident||!pkg.quantity||!pkg.unit) return null;
  return {amount:price/pkg.quantity,unit:pkg.unit};
}
function relevance(q,result){
  const words=cleanText(q).toLowerCase().split(/\s+/).filter(w=>w.length>2);
  const text=cleanText(`${result.title} ${result.description} ${result.raw}`).toLowerCase();
  let s=0;
  for(const w of words) if(text.includes(w)) s+=5;
  if(/\bjerky\b/.test(text)&&!/\bjerky\b/.test(cleanText(q).toLowerCase())) s-=30;
  if(/\bdog food\b|\bpet food\b|\btreats?\b/.test(text)) s-=40;
  return s;
}
async function serperShopping(query,location){
  const key=process.env.SERPER_API_KEY;
  if(!key) throw new Error("SERPER_API_KEY is not configured in Vercel.");
  const r=await fetch(SERPER_URL,{
    method:"POST",
    headers:{"X-API-KEY":key,"Content-Type":"application/json"},
    body:JSON.stringify({q:query,gl:"us",hl:"en",location:location||DEFAULT_LOCATION,num:30})
  });
  const txt=await r.text();
  let data={}; try{data=JSON.parse(txt)}catch{}
  if(!r.ok) throw new Error(data?.message||data?.error||`Serper HTTP ${r.status}`);
  return Array.isArray(data.shopping)?data.shopping:[];
}
async function searchItem(item,location){
  const query=`${item.searchIngredient} food service bulk`;
  const shopping=await serperShopping(query,location);

  // STRICT FILTER: actual link hostname must be one of the five approved retailers.
  const candidates=shopping.map(r=>{
    const store=canonicalStore(r.link);
    return store?{
      store,title:cleanText(r.title),price:priceNumber(r.price),priceText:cleanText(r.price),
      link:r.link,delivery:cleanText(r.delivery),shoppingDescription:cleanText(r.snippet||r.description)
    }:null;
  }).filter(r=>r&&r.price!=null).slice(0,14);

  const enriched=await Promise.all(candidates.map(async r=>{
    const page=await pageDetails(r.link);
    const description=page.description||r.shoppingDescription||"";
    const raw=page.raw||description;
    const pkg=parsePackage(r.title,description,raw,r.priceText);
    const uc=unitCost(r.price,pkg);
    const rel=relevance(item.searchIngredient,{title:r.title,description,raw});
    return {
      ...r,
      link:page.finalUrl||r.link,
      description,
      retailerDetailsRead:!!page.fetched,
      retailerDetailError:page.error||page.status||"",
      package:pkg,
      packageDescription:pkg.label,
      productForm:productForm(r.title,description,raw),
      unitCost:uc,
      brand:page.brand||"",
      sku:page.sku||"",
      gtin:page.gtin||"",
      relevanceScore:rel
    };
  }));

  return enriched
    .filter(r=>r.relevanceScore>=0)
    .sort((a,b)=>{
      const ar=a.package?.confident?1:0, br=b.package?.confident?1:0;
      if(br!==ar) return br-ar;
      const ad=a.retailerDetailsRead?1:0, bd=b.retailerDetailsRead?1:0;
      if(bd!==ad) return bd-ad;
      return b.relevanceScore-a.relevanceScore || a.price-b.price;
    })
    .slice(0,MAX_RESULTS);
}
async function limited(items,fn,n=4){
  const out=new Array(items.length); let next=0;
  async function run(){
    while(true){
      const i=next++; if(i>=items.length)return;
      try{out[i]=await fn(items[i])}
      catch(e){out[i]={id:items[i].id,name:items[i].name,searchIngredient:items[i].searchIngredient,ok:false,error:String(e?.message||e),results:[]}}
    }
  }
  await Promise.all(Array.from({length:Math.min(n,items.length)},run));
  return out;
}
export default async function handler(req,res){
  cors(res);
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="POST") return res.status(405).json({error:"Use POST /api/prices"});
  const body=req.body||{};
  const items=Array.isArray(body.items)?body.items:[];
  if(!items.length) return res.status(400).json({error:"No items provided"});
  if(items.length>MAX_ITEMS) return res.status(400).json({error:`Maximum ${MAX_ITEMS} items per request`});

  const cleaned=items.map(i=>({
    id:i.id??null,
    name:cleanText(i.name),
    searchIngredient:cleanText(i.searchIngredient||i.name)
  }));
  const location=cleanText(body.location||DEFAULT_LOCATION);
  const results=await limited(cleaned,async item=>({
    id:item.id,name:item.name,searchIngredient:item.searchIngredient,ok:true,
    results:await searchItem(item,location)
  }));
  res.status(200).json({
    ok:true,version:"2.0.0",checkedAt:new Date().toISOString(),location,
    approvedStores:STORES.map(s=>s.name),results
  });
}
