import { VercelRequest, VercelResponse } from '@vercel/node';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, BorderStyle } from "docx";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log("=== VERCEL DOCX GENERATION REQUEST ===");
  console.log("Timestamp:", new Date().toISOString());

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
    
    // Set headers for file download
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename=${full_name.replace(/\s+/g, '_')}_Resume.docx`);
    res.setHeader("Content-Length", buffer.length);
    
    res.send(buffer);
  } catch (error: any) {
    console.error("Error generating DOCX:", error);
    res.status(500).json({ error: "Failed to generate document" });
  }
}
