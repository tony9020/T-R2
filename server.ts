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

  // API Routes
  app.post("/api/extract-text", upload.single("file"), async (req, res) => {
    console.log("Extraction request received");
    console.log("Request headers:", req.headers);
    console.log("Request body keys:", Object.keys(req.body || {}));
    console.log("Request file:", req.file ? {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      bufferLength: req.file.buffer.length
    } : 'No file');
    
    try {
      if (!req.file) {
        console.error("No file in request");
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log("File received:", req.file.originalname, "Size:", req.file.size, "MIME:", req.file.mimetype);

      const buffer = req.file.buffer;
      const result = await mammoth.extractRawText({ buffer });
      console.log("Extraction successful, characters:", result.value.length);
      res.json({ text: result.value });
    } catch (error: any) {
      console.error("Error extracting text:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({ error: `Failed to extract text: ${error.message}` });
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
