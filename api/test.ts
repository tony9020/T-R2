import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  console.log("=== TEST ENDPOINT ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  
  res.json({
    message: "Serverless function is working!",
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    environment: "Vercel"
  });
}
