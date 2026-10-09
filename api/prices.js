const DEFAULT_LOCATION = "South Carolina, United States";
const MAX_ITEMS = 30;
const MAX_RESULTS_PER_STORE = 4;

const STORES = [
  {
    name:"Walmart",
    host:"walmart.com",
    searchUrl:q=>`https://www.walmart.com/search?q=${encodeURIComponent(q)}`
  },
  {
    name:"CHEF'STORE",
    host:"chefstore.com",
    searchUrl:q=>`https://www.chefstore.com/search/fullsearch/?q=${encodeURIComponent(q)}`
  },
  {
    name:"Costco",
    host:"costco.com",
    searchUrl:q=>`https://www.costco.com/s?keyword=${encodeURIComponent(q)}`
  },
  {
    name:"Food Lion",
    host:"foodlion.com",
    searchUrl:q=>`https://foodlion.com/product-search/${encodeURIComponent(q).replace(/%20/g,"-")}`
  }
];

function cors(res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
}
function cleanText(s){return String(s||"").replace(/\s+/g," ").trim()}
function decodeHtml(s){
  return String(s||"")
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function stripHtml(s){return cleanText(decodeHtml(String(s||"").replace(/<[^>]+>/g," ")))}
function numberPrice(v){
  if(typeof v==="number") return Number.isFinite(v)?v:null;
  const m=String(v||"").replace(/,/g,"").match(/\$(\d+(?:\.\d{1,2})?)/);
  return m?Number(m[1]):null;
}
function hostMatches(url,host){
  try{
    const h=new URL(url).hostname.toLowerCase().replace(/^www\./,"");
    return h===host||h.endsWith("."+host);
  }catch{return false}
}
async function fetchHtml(url,timeoutMs=9000){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{
    const r=await fetch(url,{
      redirect:"follow",
      signal:ctl.signal,
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36",
        "Accept":"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language":"en-US,en;q=0.9"
      }
    });
    const text=await r.text();
    return {ok:r.ok,status:r.status,url:r.url||url,text};
  }catch(e){
    return {ok:false,status:0,url,error:e?.name==="AbortError"?"Timed out":String(e?.message||e),text:""};
  }finally{clearTimeout(timer)}
}
function findProducts(node,out=[]){
  if(!node) return out;
  if(Array.isArray(node)){for(const x of node)findProducts(x,out);return out}
  if(typeof node!=="object") return out;
  const type=node["@type"];
  if(type==="Product"||(Array.isArray(type)&&type.includes("Product"))) out.push(node);
  if(node["@graph"]) findProducts(node["@graph"],out);
  for(const [k,v] of Object.entries(node)){
    if(k!=="@graph" && v && typeof v==="object") findProducts(v,out);
  }
  return out;
}
function jsonLdProducts(html){
  const out=[];
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{findProducts(JSON.parse(m[1].trim()),out)}catch{}
  }
  return out;
}
function productOffer(product){
  let offers=product?.offers;
  if(Array.isArray(offers)) offers=offers[0];
  if(offers && offers.offers && Array.isArray(offers.offers)) offers=offers.offers[0];
  const price=Number(offers?.price ?? offers?.lowPrice ?? offers?.highPrice);
  return {
    price:Number.isFinite(price)?price:null,
    priceCurrency:offers?.priceCurrency||"USD",
    availability:String(offers?.availability||""),
    url:String(offers?.url||product?.url||"")
  };
}
function productFromJsonLd(p,baseUrl,storeName){
  const offer=productOffer(p);
  let url=offer.url||String(p.url||"");
  try{url=new URL(url,baseUrl).href}catch{}
  return {
    store:storeName,
    title:cleanText(p.name||""),
    description:stripHtml(p.description||""),
    link:url,
    price:offer.price,
    priceText:offer.price!=null?`$${offer.price.toFixed(2)}`:"",
    availability:offer.availability,
    brand:typeof p.brand==="string"?p.brand:cleanText(p.brand?.name||""),
    sku:cleanText(p.sku||""),
    gtin:cleanText(p.gtin13||p.gtin12||p.gtin14||p.gtin||""),
    raw:stripHtml([
      p.name,p.description,p.size,p.weight,p.category,p.model,
      p.additionalProperty?JSON.stringify(p.additionalProperty):""
    ].filter(Boolean).join(" "))
  };
}
function anchorCandidates(html,baseUrl,host,query){
  const qWords=cleanText(query).toLowerCase().split(/\s+/).filter(w=>w.length>2);
  const items=[];
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))){
    let href=decodeHtml(m[1]);
    try{href=new URL(href,baseUrl).href}catch{continue}
    if(!hostMatches(href,host))continue;
    const text=stripHtml(m[2]);
    if(!text||text.length<4)continue;
    const low=text.toLowerCase();
    const score=qWords.reduce((s,w)=>s+(low.includes(w)?2:0),0);
    if(score<=0)continue;
    if(!/product|ip\/|p\/|item|shop/i.test(href))continue;
    items.push({href,text,score});
  }
  const seen=new Set();
  return items.sort((a,b)=>b.score-a.score).filter(x=>{
    const k=x.href.split("?")[0];
    if(seen.has(k))return false;
    seen.add(k);return true;
  }).slice(0,8);
}
function normUnit(u){
  u=String(u||"").toLowerCase().replace(/\./g,"").trim();
  if(["lb","lbs","pound","pounds"].includes(u))return "lb";
  if(["oz","ounce","ounces"].includes(u))return "oz";
  if(["ea","each","count","ct","piece","pieces","pcs"].includes(u))return "each";
  if(["gal","gallon","gallons"].includes(u))return "gal";
  if(["qt","quart","quarts"].includes(u))return "qt";
  return u;
}
function parsePackage(title,desc,raw,priceText){
  const all=cleanText(`${title} ${desc} ${raw}`);
  let m;

  m=all.match(/\b(\d+)\s*(pieces?|pcs|portions?|breasts?|fillets?|links?|patties|rolls?|buns?|bottles?|cans?)\b[^0-9]{0,24}(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\s*(?:each|ea)?\b/i);
  if(m){
    const count=Number(m[1]), eachQty=Number(m[3]), unit=normUnit(m[4]);
    return {label:`${count} x ${eachQty} ${unit} ${m[2].toLowerCase()}`,quantity:count*eachQty,unit,count,eachQuantity:eachQty,eachUnit:unit,confident:true};
  }
  m=all.match(/\((\d+)\)\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\b/i);
  if(m){
    const count=Number(m[1]), eachQty=Number(m[2]), unit=normUnit(m[3]);
    return {label:`${count} x ${eachQty} ${unit}`,quantity:count*eachQty,unit,count,eachQuantity:eachQty,eachUnit:unit,confident:true};
  }
  m=all.match(/\b(\d+)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\b/i);
  if(m){
    const count=Number(m[1]), eachQty=Number(m[2]), unit=normUnit(m[3]);
    return {label:`${count} x ${eachQty} ${unit}`,quantity:count*eachQty,unit,count,eachQuantity:eachQty,eachUnit:unit,confident:true};
  }
  m=all.match(/\b(\d+)\s*\/\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\b/i);
  if(m){
    const count=Number(m[1]), eachQty=Number(m[2]), unit=normUnit(m[3]);
    return {label:`${count} x ${eachQty} ${unit}`,quantity:count*eachQty,unit,count,eachQuantity:eachQty,eachUnit:unit,confident:true};
  }
  m=all.match(/\b(\d+)\s*(?:ct|count|pieces?|pcs|pack)\b/i);
  if(m)return {label:`${Number(m[1])} count`,quantity:Number(m[1]),unit:"each",count:Number(m[1]),confident:true};
  m=all.match(/\b(?:case|pack|box|bag)\s+of\s+(\d+)\b/i);
  if(m)return {label:`${Number(m[1])} count`,quantity:Number(m[1]),unit:"each",count:Number(m[1]),confident:true};
  m=all.match(/\b(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?)\b(?:\s+(case|bag|box|pack|tray))?/i);
  if(m){
    const quantity=Number(m[1]),unit=normUnit(m[2]);
    return {label:`${quantity} ${unit}${m[3]?" "+m[3].toLowerCase():""}`,quantity,unit,confident:true};
  }

  const sell=cleanText(`${all} ${priceText}`).toLowerCase();
  if(/\/\s*lb\b|per\s+(?:lb|pound)\b|price\s+per\s+lb\b/.test(sell))
    return {label:"Sold by the pound",quantity:1,unit:"lb",sellingUnit:"lb",confident:true};
  if(/\/\s*(?:ea|each)\b|per\s+(?:ea|each)\b/.test(sell))
    return {label:"1 each",quantity:1,unit:"each",sellingUnit:"each",confident:true};
  return {label:"Needs package review",quantity:null,unit:null,confident:false};
}
function productForm(title,desc,raw){
  const t=cleanText(`${title} ${desc} ${raw}`).toLowerCase();
  const f=[];
  const add=(label,re)=>{if(re.test(t)&&!f.includes(label))f.push(label)};
  add("IQF / Frozen",/\biqf\b/);
  if(!f.includes("IQF / Frozen"))add("Frozen",/\bfrozen\b/);
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
  return f.length?f.join(" / "):"Not stated";
}
function unitCost(price,pkg){
  if(price==null||!pkg?.confident||!pkg.quantity||!pkg.unit)return null;
  return {amount:price/pkg.quantity,unit:pkg.unit};
}
function relevance(query,title,desc){
  const q=cleanText(query).toLowerCase();
  const text=cleanText(`${title} ${desc}`).toLowerCase();
  let score=0;
  for(const w of q.split(/\s+/).filter(x=>x.length>2))if(text.includes(w))score+=5;
  if(/\bjerky\b/.test(text)&&!/\bjerky\b/.test(q))score-=40;
  if(/\bdog food\b|\bpet food\b|\btreats?\b/.test(text))score-=50;
  return score;
}
async function enrichProduct(base,store){
  if(!base.link||!hostMatches(base.link,store.host))return null;
  const page=await fetchHtml(base.link,8000);
  let product=base;
  if(page.ok){
    const products=jsonLdProducts(page.text);
    if(products.length){
      const candidates=products.map(p=>productFromJsonLd(p,page.url,store.name));
      const best=candidates.sort((a,b)=>relevance(base.title,b.title,b.description)-relevance(base.title,a.title,a.description))[0];
      if(best)product={...base,...best,link:best.link||page.url};
    }else{
      const title=(page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1];
      const desc=(page.text.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)||[])[1];
      product={...base,title:base.title||stripHtml(title||""),description:base.description||stripHtml(desc||""),link:page.url,raw:stripHtml(`${title||""} ${desc||""}`)};
    }
    product.retailerDetailsRead=true;
  }else{
    product={...base,retailerDetailsRead:false,retailerDetailError:page.error||page.status||"Unavailable"};
  }
  const pkg=parsePackage(product.title,product.description,product.raw,product.priceText);
  return {
    ...product,
    package:pkg,
    packageDescription:pkg.label,
    productForm:productForm(product.title,product.description,product.raw),
    unitCost:unitCost(product.price,pkg)
  };
}
async function searchStore(store,query){
  const url=store.searchUrl(query);
  const page=await fetchHtml(url,10000);
  if(!page.ok){
    return {store:store.name,ok:false,error:`Store search unavailable (${page.error||page.status||"unknown"})`,results:[]};
  }

  const results=[];
  // First preference: structured Product data on the retailer's own search page.
  for(const p of jsonLdProducts(page.text)){
    const base=productFromJsonLd(p,page.url,store.name);
    if(!base.link || !hostMatches(base.link,store.host))continue;
    if(relevance(query,base.title,base.description)<0)continue;
    const enriched=await enrichProduct(base,store);
    if(enriched)results.push(enriched);
    if(results.length>=MAX_RESULTS_PER_STORE)break;
  }

  // Second preference: retailer product links from its own search page, then product-page data.
  if(results.length<MAX_RESULTS_PER_STORE){
    const links=anchorCandidates(page.text,page.url,store.host,query);
    for(const a of links){
      if(results.some(r=>r.link&&r.link.split("?")[0]===a.href.split("?")[0]))continue;
      const enriched=await enrichProduct({
        store:store.name,title:a.text,description:"",link:a.href,price:null,priceText:"",raw:""
      },store);
      if(!enriched)continue;

      // Product page may expose price through JSON-LD. If still absent, inspect page text patterns.
      if(enriched.price==null){
        const pp=await fetchHtml(enriched.link,6000);
        if(pp.ok){
          const text=stripHtml(pp.text);
          const pm=text.match(/\$(\d+(?:\.\d{1,2})?)(?:\s*(?:\/|per)\s*(lb|each|ea))?/i);
          if(pm){
            enriched.price=Number(pm[1]);
            enriched.priceText=pm[0];
            const pkg=parsePackage(enriched.title,enriched.description,`${enriched.raw} ${text.slice(0,5000)}`,enriched.priceText);
            enriched.package=pkg;
            enriched.packageDescription=pkg.label;
            enriched.unitCost=unitCost(enriched.price,pkg);
          }
        }
      }
      if(relevance(query,enriched.title,enriched.description)>=0)results.push(enriched);
      if(results.length>=MAX_RESULTS_PER_STORE)break;
    }
  }

  return {
    store:store.name,
    ok:true,
    searchUrl:page.url,
    results:results.filter(r=>r.price!=null).slice(0,MAX_RESULTS_PER_STORE)
  };
}
async function limited(items,fn,n=3){
  const out=new Array(items.length);let next=0;
  async function run(){
    while(true){
      const i=next++;if(i>=items.length)return;
      try{out[i]=await fn(items[i])}catch(e){out[i]={id:items[i].id,name:items[i].name,ok:false,error:String(e?.message||e),stores:[]}}
    }
  }
  await Promise.all(Array.from({length:Math.min(n,items.length)},run));
  return out;
}
export default async function handler(req,res){
  cors(res);
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST")return res.status(405).json({error:"Use POST /api/prices"});
  const body=req.body||{};
  const items=Array.isArray(body.items)?body.items:[];
  if(!items.length)return res.status(400).json({error:"No items provided"});
  if(items.length>MAX_ITEMS)return res.status(400).json({error:`Maximum ${MAX_ITEMS} items per request`});

  const cleaned=items.map(i=>({id:i.id??null,name:cleanText(i.name),searchIngredient:cleanText(i.searchIngredient||i.name)}));
  const results=await limited(cleaned,async item=>{
    const stores=await Promise.all(STORES.map(s=>searchStore(s,item.searchIngredient)));
    return {
      id:item.id,name:item.name,searchIngredient:item.searchIngredient,ok:true,
      stores,
      results:stores.flatMap(s=>s.results||[])
    };
  });

  return res.status(200).json({
    ok:true,
    version:"2.1.0",
    sourceMode:"direct-retailer-sites",
    checkedAt:new Date().toISOString(),
    location:cleanText(body.location||DEFAULT_LOCATION),
    approvedStores:STORES.map(s=>s.name),
    results
  });
}
