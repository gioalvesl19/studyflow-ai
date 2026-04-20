import OpenAI from "openai";

export interface OpenAIClientEntry {
  client: OpenAI;
  keyLabel: string;
}

let cachedSignature = "";
let cachedEntries: OpenAIClientEntry[] = [];

function maskKey(key: string): string {
  if (key.length < 10) {
    return "***";
  }

  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function parseApiKeys(): string[] {
  const singleKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const listRaw = process.env.OPENAI_API_KEYS?.trim() ?? "";

  const listKeys = listRaw
    .split(/[\n,]+/)
    .map((key) => key.trim())
    .filter((key) => key.length > 0);

  const candidates = [singleKey, ...listKeys].filter((key) => key.length > 0);
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const key of candidates) {
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(key);
    }
  }

  return unique;
}

function shouldTryNextKey(error: unknown): boolean {
  const maybeError = error as { status?: unknown; code?: unknown; message?: unknown } | null;
  const status = typeof maybeError?.status === "number" ? maybeError.status : null;
  const code = typeof maybeError?.code === "string" ? maybeError.code.toLowerCase() : "";
  const message =
    typeof maybeError?.message === "string" ? maybeError.message.toLowerCase() : "";

  if (status && [401, 403, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  if (
    code.includes("rate") ||
    code.includes("auth") ||
    code.includes("timeout") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("insufficient") ||
    message.includes("invalid api key") ||
    message.includes("unauthorized")
  ) {
    return true;
  }

  return false;
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Erro desconhecido";
}

export function getOpenAIClientEntries(): OpenAIClientEntry[] {
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || "";
  const keys = parseApiKeys();

  if (keys.length === 0) {
    throw new Error(
      "Nenhuma chave configurada. Defina OPENAI_API_KEY (ou OPENAI_API_KEYS) no ambiente."
    );
  }

  const signature = `${baseURL}::${keys.join(",")}`;
  if (cachedEntries.length > 0 && cachedSignature === signature) {
    return cachedEntries;
  }

  cachedSignature = signature;
  cachedEntries = keys.map((apiKey) => ({
    client: new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    }),
    keyLabel: maskKey(apiKey),
  }));

  return cachedEntries;
}

export async function withOpenAIRotation<T>(
  operation: (client: OpenAI) => Promise<T>
): Promise<T> {
  const entries = getOpenAIClientEntries();
  const errors: string[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    try {
      return await operation(entry.client);
    } catch (error) {
      const isLast = index === entries.length - 1;
      errors.push(`${entry.keyLabel}: ${errorToMessage(error)}`);

      if (isLast || !shouldTryNextKey(error)) {
        throw error;
      }
    }
  }

  throw new Error(`Todas as chaves falharam: ${errors.join(" | ")}`);
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}
