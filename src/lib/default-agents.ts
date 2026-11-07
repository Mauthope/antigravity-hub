// Clean state - No pre-created agents. The user adds their own agents via upload or GitHub.

export interface BuiltinAgent {
  name: string;
  fileName: string;
  content: string;
}

export const DEFAULT_AGENTS: BuiltinAgent[] = [];
