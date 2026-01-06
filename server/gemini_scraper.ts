import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiScraper {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private apiKey: string = "";

  async init(apiKey: string, modelName: string = "gemini-1.5-pro") {
    this.apiKey = apiKey;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  async extract(prompt: string): Promise<any> {
    if (!this.model) {
      throw new Error("Scraper not initialized. Call init() first.");
    }

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Try to parse as JSON if it looks like JSON
      let parsedData;
      try {
        // Extract JSON from markdown code blocks if present
        const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[1]);
        } else if (text.trim().startsWith('{')) {
          parsedData = JSON.parse(text);
        } else {
          // If not JSON, structure the text response
          parsedData = {
            raw: text,
            nodes: this.extractEntitiesFromText(text),
            edges: []
          };
        }
      } catch (parseError) {
        // If parsing fails, return structured text
        parsedData = {
          raw: text,
          nodes: this.extractEntitiesFromText(text),
          edges: []
        };
      }

      return parsedData;
    } catch (error: any) {
      // Check for rate limiting
      if (error.message?.includes('429') || error.message?.toLowerCase().includes('quota')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw error;
    }
  }

  private extractEntitiesFromText(text: string): any[] {
    // Simple entity extraction - split by lines and create nodes
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    return lines.slice(0, 10).map((line, index) => ({
      id: index + 1,
      label: line.trim().substring(0, 100)
    }));
  }

  async close() {
    // No cleanup needed for API-based approach
    this.genAI = null;
    this.model = null;
  }
}
