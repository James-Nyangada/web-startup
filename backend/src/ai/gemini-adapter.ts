import type { AiProvider, AiSuggestionRequest, AiSuggestionResponse } from './provider.js';
import { buildAiPrompt, scrubHtmlSnippet, validateAiOutput } from './scrubber.js';

export interface GeminiAdapterOptions {
  apiKey?: string;
  model?: string;
  mockMode?: boolean;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export class GeminiAdapter implements AiProvider {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly mockMode: boolean;

  constructor(options: GeminiAdapterOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.model = options.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.mockMode = options.mockMode ?? (!this.apiKey || process.env.NODE_ENV === 'test');
  }

  async generateSuggestion(request: AiSuggestionRequest): Promise<AiSuggestionResponse> {
    const scrubbedSnippet = scrubHtmlSnippet(request.snippet);
    const prompt = buildAiPrompt({
      ruleId: request.ruleId,
      ruleTitle: request.ruleTitle,
      ruleDescription: request.ruleDescription,
      wcagCriteria: request.wcagCriteria,
      platform: request.platform,
      scrubbedSnippet,
      failureSummary: request.failureSummary,
    });

    if (this.mockMode || !this.apiKey) {
      return this.generateMockResponse(request, scrubbedSnippet);
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 800,
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Gemini API error (HTTP ${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as GeminiResponse;
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text ?? '';
      const tokensIn = data.usageMetadata?.promptTokenCount ?? Math.ceil(prompt.length / 4);
      const tokensOut = data.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4);

      const validation = validateAiOutput(text);
      return {
        markdown: validation.markdown,
        model: this.model,
        tokensIn,
        tokensOut,
      };
    } catch {
      // In case of transient provider failure, fallback to intelligent deterministic suggestion
      return this.generateMockResponse(request, scrubbedSnippet);
    }
  }

  private generateMockResponse(
    request: AiSuggestionRequest,
    scrubbed: string,
  ): AiSuggestionResponse {
    const rule = request.ruleId.toLowerCase();
    const platform = request.platform.toLowerCase();
    let lang = 'html';
    if (platform === 'shopify') lang = 'liquid';
    else if (platform === 'wordpress') lang = 'html';

    let codeFix = scrubbed;
    let explanation: string;

    if (rule.includes('image-alt') || rule.includes('alt')) {
      if (codeFix.includes('alt=')) {
        codeFix = codeFix.replace(/alt=(["']).*?\1/i, 'alt="Descriptive text for this image"');
      } else {
        codeFix = codeFix.replace(/<img\b/i, '<img alt="Descriptive text for this image"');
      }
      explanation =
        'Add a meaningful, descriptive `alt` attribute describing the content and context of the image.';
    } else if (rule.includes('color-contrast')) {
      codeFix = codeFix.replace(/(style=(["']))/i, '$1color: #111827; background-color: #ffffff; ');
      if (!codeFix.includes('style=')) {
        codeFix = codeFix.replace(
          /<([a-z0-9]+)\b/i,
          '<$1 style="color: #111827; background-color: #ffffff;"',
        );
      }
      explanation =
        'Increase the contrast ratio between foreground text and background to at least 4.5:1 for normal text.';
    } else if (rule.includes('button-name') || rule.includes('link-name')) {
      if (codeFix.includes('aria-label=')) {
        codeFix = codeFix.replace(/aria-label=(["']).*?\1/i, 'aria-label="Action description"');
      } else {
        codeFix = codeFix.replace(/<(button|a)\b/i, '<$1 aria-label="Action description"');
      }
      explanation =
        'Provide an accessible name using an `aria-label` or visible text content so screen reader users understand the target or action.';
    } else if (rule.includes('label')) {
      codeFix =
        `<label for="field-id">Field Label</label>\n` +
        codeFix.replace(/<input\b/i, '<input id="field-id"');
      explanation =
        'Explicitly associate an accessible `<label>` element with the input via matching `for` and `id` attributes.';
    } else {
      codeFix = codeFix.replace(/<([a-z0-9]+)\b/i, '<$1 aria-label="Accessible element"');
      explanation =
        'Ensure this interactive element has an accessible name and valid semantic role.';
    }

    const markdown = `${explanation}\n\n\`\`\`${lang}\n${codeFix}\n\`\`\``;

    return {
      markdown,
      model: `${this.model}-mock`,
      tokensIn: Math.ceil(scrubbed.length / 4) + 50,
      tokensOut: Math.ceil(markdown.length / 4),
    };
  }
}
