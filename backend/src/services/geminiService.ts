import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

class KeyRotator {
  private keys: string[] = [];
  private currentIndex: number = 0;

  constructor() {
    this.refreshKeys();
  }

  public refreshKeys() {
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    this.keys = rawKeys
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 10 && !k.includes("your_gemini_api_key"));

    if (this.keys.length > 0) {
      console.log(`[KeyRotator] Loaded ${this.keys.length} Gemini API key(s) into active rotation.`);
    } else {
      console.warn("[KeyRotator] No valid Gemini API keys found in environment.");
    }
  }

  public getActiveKey(): string | null {
    if (this.keys.length === 0) return null;
    return this.keys[this.currentIndex % this.keys.length];
  }

  public getMaskedKey(): string {
    const active = this.getActiveKey();
    if (!active) return "Mock Offline Engine";
    return `${active.substring(0, 6)}...${active.substring(active.length - 4)}`;
  }

  public rotateToNextKey(): string | null {
    if (this.keys.length <= 1) return this.getActiveKey();
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    console.warn(`[KeyRotator] 429 quota or rate-limit hit. Rotated to Key Slot #${this.currentIndex + 1} (${this.getMaskedKey()})`);
    return this.getActiveKey();
  }

  public totalKeys(): number {
    return this.keys.length;
  }
}

export class GeminiService {
  private static instance: GeminiService;
  private keyRotator: KeyRotator;
  private modelName: string;

  private constructor() {
    this.keyRotator = new KeyRotator();
    // Strictly load model from environment with gemini-3.1-flash-lite as standard default
    this.modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  }

  public static getInstance(): GeminiService {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService();
    }
    return GeminiService.instance;
  }

  public getModel(apiKey: string, temperature = 0.2) {
    return new ChatGoogleGenerativeAI({
      model: this.modelName,
      apiKey: apiKey,
      temperature,
      maxRetries: 1,
    });
  }

  public getKeyRotator(): KeyRotator {
    return this.keyRotator;
  }

  public getModelName(): string {
    return this.modelName;
  }
}
