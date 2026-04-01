import { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log("=== VERCEL DOCX EXTRACTION REQUEST ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Request headers:", req.headers);
  console.log("Request method:", req.method);
  console.log("Request url:", req.url);
  console.log("Request body type:", typeof req.body);
  console.log("Request body:", req.body ? "has body" : "no body");

  try {
    // Handle JSON request with base64 file
    if (req.headers['content-type']?.includes('application/json')) {
      console.log("🔍 Parsing JSON body...");
      const { file, name, type, size } = req.body;
      
      console.log("📋 Parsed data:", { 
        hasFile: !!file, 
        fileType: typeof file, 
        fileLength: file ? file.length : 0,
        name, 
        type, 
        size 
      });
      
      if (!file) {
        console.error("❌ No file in request body");
        console.error("Available keys:", Object.keys(req.body || {}));
        return res.status(400).json({ error: 'No file uploaded - missing file field in request body' });
      }

      console.log("✅ File received:", name, "Size:", size, "Type:", type);

      // Convert base64 to buffer
      let fileBuffer: Buffer;
      
      if (typeof file === 'string') {
        console.log("🔄 Converting base64 to buffer...");
        // Remove data URI prefix if present
        let base64Data = file;
        if (file.includes(',')) {
          base64Data = file.split(',')[1];
          console.log("📝 Removed data URI prefix");
        }
        
        if (!base64Data) {
          console.error("❌ No valid base64 data found");
          return res.status(400).json({ error: 'Invalid base64 data' });
        }
        
        fileBuffer = Buffer.from(base64Data, 'base64');
        console.log("🔧 Buffer created, length:", fileBuffer.length);
      } else {
        console.error("❌ File is not a string, type:", typeof file);
        return res.status(400).json({ error: 'Invalid file format - expected base64 string' });
      }

      // Verify buffer was created successfully
      if (fileBuffer.length === 0) {
        console.error("❌ Empty buffer created");
        return res.status(400).json({ error: 'Empty file buffer' });
      }

      // Verify it's a DOCX file by checking the magic bytes
      const docxSignature = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // PK signature
      if (fileBuffer.length < 4 || !fileBuffer.subarray(0, 4).equals(docxSignature)) {
        console.error("❌ Not a valid DOCX file (invalid signature)");
        console.error("📋 First 10 bytes:", Array.from(fileBuffer.subarray(0, 10)));
        return res.status(400).json({ error: 'Invalid DOCX file format - expected .docx file' });
      }

      // Extract text using mammoth
      console.log("🔧 Extracting text with mammoth...");
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      console.log("✅ Extraction successful, characters:", result.value.length);
      console.log("📝 First 100 chars:", result.value.substring(0, 100));

      res.json({ text: result.value });
    } else {
      console.error("❌ Unsupported content type:", req.headers['content-type']);
      return res.status(400).json({ error: 'Content-Type must be application/json' });
    }

  } catch (error: any) {
    console.error("❌ Error extracting text:", error);
    console.error("❌ Error message:", error.message);
    console.error("❌ Error stack:", error.stack);
    
    res.status(500).json({ 
      error: `Failed to extract text: ${error.message}`,
      details: {
        name: error.constructor.name,
        timestamp: new Date().toISOString()
      }
    });
  }
}
