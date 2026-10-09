export default function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  return res.status(200).json({
    ok:true,
    service:"Big B's BBQ Clean Pricing API",
    version:"2.0.0",
    approvedStores:["Walmart","CHEF'STORE","Costco","Food Lion","WebstaurantStore"],
    time:new Date().toISOString()
  });
}
