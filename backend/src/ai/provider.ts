export interface AiSuggestionRequest {
  ruleId: string;
  ruleTitle: string;
  ruleDescription?: string | null;
  wcagCriteria?: string[] | null;
  platform: string;
  snippet: string;
  failureSummary?: string | null;
}

export interface AiSuggestionResponse {
  markdown: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface AiProvider {
  generateSuggestion(request: AiSuggestionRequest): Promise<AiSuggestionResponse>;
}
