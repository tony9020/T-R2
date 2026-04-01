import React, { useState, useRef, Component } from 'react';
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  FileText, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowRight,
  RefreshCcw,
  Briefcase,
  Sparkles,
  ShieldCheck,
  Zap,
  Globe,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  ExternalLink,
  Send
} from "lucide-react";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ResumeData } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to get AI instance safely
const getAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "undefined") {
    throw new Error("Gemini API key is missing. Please set GEMINI_API_KEY in your AI Studio environment variables.");
  }
  return new GoogleGenAI({ apiKey: key });
};

// Simple Error Wrapper Component
function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// System instruction for the AI to ensure high-quality, structured output
const SYSTEM_INSTRUCTION = `You are a professional resume writer and ATS optimization expert. 
Your goal is to parse raw resume text and transform it into a high-quality, structured JSON format. 

CRITICAL RULES:
1. Each unique job or professional experience MUST be its own separate object in the 'experience' array. Do not combine multiple roles or companies into a single entry.
2. Each achievement or responsibility MUST be a separate string in the 'bullet_points' array.
3. Follow Harvard Business School standards: use strong action verbs, quantifiable metrics, and clear formatting.
4. If the input text is messy, use your reasoning to identify where one job ends and another begins based on company names, dates, and titles.
5. Ensure all required fields are populated. If a field like 'location' is missing, use an empty string or 'Remote' if implied.`;

const RESUME_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ats_score: { type: Type.INTEGER, description: "A score from 0-100 representing how well the resume matches ATS standards." },
    detected_errors: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "A list of specific issues or missing elements found in the original resume."
    },
    feedback_summary: { type: Type.STRING, description: "A brief professional summary of the improvements made." },
    improved_resume: {
      type: Type.OBJECT,
      properties: {
        full_name: { type: Type.STRING },
        contact_info: {
          type: Type.OBJECT,
          properties: {
            email: { type: Type.STRING },
            phone: { type: Type.STRING },
            location: { type: Type.STRING },
            linkedin: { type: Type.STRING },
            website: { type: Type.STRING }
          }
        },
        summary: { type: Type.STRING, description: "A professional summary statement optimized for the target role." },
        experience: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              company: { type: Type.STRING, description: "The name of the company or organization." },
              role_title: { type: Type.STRING, description: "The specific job title held." },
              dates: { type: Type.STRING, description: "The employment dates (e.g., 'Jan 2020 - Present')." },
              location: { type: Type.STRING, description: "The job location." },
              bullet_points: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "A list of specific achievements and responsibilities, each as a separate string."
              }
            },
            required: ["company", "role_title", "dates", "bullet_points"]
          },
          description: "An array of professional experience entries. Each job MUST be a separate object."
        },
        education: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              institution: { type: Type.STRING },
              degree: { type: Type.STRING },
              dates: { type: Type.STRING },
              location: { type: Type.STRING }
            },
            required: ["institution", "degree", "dates"]
          }
        },
        skills: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "A list of technical and soft skills."
        }
      },
      required: ["full_name", "summary", "experience", "skills"]
    }
  },
  required: ["ats_score", "detected_errors", "feedback_summary", "improved_resume"]
};

export default function App() {
  return (
    <ErrorBoundary>
      <ResumeApp />
    </ErrorBoundary>
  );
}

function ResumeApp() {
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showThankYou, setShowThankYou] = useState(false);
  const [quotaUsed, setQuotaUsed] = useState(0);
  const [lastQuotaReset, setLastQuotaReset] = useState<Date | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setElapsedTime(0);
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const isTxt = selectedFile.type === "text/plain" || selectedFile.name.toLowerCase().endsWith(".txt");
      const isDocx = 
        selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
        selectedFile.name.toLowerCase().endsWith(".docx");
      
      console.log("File selected:", selectedFile.name, "Type:", selectedFile.type);

      if (!isTxt && !isDocx) {
        setError(`Unsupported file type (${selectedFile.type || 'unknown'}). Please upload a .txt or .docx file.`);
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  // Helper function for FormData approach
  const extractTextFormData = async (file: File): Promise<string> => {
    console.log("🔄 Using FormData fallback method...");
    
    const formData = new FormData();
    formData.append("file", file);
    
    console.log("📋 FormData entries:");
    for (let [key, value] of formData.entries()) {
      if (value instanceof File) {
        console.log(`  ${key}:`, value.name, value.type, value.size);
      } else {
        console.log(`  ${key}:`, value);
      }
    }
    
    console.log("🚀 Sending request to /api/extract-text (FormData fallback)");
    const response = await fetch("/api/extract-text", {
      method: "POST",
      body: formData,
    });
    
    console.log("📡 Response status:", response.status);
    console.log("📡 Response headers:", Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown server error" }));
      console.error("❌ Server error response:", errorData);
      throw new Error(errorData.error || `Server responded with ${response.status}`);
    }
    
    const data = await response.json();
    console.log("✅ Extraction successful, text length:", data.text?.length);
    return data.text;
  };

  const extractText = async (file: File): Promise<string> => {
    if (file.name.toLowerCase().endsWith(".docx") || file.type.includes("wordprocessingml")) {
      console.log("=== DOCX EXTRACTION ===");
      console.log("File name:", file.name);
      console.log("File type:", file.type);
      console.log("File size:", file.size);
      console.log("Current URL:", window.location.href);
      
      // Detect if we're running on Vercel or locally
      const isVercel = window.location.hostname.includes('vercel.app') || 
                     window.location.hostname.includes('.vercel.app') ||
                     !window.location.hostname.includes('localhost');
      
      console.log("🌐 Environment:", isVercel ? "Vercel (serverless)" : "Local (Express)");
      
      // Test if serverless functions are available (only on Vercel)
      if (isVercel) {
        try {
          console.log("🔍 Testing serverless function availability...");
          const testResponse = await fetch("/api/test");
          if (!testResponse.ok) {
            throw new Error("Serverless functions not available");
          }
          const testData = await testResponse.json();
          console.log("✅ Serverless test successful:", testData);
        } catch (testError) {
          console.error("❌ Serverless functions not available, falling back to FormData:", testError);
          // Fallback to FormData approach even on Vercel
          return await extractTextFormData(file);
        }
      }
      
      try {
        if (isVercel) {
          // Vercel serverless approach - use base64 JSON
          console.log("🔄 Using Vercel serverless approach (base64 JSON)...");
          
          const base64File = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              console.log("✅ FileReader result type:", typeof result);
              console.log("✅ FileReader result length:", result.length);
              console.log("📝 First 100 chars of base64:", result.substring(0, 100));
              resolve(result);
            };
            reader.onerror = (error) => {
              console.error("❌ FileReader error:", error);
              reject(error);
            };
            reader.readAsDataURL(file);
          });
          
          console.log("🚀 Sending request to /api/extract-text (Vercel)");
          
          const requestBody = {
            file: base64File,
            name: file.name,
            type: file.type,
            size: file.size
          };
          
          console.log("📋 Request body structure:", {
            hasFile: !!requestBody.file,
            fileLength: requestBody.file.length,
            name: requestBody.name,
            type: requestBody.type,
            size: requestBody.size
          });
          
          const response = await fetch("/api/extract-text", {
            method: "POST",
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
          
          console.log("📡 Response status:", response.status);
          console.log("📡 Response headers:", Object.fromEntries(response.headers.entries()));
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Unknown server error" }));
            console.error("❌ Server error response:", errorData);
            throw new Error(errorData.error || `Server responded with ${response.status}`);
          }
          
          const data = await response.json();
          console.log("✅ Extraction successful, text length:", data.text?.length);
          return data.text;
          
        } else {
          // Local Express approach - use FormData
          console.log("🔄 Using local Express approach (FormData)...");
          
          const formData = new FormData();
          formData.append("file", file);
          
          console.log("📋 FormData entries:");
          for (let [key, value] of formData.entries()) {
            if (value instanceof File) {
              console.log(`  ${key}:`, value.name, value.type, value.size);
            } else {
              console.log(`  ${key}:`, value);
            }
          }
          
          console.log("🚀 Sending request to /api/extract-text (Local)");
          const response = await fetch("/api/extract-text", {
            method: "POST",
            body: formData,
          });
          
          console.log("📡 Response status:", response.status);
          console.log("📡 Response headers:", Object.fromEntries(response.headers.entries()));
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Unknown server error" }));
            console.error("❌ Server error response:", errorData);
            throw new Error(errorData.error || `Server responded with ${response.status}`);
          }
          
          const data = await response.json();
          console.log("✅ Extraction successful, text length:", data.text?.length);
          return data.text;
        }
      } catch (err: any) {
        console.error("❌ Extraction Error:", err);
        console.error("❌ Error stack:", err.stack);
        throw new Error(`Failed to read .docx file: ${err.message}. Try converting it to .txt first.`);
      }
    }
    return await file.text();
  };

  const optimizeResume = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const text = await extractText(file);
      const contents = [{ text: `Original Resume Text:\n${text}` }];

      const ai = getAI();
      const roleContext = selectedRoles.length > 0 ? `Target Roles: ${selectedRoles.join(', ')}. ` : '';
      const promptText = instructions.trim() 
        ? `${roleContext}Optimize this resume based on these instructions: "${instructions}". 
           Ensure it follows the Harvard Business School resume standard:
           - Use strong action verbs to start bullet points.
           - Include quantifiable metrics and achievements.
           - Fix ATS parsing errors.
           - Return the full updated JSON structure.`
        : `${roleContext}Optimize this resume for Global ATS compatibility and Harvard Business School standards.
           - Use strong action verbs to start bullet points.
           - Include quantifiable metrics and achievements.
           - Fix formatting and ATS parsing errors.
           - Return the full updated JSON structure.`;

      contents.push({ text: promptText });

      // Add retry logic for Gemini API
      const maxRetries = 3;
      const retryDelay = 2000; // 2 seconds
      
      let response;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🤖 AI optimization attempt ${attempt}/${maxRetries}...`);
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Request timed out after 10 minutes.")), 600000)
          );

          const aiPromise = ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: { parts: contents },
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
              responseMimeType: "application/json",
              responseSchema: RESUME_SCHEMA as any,
            },
          });

          response = await Promise.race([aiPromise, timeoutPromise]) as any;
          
          if (!response.text) {
            throw new Error("No response from AI");
          }
          
          console.log("✅ AI optimization successful");
          break; // Success, exit retry loop
          
        } catch (error: any) {
          console.error(`❌ AI optimization attempt ${attempt} failed:`, error);
          
          // Check if it's a rate limiting error
          if (error.message?.includes("503") || error.message?.includes("high demand") || error.message?.includes("UNAVAILABLE")) {
            if (attempt < maxRetries) {
              console.log(`⏳ Retrying in ${retryDelay}ms... (attempt ${attempt + 1}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Request timed out after 10 minutes.")), 600000)
    );
        { text: `${roleContext}Refine this resume with these changes: "${editInstructions}". 
                 Strictly maintain Global ATS optimization and Harvard Business School styling standards. 
                 Ensure bullet points start with action verbs and include metrics.
                 Return the full updated JSON structure.` }
      ];

      const aiPromise = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: contents },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: "application/json",
          responseSchema: RESUME_SCHEMA as any,
        },
      });

      const response = await aiPromise as any;
      if (!response.text) throw new Error("No response from AI");

      let text = response.text;
      // Extract JSON if wrapped in markdown
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      }

      const parsed = JSON.parse(text);
      // Handle cases where AI might only return the improved_resume object
      const newData = parsed.improved_resume ? parsed : { 
        ...result, 
        improved_resume: parsed 
      };

      // Show thank you popup just before setting the result
      showThankYouPopup();
      
      // Update quota usage on successful completion
      updateQuotaUsage();
      
      // Set result after a brief delay to let the popup show first
      setTimeout(() => {
        setResult(newData as ResumeData);
        setEditInstructions('');
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 100);
    } catch (err: any) {
      console.error("Refinement Error:", err);
      setError("Failed to refine resume. Please ensure your instructions are clear and try again.");
    } finally {
      setIsRefining(false);
    }
  };

  const maxOptimize = async () => {
    if (!result || isMaxOptimized) return;
    
    setIsMaxOptimizing(true);
    setError(null);
    setPreviousResult(result);
    
    try {
      const ai = getAI();
      const contents = [
        { text: `Current Resume Data: ${JSON.stringify(result.improved_resume)}` },
        { text: `Perform a MAXIMUM ATS optimization on this resume. 
                 - Rewrite every bullet point to be extremely impactful using the Google XYZ formula (Accomplished [X] as measured by [Y], by doing [Z]).
                 - Ensure 100% keyword alignment for high-level professional roles.
                 - Use advanced professional vocabulary.
                 - Maximize quantifiable metrics.
                 - Ensure perfect structural alignment for ATS parsers.
                 Return the full updated JSON structure with an updated ats_score (aim for 95-100).` }
      ];

      const aiPromise = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: contents },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: "application/json",
          responseSchema: RESUME_SCHEMA as any,
        },
      });

      const response = await aiPromise as any;
      if (!response.text) throw new Error("No response from AI");

      const parsed = JSON.parse(response.text);
      // Show thank you popup just before setting the result
      showThankYouPopup();
      
      // Update quota usage on successful completion
      updateQuotaUsage();
      
      // Set result after a brief delay to let the popup show first
      setTimeout(() => {
        setResult(parsed as ResumeData);
        setIsMaxOptimized(true);
      }, 100);
    } catch (err: any) {
      console.error("Max Optimization Error:", err);
      setError("Failed to perform Max Optimization. Please try again.");
    } finally {
      setIsMaxOptimizing(false);
    }
  };

  const undoMaxOptimize = () => {
    if (previousResult) {
      setResult(previousResult);
      setPreviousResult(null);
      setIsMaxOptimized(false);
    }
  };

  const downloadTxt = () => {
    if (!result) return;
    const resume = result.improved_resume;
    let text = `${resume.full_name?.toUpperCase()}\n`;
    text += `${resume.contact_info?.email || ''} | ${resume.contact_info?.phone || ''} | ${resume.contact_info?.location || ''}\n`;
    if (resume.contact_info?.linkedin) text += `LinkedIn: ${resume.contact_info.linkedin}\n`;
    if (resume.contact_info?.website) text += `Website: ${resume.contact_info.website}\n`;
    text += `\nSUMMARY\n${resume.summary}\n\n`;
    
    text += `EXPERIENCE\n`;
    resume.experience?.forEach(exp => {
      text += `${exp.company?.toUpperCase()} | ${exp.location}\n`;
      text += `${exp.role_title} | ${exp.dates}\n`;
      exp.bullet_points?.forEach(bullet => {
        text += `• ${bullet}\n`;
      });
      text += `\n`;
    });

    text += `EDUCATION\n`;
    resume.education?.forEach(edu => {
      text += `${edu.institution?.toUpperCase()} | ${edu.location}\n`;
      text += `${edu.degree} | ${edu.dates}\n\n`;
    });

    text += `SKILLS\n`;
    text += resume.skills?.join(', ') || '';

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resume.full_name?.replace(/\s+/g, '_')}_Resume.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadDocx = async () => {
    if (!result) return;
    setIsDownloadingDocx(true);
    setError(null);
    
    try {
      const response = await fetch("/api/generate-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ improved_resume: result.improved_resume }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to generate document" }));
        throw new Error(errorData.error);
      }

      const blob = await response.blob();
      const fileName = `${result.improved_resume.full_name?.replace(/\s+/g, "_")}_Resume.docx`;
      
      // Robust download for mobile
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      // Show thank you popup just before setting the result
      showThankYouPopup();
      
      // Update quota usage on successful completion
      updateQuotaUsage();
      
      // Set result after a brief delay to let the popup show first
      setTimeout(() => {
        setResult(data);
      }, 100);
      
      // Cleanup with delay for mobile browsers
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
      
    } catch (err: any) {
      console.error("Download Error:", err);
      setError(`Download failed: ${err.message}. If you are on mobile, try opening the app in a new tab.`);
    } finally {
      setIsDownloadingDocx(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink font-sans selection:bg-accent/20 selection:text-ink">
      {/* Floating Navigation */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-4xl">
        <motion.div 
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="glass-card rounded-2xl px-6 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center neon-glow">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-black text-xl tracking-tighter uppercase"> T - Resume AI </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-widest text-ink/40">
            <a href="#" className="hover:text-ink transition-colors">Analysis</a>
            <a href="#" className="hover:text-ink transition-colors">Templates</a>
            <a href="#" className="hover:text-ink transition-colors">Enterprise</a>
          </div>
          <button className="bg-ink text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-ink/90 transition-all active:scale-95">
            Get Started
          </button>
        </motion.div>
      </nav>

      <main className="pt-24 pb-20 px-6 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div 
              key="hero"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto text-center space-y-8"
            >
              <div className="space-y-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/5 border border-accent/10 text-accent text-[10px] font-black uppercase tracking-widest"
                >
                  <Zap className="w-3 h-3 fill-current" />
                  AI-Powered ATS Optimization
                </motion.div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.85] uppercase text-ink">
                  Your Resume,<br />
                  <span className="text-accent">Perfected.</span>
                </h1>
                <p className="text-base md:text-lg text-ink/40 max-w-2xl mx-auto font-medium leading-relaxed">
                  Transform your professional story into a high-conversion, ATS-optimized masterpiece in seconds.
                </p>
              </div>

              <div className="grid md:grid-cols-12 gap-6 items-start">
                {/* Upload Bento Box */}
                <div className="md:col-span-7 space-y-6">
                  <motion.div 
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "glass-card rounded-[40px] p-10 border-2 border-dashed transition-all cursor-pointer group relative overflow-hidden",
                      file ? "border-accent/30 bg-accent/5" : "border-black/5 hover:border-black/10"
                    )}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      accept=".txt,.docx"
                    />
                    <div className="relative z-10 flex flex-col items-center gap-4">
                      <div className={cn(
                        "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500",
                        file ? "bg-accent text-white neon-glow scale-110" : "bg-black/5 text-ink/30 group-hover:bg-black/10 group-hover:text-ink"
                      )}>
                        {file ? <CheckCircle2 className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-bold tracking-tight text-ink">
                          {file ? file.name : "Drop your resume here"}
                        </h3>
                        <p className="text-ink/30 font-bold text-[10px] uppercase tracking-widest">TXT or DOCX files only up to 10MB</p>
                      </div>
                    </div>
                    <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-accent/5 blur-[100px] rounded-full" />
                  </motion.div>

                  <div className="glass-card rounded-[32px] p-8 space-y-4 text-left">
                    <label className="text-[10px] font-black text-ink/20 uppercase tracking-widest flex items-center gap-2">
                      <Briefcase className="w-3 h-3" />
                      Target Role or Instructions
                    </label>
                    <textarea 
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="e.g., 'Optimize for a Senior Product Design role at a fintech startup...'"
                      className="w-full bg-black/5 border border-black/5 rounded-2xl p-5 text-ink placeholder:text-ink/20 outline-none focus:border-accent/30 transition-all resize-none min-h-[120px] font-medium text-sm"
                    />
                  </div>
                </div>

                {/* Action Bento Box */}
                <div className="md:col-span-5 space-y-6 h-full">
                  <div className="glass-card rounded-[40px] p-8 h-full flex flex-col justify-between relative overflow-hidden group">
                    <div className="space-y-6 relative z-10">
                      <div className="w-12 h-12 bg-black/5 rounded-2xl flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6 text-accent" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold tracking-tight text-ink">Ready to launch?</h3>
                        <p className="text-sm text-ink/40 font-medium leading-relaxed">
                          Our AI will analyze 50+ ATS parameters to ensure your resume passes every filter.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-4">
                          {["Designer", "Developer", "Analyst", "Manager", "Engineer", "Marketer"].map((role) => {
                            const isSelected = selectedRoles.includes(role);
                            return (
                              <button
                                key={role}
                                onClick={() => {
                                  setSelectedRoles(prev => 
                                    prev.includes(role) 
                                      ? prev.filter(r => r !== role) 
                                      : [...prev, role]
                                  );
                                }}
                                className={cn(
                                  "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border",
                                  isSelected
                                    ? "bg-accent border-accent text-white shadow-lg shadow-accent/20 scale-105"
                                    : "bg-black/5 border-black/5 text-ink/40 hover:bg-black/10 hover:text-ink"
                                )}
                              >
                                {role}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-12 space-y-4 relative z-10">
                      {loading ? (
                        <div className="w-full bg-accent text-white p-6 rounded-3xl font-bold flex flex-col items-center gap-3 neon-glow">
                          <div className="flex items-center gap-3">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span className="text-lg uppercase tracking-tighter font-black">Analyzing...</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-white"
                              initial={{ width: "0%" }}
                              animate={{ width: "100%" }}
                              transition={{ duration: 60, ease: "linear" }}
                            />
                          </div>
                          <span className="text-[10px] uppercase tracking-widest opacity-60 font-black">
                            {elapsedTime}s elapsed
                          </span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setLoading(false); }}
                            className="text-[10px] font-black text-white/50 hover:text-white underline transition-colors uppercase tracking-widest"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={optimizeResume}
                          disabled={!file}
                          className="w-full bg-ink text-white p-6 rounded-3xl font-black text-xl uppercase tracking-tighter flex items-center justify-center gap-3 hover:bg-accent hover:text-white transition-all active:scale-[0.98] disabled:opacity-20 disabled:cursor-not-allowed group/btn"
                        >
                          Optimize Now
                          <ArrowRight className="w-6 h-6 group-hover/btn:translate-x-1 transition-transform" />
                        </button>
                      )}

                      {error && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl text-red-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-3"
                        >
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          {error}
                        </motion.div>
                      )}
                    </div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-[60px] rounded-full group-hover:bg-accent/10 transition-all duration-700" />
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Header Actions */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setResult(null)}
                    className="w-14 h-14 glass-card rounded-2xl flex items-center justify-center hover:bg-black/5 transition-all active:scale-90"
                  >
                    <RefreshCcw className="w-6 h-6 text-ink" />
                  </button>
                  <div>
                    <h2 className="text-4xl font-black tracking-tighter uppercase leading-none text-ink">Optimization Report</h2>
                    <p className="text-ink/40 text-[10px] font-black uppercase tracking-widest mt-1">Generated in {elapsedTime}s</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={downloadTxt}
                    className="bg-ink/5 text-ink px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-2 hover:bg-ink/10 transition-all active:scale-95"
                  >
                    <FileText className="w-5 h-5" />
                    TXT
                  </button>
                  <button 
                    onClick={downloadDocx}
                    disabled={isDownloadingDocx}
                    className="bg-accent text-white px-10 py-5 rounded-3xl font-black text-xl uppercase tracking-tighter flex items-center gap-3 neon-glow hover:scale-105 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isDownloadingDocx ? <Loader2 className="w-6 h-6 animate-spin" /> : <Download className="w-6 h-6" />}
                    Export DOCX
                  </button>
                </div>
              </div>

              {/* Bento Results Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Score Card */}
                <div className="md:col-span-4 space-y-6">
                  <div className="glass-card rounded-[40px] p-10 flex flex-col items-center justify-center text-center relative overflow-hidden">
                    <div className="relative z-10 space-y-6">
                      <h3 className="text-[10px] font-black text-ink/30 uppercase tracking-widest">ATS Compatibility</h3>
                      <div className="relative w-56 h-56">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="112" cy="112" r="100" stroke="currentColor" strokeWidth="16" fill="transparent" className="text-black/5" />
                          <motion.circle 
                            cx="112" cy="112" r="100" stroke="currentColor" strokeWidth="16" fill="transparent" 
                            strokeDasharray={628.3}
                            initial={{ strokeDashoffset: 628.3 }}
                            animate={{ strokeDashoffset: 628.3 - (628.3 * result.ats_score) / 100 }}
                            transition={{ duration: 2, ease: "easeOut" }}
                            className={cn(
                              "transition-all duration-1000",
                              result.ats_score > 80 ? "text-green-600" : result.ats_score > 60 ? "text-yellow-600" : "text-red-600"
                            )}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-7xl font-black tracking-tighter text-ink">{result.ats_score}</span>
                          <span className="text-[10px] font-black text-ink/30 uppercase tracking-widest">SCORE</span>
                        </div>
                      </div>
                    </div>
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-accent/5 blur-[80px] rounded-full" />
                  </div>

                  {/* Max Optimize CTA */}
                  <div className="space-y-3">
                    <div className="relative">
                      <button 
                        onClick={maxOptimize}
                        disabled={isMaxOptimized || isMaxOptimizing}
                        className={cn(
                          "w-full p-6 rounded-[32px] font-black text-lg uppercase tracking-tighter flex items-center justify-center gap-3 transition-all relative overflow-hidden group/max",
                          isMaxOptimized 
                            ? "bg-green-500/10 text-green-600 border border-green-500/20 cursor-not-allowed" 
                            : "bg-accent text-white neon-glow hover:scale-[1.02] active:scale-[0.98]"
                        )}
                      >
                        {isMaxOptimizing ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : isMaxOptimized ? (
                          <>
                            <CheckCircle2 className="w-6 h-6" />
                            Max Optimized
                          </>
                        ) : (
                          <>
                            <Zap className="w-6 h-6 fill-current" />
                            Max Optimize
                          </>
                        )}
                        {!isMaxOptimized && !isMaxOptimizing && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/max:animate-shimmer" />
                        )}
                      </button>

                      {isMaxOptimized && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={undoMaxOptimize}
                          className="absolute -top-2 -right-2 w-8 h-8 bg-ink text-white rounded-full flex items-center justify-center hover:bg-accent transition-all shadow-xl z-20"
                          title="Undo Max Optimization"
                        >
                          <RefreshCcw className="w-4 h-4" />
                        </motion.button>
                      )}
                    </div>
                    <p className="text-[9px] font-medium text-ink/30 text-center italic">
                      *the contents might change please review before exporting.
                    </p>
                  </div>

                  {/* Iterative Refinement Input */}
                  <div className="glass-card rounded-[32px] p-8 space-y-4">
                    <label className="text-[10px] font-black text-ink/20 uppercase tracking-widest flex items-center gap-2">
                      <RefreshCcw className="w-3 h-3" />
                      Refine Results
                    </label>
                    <div className="relative">
                      <textarea 
                        value={editInstructions}
                        onChange={(e) => setEditInstructions(e.target.value)}
                        placeholder="e.g., 'Make the summary more aggressive' or 'Add Python to skills'..."
                        className="w-full bg-black/5 border border-black/5 rounded-2xl p-4 pr-12 text-ink placeholder:text-ink/20 outline-none focus:border-accent/30 transition-all resize-none min-h-[100px] text-xs font-medium"
                      />
                      <button 
                        onClick={reOptimizeResume}
                        disabled={isRefining || !editInstructions.trim()}
                        className="absolute bottom-4 right-4 w-10 h-10 bg-accent text-white rounded-xl flex items-center justify-center neon-glow hover:scale-110 transition-all active:scale-90 disabled:opacity-20 disabled:scale-100"
                      >
                        {isRefining ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Feedback Card */}
                <div className="md:col-span-8 glass-card rounded-[40px] p-12 space-y-10">
                  <div className="space-y-4">
                    <h3 className="text-3xl font-bold tracking-tight flex items-center gap-3 text-ink">
                      <Sparkles className="w-8 h-8 text-accent" />
                      Expert Analysis
                    </h3>
                    <p className="text-ink/60 font-medium text-lg leading-relaxed italic">
                      "{result.feedback_summary}"
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <h4 className="text-[10px] font-black text-ink/20 uppercase tracking-widest">Critical Improvements</h4>
                      <div className="space-y-4">
                        {result.detected_errors?.map((err, i) => (
                          <div key={i} className="flex items-start gap-4 p-5 bg-black/5 rounded-3xl text-xs font-medium border border-black/5 hover:bg-black/10 transition-colors text-ink">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            {err}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <h4 className="text-[10px] font-black text-ink/20 uppercase tracking-widest">Key Strengths</h4>
                      <div className="space-y-4">
                        {result.improved_resume?.skills?.slice(0, 4).map((skill, i) => (
                          <div key={i} className="flex items-center gap-4 p-5 bg-accent/5 rounded-3xl text-xs font-black border border-accent/10 text-accent uppercase tracking-widest">
                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                            {skill}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Preview Card */}
                <div className="md:col-span-12 glass-card rounded-[48px] overflow-hidden group">
                  <div className="bg-black/5 px-10 py-6 border-b border-black/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/20" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                        <div className="w-3 h-3 rounded-full bg-green-500/20" />
                      </div>
                      <span className="text-[10px] font-black text-ink/20 uppercase tracking-widest">Harvard Standard Preview</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-black text-accent uppercase tracking-widest">
                      <Globe className="w-4 h-4" />
                      Optimized for Global ATS
                    </div>
                  </div>
                  
                  <div className="p-12 md:p-24 bg-white text-black font-serif min-h-[1000px] shadow-sm relative">
                    {/* Harvard Style Resume Content */}
                    <div className="max-w-3xl mx-auto space-y-10">
                      <div className="text-center space-y-4">
                        <h1 className="text-5xl font-bold tracking-tight uppercase">{result.improved_resume.full_name}</h1>
                        <div className="text-[12px] flex flex-wrap justify-center gap-4 text-gray-600 font-bold uppercase tracking-wider">
                          {result.improved_resume.contact_info?.phone && (
                            <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {result.improved_resume.contact_info.phone}</span>
                          )}
                          {result.improved_resume.contact_info?.email && (
                            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {result.improved_resume.contact_info.email}</span>
                          )}
                          {result.improved_resume.contact_info?.location && (
                            <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {result.improved_resume.contact_info.location}</span>
                          )}
                          {result.improved_resume.contact_info?.linkedin && (
                            <span className="flex items-center gap-1.5"><Linkedin className="w-3.5 h-3.5" /> LinkedIn</span>
                          )}
                          {result.improved_resume.contact_info?.website && (
                            <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Website</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="border-b-2 border-black pb-1.5">
                          <h2 className="text-sm font-black uppercase tracking-[0.2em]">Summary</h2>
                        </div>
                        <p className="text-[14px] leading-relaxed text-justify">
                          {result.improved_resume.summary}
                        </p>
                      </div>

                      <div className="space-y-8">
                        <div className="border-b-2 border-black pb-1.5">
                          <h2 className="text-sm font-black uppercase tracking-[0.2em]">Work Experience</h2>
                        </div>
                        <div className="space-y-6">
                          {result.improved_resume?.experience?.map((job, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between items-baseline">
                                <h3 className="font-bold text-[15px] uppercase tracking-tight">{job.company}</h3>
                                <span className="text-[12px] font-bold uppercase tracking-wider">{job.location}</span>
                              </div>
                              <div className="flex justify-between items-baseline">
                                <span className="italic text-[13px] text-gray-800">{job.role_title}</span>
                                <span className="text-[11px] font-bold uppercase tracking-widest">{job.dates}</span>
                              </div>
                              <ul className="list-disc list-outside ml-5 space-y-1 mt-1">
                                {job.bullet_points?.map((bullet, j) => (
                                  <li key={j} className="text-[13px] leading-snug pl-1">{bullet}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>

                      {result.improved_resume.education && result.improved_resume.education.length > 0 && (
                        <div className="space-y-6">
                          <div className="border-b-2 border-black pb-1.5">
                            <h2 className="text-sm font-black uppercase tracking-[0.2em]">Education</h2>
                          </div>
                          <div className="space-y-5">
                            {result.improved_resume?.education?.map((edu, i) => (
                              <div key={i} className="space-y-1">
                                <div className="flex justify-between items-baseline">
                                  <h3 className="font-bold text-[15px] uppercase tracking-tight">{edu.institution}</h3>
                                  <span className="text-[12px] font-bold uppercase tracking-wider">{edu.location}</span>
                                </div>
                                <div className="flex justify-between items-baseline">
                                  <span className="italic text-[13px] text-gray-800">{edu.degree}</span>
                                  <span className="text-[11px] font-bold uppercase tracking-widest">{edu.dates}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div className="border-b-2 border-black pb-1.5">
                          <h2 className="text-sm font-black uppercase tracking-[0.2em]">Skills & Expertise</h2>
                        </div>
                        <p className="text-[13px] leading-relaxed font-medium uppercase tracking-wide">
                          {result.improved_resume?.skills?.join(" • ")}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-black/5 py-16 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="flex items-center gap-3 opacity-30">
            <Sparkles className="w-5 h-5 text-ink" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-ink">AI Engine v3.1 Pro</span>
          </div>
          <div className="flex gap-12 text-[10px] font-black text-ink/20 uppercase tracking-[0.2em]">
            <a href="#" className="hover:text-ink transition-colors">Privacy</a>
            <a href="#" className="hover:text-ink transition-colors">Terms</a>
            <a href="#" className="hover:text-ink transition-colors">Security</a>
          </div>
          <p className="text-[10px] font-black text-ink/10 uppercase tracking-[0.2em]">
            © 2026  T - Resume AI . All rights reserved.
          </p>
        </div>
        <div className="max-w-7xl mx-auto mt-8 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-purple-500/20">
            A Tony Christopher Official fun project
          </p>
        </div>
      </footer>
    </div>
  );
}
