import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import multer from "multer";
import mammoth from "mammoth";
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, BorderStyle } from "docx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development"
    });
  });

  // Test mammoth library
  app.get("/api/test-mammoth", (req, res) => {
    try {
      console.log("Testing mammoth library availability...");
      // Just test if mammoth is available and can be called
      const testResult = typeof mammoth.extractRawText === 'function';
      console.log("✅ Mammoth library is available, extractRawText function:", testResult);
      res.json({ 
        status: "mammoth-ok", 
        extractRawTextAvailable: testResult,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("❌ Mammoth library test failed:", error);
      res.status(500).json({ 
        status: "mammoth-error", 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // API Routes
  app.post("/api/extract-text", upload.single("file"), async (req, res) => {
    console.log("=== LOCAL DOCX EXTRACTION REQUEST ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Request headers:", Object.keys(req.headers).reduce((acc, key) => {
      acc[key] = req.headers[key];
      return acc;
    }, {} as any));
    console.log("Request body keys:", Object.keys(req.body || {}));
    console.log("Request file details:", req.file ? {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      bufferLength: req.file.buffer.length,
      fieldname: req.file.fieldname,
      encoding: req.file.encoding
    } : 'No file received');
    console.log("Content-Type header:", req.headers['content-type']);
    console.log("Content-Length:", req.headers['content-length']);
    
    try {
      let fileBuffer: Buffer;
      let fileName: string;
      let fileType: string;

      // Handle both FormData (local) and JSON base64 (Vercel) approaches
      if (req.headers['content-type']?.includes('application/json')) {
        // JSON base64 approach (for Vercel compatibility)
        console.log("🔍 Processing JSON base64 request...");
        const { file, name, type, size } = req.body;
        
        if (!file) {
          console.error("❌ No file in JSON request body");
          return res.status(400).json({ error: "No file uploaded - missing file field in request body" });
        }

        console.log("✅ File received via JSON:", name, "Size:", size, "Type:", type);

        // Convert base64 to buffer
        if (typeof file === 'string') {
          console.log("🔄 Converting base64 to buffer...");
          let base64Data = file;
          if (file.includes(',')) {
            base64Data = file.split(',')[1];
            console.log("📝 Removed data URI prefix");
          }
          
          if (!base64Data) {
            console.error("❌ No valid base64 data found");
            return res.status(400).json({ error: "Invalid base64 data" });
          }
          
          fileBuffer = Buffer.from(base64Data, 'base64');
          fileName = name || 'uploaded.docx';
          fileType = type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          console.log("🔧 Buffer created, length:", fileBuffer.length);
        } else {
          console.error("❌ File is not a string, type:", typeof file);
          return res.status(400).json({ error: "Invalid file format - expected base64 string" });
        }
      } else {
        // Traditional FormData approach (for local development)
        console.log("🔍 Processing FormData request...");
        
        if (!req.file) {
          console.error("❌ No file in FormData request");
          console.error("Available fields:", Object.keys(req.body || {}));
          return res.status(400).json({ error: "No file uploaded" });
        }

        console.log("✅ File received via FormData:", req.file.originalname, "Size:", req.file.size, "MIME:", req.file.mimetype);

        fileBuffer = req.file.buffer;
        fileName = req.file.originalname;
        fileType = req.file.mimetype;
      }

      // Verify buffer was created successfully
      if (fileBuffer.length === 0) {
        console.error("❌ Empty buffer created");
        return res.status(400).json({ error: "Empty file buffer" });
      }

      // Verify it's a DOCX file by checking the magic bytes
      const docxSignature = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // PK signature
      if (fileBuffer.length < 4 || !fileBuffer.subarray(0, 4).equals(docxSignature)) {
        console.error("❌ Not a valid DOCX file (invalid signature)");
        console.error("📋 First 10 bytes:", Array.from(fileBuffer.subarray(0, 10)));
        return res.status(400).json({ error: "Invalid DOCX file format - expected .docx file" });
      }

      // Test mammoth availability
      console.log("🔧 Testing mammoth library...");
      console.log("📄 Buffer length:", fileBuffer.length, "bytes");
      
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      console.log("✅ Extraction successful, characters:", result.value.length);
      console.log("📝 First 100 chars:", result.value.substring(0, 100));
      
      res.json({ text: result.value });
    } catch (error: any) {
      console.error("❌ Error extracting text:", error);
      console.error("❌ Error message:", error.message);
      console.error("❌ Error stack:", error.stack);
      console.error("❌ Error type:", error.constructor.name);
      
      // Send more detailed error info
      const errorResponse = {
        error: `Failed to extract text: ${error.message}`,
        details: {
          name: error.constructor.name,
          stack: error.stack,
          timestamp: new Date().toISOString()
        }
      };
      
      res.status(500).json(errorResponse);
    }
  });

  app.post("/api/generate-docx", async (req, res) => {
    console.log("Generation request received");
    try {
      const { improved_resume } = req.body;
      if (!improved_resume) {
        console.error("Missing resume data in request body");
        return res.status(400).json({ error: "Missing resume data" });
      }

      const { full_name, contact_info, summary, experience, education, skills } = improved_resume;

      // Helper to create contact line
      const contactParts = [];
      if (contact_info?.phone) contactParts.push(contact_info.phone);
      if (contact_info?.location) contactParts.push(contact_info.location);
      if (contact_info?.email) contactParts.push(contact_info.email);
      if (contact_info?.linkedin) contactParts.push(contact_info.linkedin);
      if (contact_info?.website) contactParts.push(contact_info.website);
      const contactLine = contactParts.join(" | ");

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 720, // 0.5 inch
                  bottom: 720,
                  left: 720,
                  right: 720,
                },
              },
            },
            children: [
              // Name Header
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: full_name.toUpperCase(),
                    bold: true,
                    size: 36, // 18pt
                    font: "Garamond",
                  }),
                ],
              }),
              // Contact Info
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: contactLine,
                    font: "Garamond",
                    size: 20, // 10pt
                  }),
                ],
                spacing: { after: 200 },
              }),

              // Summary Section
              new Paragraph({
                children: [
                  new TextRun({
                    text: "SUMMARY",
                    bold: true,
                    font: "Garamond",
                    size: 22, // 11pt
                  }),
                ],
                border: {
                  bottom: {
                    color: "auto",
                    space: 1,
                    style: BorderStyle.SINGLE,
                    size: 6,
                  },
                },
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: summary,
                    font: "Garamond",
                    size: 20,
                  }),
                ],
                spacing: { after: 200 },
              }),

              // Experience Section
              new Paragraph({
                children: [
                  new TextRun({
                    text: "WORK EXPERIENCE",
                    bold: true,
                    font: "Garamond",
                    size: 22,
                  }),
                ],
                border: {
                  bottom: {
                    color: "auto",
                    space: 1,
                    style: BorderStyle.SINGLE,
                    size: 6,
                  },
                },
                spacing: { before: 200, after: 100 },
              }),
              ...(experience?.flatMap((job: any) => [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: job.role_title,
                      bold: true,
                      font: "Garamond",
                      size: 20,
                    }),
                    new TextRun({
                      text: `\t${job.dates}`,
                      bold: true,
                      font: "Garamond",
                      size: 20,
                    }),
                  ],
                  tabStops: [{ type: "right", position: 10000 }],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: job.company,
                      italics: true,
                      font: "Garamond",
                      size: 20,
                    }),
                    new TextRun({
                      text: job.location ? `\t${job.location}` : "",
                      italics: true,
                      font: "Garamond",
                      size: 20,
                    }),
                  ],
                  tabStops: [{ type: "right", position: 10000 }],
                }),
                ...(job.bullet_points?.map((bullet: string) => 
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: bullet,
                        font: "Garamond",
                        size: 20,
                      }),
                    ],
                    bullet: { level: 0 },
                    spacing: { before: 50 },
                  })
                ) || []),
                new Paragraph({ spacing: { after: 150 } }),
              ]) || []),

              // Education Section
              ...(education && education.length > 0 ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "EDUCATION",
                      bold: true,
                      font: "Garamond",
                      size: 22,
                    }),
                  ],
                  border: {
                    bottom: {
                      color: "auto",
                      space: 1,
                      style: BorderStyle.SINGLE,
                      size: 6,
                    },
                  },
                  spacing: { before: 200, after: 100 },
                }),
                ...education.flatMap((edu: any) => [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: edu.institution,
                        bold: true,
                        font: "Garamond",
                        size: 20,
                      }),
                      new TextRun({
                        text: `\t${edu.dates}`,
                        bold: true,
                        font: "Garamond",
                        size: 20,
                      }),
                    ],
                    tabStops: [{ type: "right", position: 10000 }],
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: edu.degree,
                        italics: true,
                        font: "Garamond",
                        size: 20,
                      }),
                      new TextRun({
                        text: edu.location ? `\t${edu.location}` : "",
                        italics: true,
                        font: "Garamond",
                        size: 20,
                      }),
                    ],
                    tabStops: [{ type: "right", position: 10000 }],
                    spacing: { after: 150 },
                  }),
                ])
              ] : []),

              // Skills Section
              new Paragraph({
                children: [
                  new TextRun({
                    text: "SKILLS",
                    bold: true,
                    font: "Garamond",
                    size: 22,
                  }),
                ],
                border: {
                  bottom: {
                    color: "auto",
                    space: 1,
                    style: BorderStyle.SINGLE,
                    size: 6,
                  },
                },
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: (skills || []).join(", "),
                    font: "Garamond",
                    size: 20,
                  }),
                ],
              }),
            ],
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename=${full_name.replace(/\s+/g, '_')}_Resume.docx`);
      res.send(buffer);
    } catch (error) {
      console.error("Error generating DOCX:", error);
      res.status(500).json({ error: "Failed to generate document" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files but ensure API routes work
    const distPath = path.resolve(__dirname, "dist");
    
    // Serve static files
    app.use(express.static(distPath));
    
    // Handle client-side routing - only for non-API routes
    app.get("*", (req, res, next) => {
      // Skip API routes - they should have been handled already
      if (req.path.startsWith('/api/')) {
        console.log(`API route not found: ${req.path}`);
        return res.status(404).json({ error: "API endpoint not found" });
      }
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
