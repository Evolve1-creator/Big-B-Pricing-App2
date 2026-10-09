export default function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  return res.status(200).json({
    ok:true,
    service:"Big B's BBQ Direct Store Pricing API",
    version:"2.1.0",
    sourceMode:"direct-retailer-sites",
    approvedStores:["Walmart","CHEF'STORE","Costco","Food Lion"],
    time:new Date().toISOString()
  });
}
