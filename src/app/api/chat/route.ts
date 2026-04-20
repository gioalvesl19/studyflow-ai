import { NextResponse } from "next/server";
import { getOpenAIModel, withOpenAIRotation } from "@/lib/server/openai-client";

export const runtime = "nodejs";

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Erro inesperado ao responder no chat.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: IncomingMessage[];
      context?: string;
    };

    const messages = Array.isArray(body.messages)
      ? body.messages
          .filter(
            (item): item is IncomingMessage =>
              !!item &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string" &&
              item.content.trim().length > 0
          )
          .slice(-16)
      : [];

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Envie ao menos uma mensagem para conversar com a IA." },
        { status: 400 }
      );
    }

    const context =
      typeof body.context === "string" && body.context.trim().length > 0
        ? body.context.trim().slice(0, 12_000)
        : "";

    const model = getOpenAIModel();
    const response = await withOpenAIRotation((client) =>
      client.chat.completions.create({
        model,
        temperature: 0.45,
        messages: [
          {
            role: "system",
            content:
              "Você é um tutor paciente e didático. Explique os temas em português do Brasil, " +
              "use passos claros, exemplos e verifique entendimento no final de cada resposta.",
          },
          ...(context
            ? [
                {
                  role: "system" as const,
                  content:
                    "Contexto do material atual do aluno. Use como referência principal:\n" +
                    context,
                },
              ]
            : []),
          ...messages,
        ],
      })
    );

    const answer = response.choices[0]?.message?.content?.trim();

    if (!answer) {
      return NextResponse.json(
        { error: "Não foi possível gerar resposta para o chat." },
        { status: 502 }
      );
    }

    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
