export interface ResumeData {
  ats_score: number;
  detected_errors: string[];
  feedback_summary: string;
  improved_resume: {
    full_name: string;
    contact_info?: {
      email?: string;
      phone?: string;
      location?: string;
      linkedin?: string;
      website?: string;
    };
    summary: string;
    experience: {
      company: string;
      role_title: string;
      dates: string;
      location?: string;
      bullet_points: string[];
    }[];
    education?: {
      institution: string;
      degree: string;
      dates: string;
      location?: string;
    }[];
    skills: string[];
  };
}

export const RESUME_SCHEMA = {
  type: "OBJECT",
  properties: {
    ats_score: { type: "INTEGER" },
    detected_errors: { 
      type: "ARRAY", 
      items: { type: "STRING" } 
    },
    feedback_summary: { type: "STRING" },
    improved_resume: {
      type: "OBJECT",
      properties: {
        full_name: { type: "STRING" },
        summary: { type: "STRING" },
        experience: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              company: { type: "STRING" },
              role_title: { type: "STRING" },
              dates: { type: "STRING" },
              bullet_points: { 
                type: "ARRAY", 
                items: { type: "STRING" } 
              }
            }
          }
        },
        skills: { 
          type: "ARRAY", 
          items: { type: "STRING" } 
        }
      },
      required: ["full_name", "summary", "experience", "skills"]
    }
  },
  required: ["ats_score", "detected_errors", "feedback_summary", "improved_resume"]
};
