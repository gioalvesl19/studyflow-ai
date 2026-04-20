"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatMessage,
  GeneratedStudyPack,
  Notebook,
  StudyMode,
  StudySectionPack,
} from "@/lib/types";

const STORAGE_KEY = "studyflow-platform-v1";

type StudyTab = StudyMode | "chat";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

const INITIAL_CHAT_MESSAGE: ChatMessage = {
  id: "initial-assistant-message",
  role: "assistant",
  content:
    "Oi! Eu sou seu tutor por voz. Selecione um módulo e me pergunte qualquer dúvida do conteúdo.",
};

export default function Home() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [newNotebookName, setNewNotebookName] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [activeTab, setActiveTab] = useState<StudyTab>("summary");
  const [isGenerating, setIsGenerating] = useState(false);
  const [studyError, setStudyError] = useState("");
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [showFlashcardAnswer, setShowFlashcardAnswer] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, number>>({});

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([INITIAL_CHAT_MESSAGE]);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);

  const [isHydrated, setIsHydrated] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const selectedNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === selectedNotebookId) ?? null,
    [notebooks, selectedNotebookId]
  );

  const selectedSection = useMemo(
    () => selectedNotebook?.sections.find((section) => section.id === selectedSectionId) ?? null,
    [selectedNotebook, selectedSectionId]
  );

  const chatContext = useMemo(() => {
    if (!selectedNotebook || !selectedSection) {
      return "";
    }

    const summaryText = selectedSection.summary.sections
      .map((section) => `${section.heading}: ${section.content}`)
      .join("\n");
    const keyPoints = selectedSection.summary.keyPoints.join("; ");

    return [
      `Caderno: ${selectedNotebook.name}`,
      `Tema: ${selectedSection.name}`,
      `Resumo: ${summaryText}`,
      `Pontos-chave: ${keyPoints}`,
    ].join("\n");
  }, [selectedNotebook, selectedSection]);

  const quizScore = useMemo(() => {
    if (!selectedSection) {
      return null;
    }

    const total = selectedSection.questions.length;
    const answered = Object.keys(questionAnswers).length;
    const correct = selectedSection.questions.reduce((accumulator, question, questionIndex) => {
      return questionAnswers[questionIndex] === question.answerIndex ? accumulator + 1 : accumulator;
    }, 0);

    return { total, answered, correct };
  }, [questionAnswers, selectedSection]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as {
        notebooks?: Notebook[];
        selectedNotebookId?: string;
        selectedSectionId?: string;
        chatMessages?: ChatMessage[];
      };

      if (Array.isArray(parsed.notebooks)) {
        setNotebooks(parsed.notebooks);
      }

      if (typeof parsed.selectedNotebookId === "string") {
        setSelectedNotebookId(parsed.selectedNotebookId);
      }

      if (typeof parsed.selectedSectionId === "string") {
        setSelectedSectionId(parsed.selectedSectionId);
      }

      if (Array.isArray(parsed.chatMessages) && parsed.chatMessages.length > 0) {
        setChatMessages(parsed.chatMessages.slice(-24));
      }
    } catch {
      setChatMessages([INITIAL_CHAT_MESSAGE]);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        notebooks,
        selectedNotebookId,
        selectedSectionId,
        chatMessages: chatMessages.slice(-24),
      })
    );
  }, [chatMessages, isHydrated, notebooks, selectedNotebookId, selectedSectionId]);

  useEffect(() => {
    if (notebooks.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedNotebookId("");
      setSelectedSectionId("");
      return;
    }

    const notebookExists = notebooks.some((notebook) => notebook.id === selectedNotebookId);
    if (!notebookExists) {
      setSelectedNotebookId(notebooks[0].id);
      setSelectedSectionId(notebooks[0].sections[0]?.id ?? "");
    }
  }, [notebooks, selectedNotebookId]);

  useEffect(() => {
    if (!selectedNotebook) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedSectionId("");
      return;
    }

    if (selectedNotebook.sections.length === 0) {
      setSelectedSectionId("");
      return;
    }

    const sectionExists = selectedNotebook.sections.some(
      (section) => section.id === selectedSectionId
    );

    if (!sectionExists) {
      setSelectedSectionId(selectedNotebook.sections[0].id);
    }
  }, [selectedNotebook, selectedSectionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlashcardIndex(0);
    setShowFlashcardAnswer(false);
    setQuestionAnswers({});
  }, [selectedSectionId]);

  function handleCreateNotebook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newNotebookName.trim();
    if (!name) {
      return;
    }

    const notebook: Notebook = {
      id: createId(),
      name,
      createdAt: new Date().toISOString(),
      sections: [],
    };

    setNotebooks((previous) => [notebook, ...previous]);
    setSelectedNotebookId(notebook.id);
    setSelectedSectionId("");
    setNewNotebookName("");
  }

  async function handleGenerateStudyPack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStudyError("");

    if (!selectedNotebook) {
      setStudyError("Crie e selecione um caderno antes de gerar os materiais.");
      return;
    }

    const trimmedSectionName = newSectionName.trim();
    if (!trimmedSectionName) {
      setStudyError("Informe um nome para o módulo/tema.");
      return;
    }

    if (uploadedFiles.length === 0) {
      setStudyError("Envie ao menos um arquivo PDF/TXT.");
      return;
    }

    setIsGenerating(true);

    try {
      const formData = new FormData();
      formData.append("notebookName", selectedNotebook.name);
      formData.append("sectionName", trimmedSectionName);
      uploadedFiles.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/study/generate", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as GeneratedStudyPack & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível gerar os materiais.");
      }

      const section: StudySectionPack = {
        id: createId(),
        name: trimmedSectionName,
        createdAt: new Date().toISOString(),
        summary: payload.summary,
        flashcards: payload.flashcards,
        questions: payload.questions,
        sourceFiles: payload.sourceFiles,
      };

      setNotebooks((previous) =>
        previous.map((notebook) => {
          if (notebook.id !== selectedNotebook.id) {
            return notebook;
          }

          const keptSections = notebook.sections.filter(
            (existing) => existing.name.toLowerCase() !== trimmedSectionName.toLowerCase()
          );

          return {
            ...notebook,
            sections: [section, ...keptSections],
          };
        })
      );

      setSelectedSectionId(section.id);
      setActiveTab("summary");
      setNewSectionName("");
      setUploadedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setStudyError(error instanceof Error ? error.message : "Falha ao gerar os materiais.");
    } finally {
      setIsGenerating(false);
    }
  }

  function stopVoiceInput() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }

  function startVoiceInput() {
    setChatError("");

    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

    if (!SpeechRecognition) {
      setChatError("Seu navegador não suporta reconhecimento de voz.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      const normalized = transcript.trim();
      if (!normalized) {
        return;
      }
      setChatInput((previous) => (previous ? `${previous} ${normalized}` : normalized));
    };

    recognition.onerror = () => {
      setChatError("Não foi possível capturar sua voz. Tente novamente.");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  function speakAnswer(text: string) {
    if (!autoSpeak || typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "pt-BR";
    speech.rate = 1;
    speech.pitch = 1;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChatError("");

    const messageText = chatInput.trim();
    if (!messageText || isSendingChat) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: messageText,
    };

    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setChatInput("");
    setIsSendingChat(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          context: chatContext,
        }),
      });

      const payload = (await response.json()) as { answer?: string; error?: string };

      if (!response.ok || !payload.answer) {
        throw new Error(payload.error ?? "Falha ao conversar com a IA.");
      }

      const assistantMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: payload.answer,
      };

      setChatMessages((previous) => [...previous, assistantMessage]);
      speakAnswer(payload.answer);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Erro no chat por voz.");
    } finally {
      setIsSendingChat(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="glass rounded-3xl border p-6 shadow-[0_10px_30px_rgba(13,40,31,0.12)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
            Plataforma de estudos com IA
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">StudyFlow AI</h1>
          <p className="mt-3 max-w-4xl text-sm text-slate-700 md:text-base">
            Crie cadernos, envie documentos PDF/TXT e gere automaticamente{" "}
            <strong>resumos completos</strong>, <strong>flashcards</strong> e{" "}
            <strong>questões de múltipla escolha</strong>. Depois use o chat por voz para tirar
            dúvidas em tempo real.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="glass rounded-3xl border p-5 shadow-[0_8px_22px_rgba(20,35,30,0.12)]">
            <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-700">
              Cadernos
            </h2>

            <form className="mt-4 space-y-2" onSubmit={handleCreateNotebook}>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Novo caderno
              </label>
              <input
                value={newNotebookName}
                onChange={(event) => setNewNotebookName(event.target.value)}
                placeholder="Ex.: Anatomia"
                className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-200"
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                Criar caderno
              </button>
            </form>

            <div className="mt-5 space-y-2">
              {notebooks.length === 0 ? (
                <p className="rounded-xl border border-dashed bg-white/70 px-3 py-4 text-sm text-slate-600">
                  Nenhum caderno criado ainda.
                </p>
              ) : (
                notebooks.map((notebook) => {
                  const isActive = notebook.id === selectedNotebookId;
                  return (
                    <button
                      type="button"
                      key={notebook.id}
                      onClick={() => {
                        setSelectedNotebookId(notebook.id);
                        setActiveTab("summary");
                      }}
                      className={[
                        "w-full rounded-xl border px-3 py-3 text-left transition",
                        isActive
                          ? "border-teal-700 bg-teal-50 shadow"
                          : "bg-white/80 hover:border-teal-300 hover:bg-teal-50/40",
                      ].join(" ")}
                    >
                      <p className="text-sm font-semibold text-slate-900">{notebook.name}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {notebook.sections.length} módulo(s)
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            <section className="glass rounded-3xl border p-5 shadow-[0_8px_22px_rgba(20,35,30,0.12)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Área de materiais
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {selectedNotebook
                      ? `${selectedNotebook.name} > ${selectedSection?.name ?? "Novo módulo"}`
                      : "Selecione um caderno"}
                  </h2>
                </div>
              </div>

              <form className="mt-5 space-y-3 rounded-2xl border bg-white/70 p-4" onSubmit={handleGenerateStudyPack}>
                <p className="text-sm font-semibold text-slate-800">Gerar conteúdo de estudo</p>
                <input
                  value={newSectionName}
                  onChange={(event) => setNewSectionName(event.target.value)}
                  placeholder="Nome do módulo (ex.: Sistema cardiovascular)"
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-200"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.txt,text/plain,application/pdf"
                  onChange={(event) => setUploadedFiles(Array.from(event.target.files ?? []))}
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                />
                <p className="text-xs text-slate-600">
                  Envie até 6 arquivos por vez (PDF/TXT). A IA cria resumo, flashcards e questões.
                </p>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  {isGenerating ? "Gerando materiais..." : "Gerar agora"}
                </button>
                {studyError ? <p className="text-sm text-rose-700">{studyError}</p> : null}
              </form>

              {selectedNotebook && selectedNotebook.sections.length > 0 ? (
                <div className="mt-5 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {selectedNotebook.sections.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => {
                          setSelectedSectionId(section.id);
                          setActiveTab("summary");
                        }}
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                          section.id === selectedSectionId
                            ? "border-teal-700 bg-teal-100 text-teal-900"
                            : "bg-white/80 text-slate-700 hover:border-teal-300 hover:bg-teal-50",
                        ].join(" ")}
                      >
                        {section.name}
                      </button>
                    ))}
                  </div>

                  {selectedSection ? (
                    <div className="rounded-2xl border bg-white/70 p-4">
                      <div className="flex flex-wrap gap-2">
                        {(["summary", "flashcards", "questions"] as StudyMode[]).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={[
                              "rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
                              activeTab === tab
                                ? "bg-slate-900 text-white"
                                : "bg-slate-200/70 text-slate-700 hover:bg-slate-300/70",
                            ].join(" ")}
                          >
                            {tab === "summary"
                              ? "Resumo"
                              : tab === "flashcards"
                              ? "Flashcards"
                              : "Questões"}
                          </button>
                        ))}
                      </div>

                      <p className="mt-3 text-xs text-slate-600">
                        Fonte: {selectedSection.sourceFiles.join(", ")}
                      </p>

                      {activeTab === "summary" ? (
                        <div className="mt-4 space-y-4">
                          <h3 className="text-lg font-bold text-slate-900">
                            {selectedSection.summary.title}
                          </h3>
                          {selectedSection.summary.sections.map((summarySection, index) => (
                            <article key={`${summarySection.heading}-${index}`} className="space-y-1">
                              <h4 className="text-sm font-semibold text-slate-900">
                                {summarySection.heading}
                              </h4>
                              <p className="text-sm leading-6 text-slate-700">
                                {summarySection.content}
                              </p>
                            </article>
                          ))}
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">Pontos-chave</h4>
                            <ul className="mt-2 space-y-2">
                              {selectedSection.summary.keyPoints.map((point, index) => (
                                <li
                                  key={`${point}-${index}`}
                                  className="rounded-xl border bg-white px-3 py-2 text-sm text-slate-700"
                                >
                                  {point}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">Plano de revisão</h4>
                            <ol className="mt-2 space-y-2">
                              {selectedSection.summary.studyPlan.map((step, index) => (
                                <li
                                  key={`${step}-${index}`}
                                  className="rounded-xl border bg-white px-3 py-2 text-sm text-slate-700"
                                >
                                  {index + 1}. {step}
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      ) : null}

                      {activeTab === "flashcards" ? (
                        <div className="mt-4 space-y-3">
                          <div className="rounded-2xl border bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Cartão {flashcardIndex + 1} de {selectedSection.flashcards.length}
                            </p>
                            <h4 className="mt-2 text-sm font-semibold text-slate-900">Frente</h4>
                            <p className="mt-1 text-sm text-slate-700">
                              {selectedSection.flashcards[flashcardIndex]?.front}
                            </p>

                            {showFlashcardAnswer ? (
                              <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
                                <h5 className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                                  Resposta
                                </h5>
                                <p className="mt-1 text-sm text-teal-900">
                                  {selectedSection.flashcards[flashcardIndex]?.back}
                                </p>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setShowFlashcardAnswer((previous) => !previous)}
                              className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                            >
                              {showFlashcardAnswer ? "Ocultar resposta" : "Mostrar resposta"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFlashcardIndex((previous) =>
                                  previous === 0
                                    ? selectedSection.flashcards.length - 1
                                    : previous - 1
                                );
                                setShowFlashcardAnswer(false);
                              }}
                              className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Anterior
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFlashcardIndex(
                                  (previous) => (previous + 1) % selectedSection.flashcards.length
                                );
                                setShowFlashcardAnswer(false);
                              }}
                              className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Próximo
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {activeTab === "questions" ? (
                        <div className="mt-4 space-y-4">
                          {quizScore ? (
                            <div className="rounded-xl border bg-white px-3 py-2 text-sm text-slate-700">
                              Acertos: <strong>{quizScore.correct}</strong> | Respondidas:{" "}
                              <strong>
                                {quizScore.answered}/{quizScore.total}
                              </strong>
                            </div>
                          ) : null}

                          {selectedSection.questions.map((question, questionIndex) => {
                            const selectedOption = questionAnswers[questionIndex];
                            const hasAnswered = typeof selectedOption === "number";
                            return (
                              <article key={`${question.question}-${questionIndex}`} className="space-y-2 rounded-xl border bg-white p-3">
                                <h4 className="text-sm font-semibold text-slate-900">
                                  {questionIndex + 1}. {question.question}
                                </h4>
                                <div className="space-y-2">
                                  {question.options.map((option, optionIndex) => {
                                    const isSelected = selectedOption === optionIndex;
                                    const isCorrect = optionIndex === question.answerIndex;

                                    return (
                                      <button
                                        key={`${option}-${optionIndex}`}
                                        type="button"
                                        onClick={() =>
                                          setQuestionAnswers((previous) => ({
                                            ...previous,
                                            [questionIndex]: optionIndex,
                                          }))
                                        }
                                        className={[
                                          "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                                          hasAnswered && isCorrect
                                            ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                                            : isSelected
                                            ? "border-rose-500 bg-rose-50 text-rose-900"
                                            : "bg-white text-slate-700 hover:bg-slate-50",
                                        ].join(" ")}
                                      >
                                        {option}
                                      </button>
                                    );
                                  })}
                                </div>
                                {hasAnswered ? (
                                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                    <strong>Explicação:</strong> {question.explanation}
                                  </p>
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-5 rounded-xl border border-dashed bg-white/70 px-4 py-8 text-sm text-slate-600">
                  Depois de criar um caderno, envie seus documentos para gerar os materiais.
                </p>
              )}
            </section>

            <section className="glass rounded-3xl border p-5 shadow-[0_8px_22px_rgba(20,35,30,0.12)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Chat por voz
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">Tutor conversacional</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("chat");
                    if (isListening) {
                      stopVoiceInput();
                    } else {
                      startVoiceInput();
                    }
                  }}
                  className={[
                    "rounded-xl px-3 py-2 text-xs font-semibold transition",
                    isListening
                      ? "bg-rose-700 text-white hover:bg-rose-800"
                      : "bg-teal-700 text-white hover:bg-teal-800",
                  ].join(" ")}
                >
                  {isListening ? "Parar microfone" : "Falar agora"}
                </button>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={autoSpeak}
                  onChange={(event) => setAutoSpeak(event.target.checked)}
                />
                Ler respostas em voz alta automaticamente
              </label>

              <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto rounded-2xl border bg-white/70 p-3">
                {chatMessages.map((message) => (
                  <article
                    key={message.id}
                    className={[
                      "max-w-[92%] rounded-xl px-3 py-2 text-sm leading-6",
                      message.role === "assistant"
                        ? "border bg-white text-slate-800"
                        : "ml-auto bg-slate-900 text-white",
                    ].join(" ")}
                  >
                    {message.content}
                  </article>
                ))}
              </div>

              <form className="mt-4 space-y-2" onSubmit={sendChatMessage}>
                <textarea
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Pergunte algo sobre o tema estudado..."
                  rows={3}
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-200"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={isSendingChat}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-500"
                  >
                    {isSendingChat ? "Respondendo..." : "Enviar pergunta"}
                  </button>
                  <button
                    type="button"
                    onClick={isListening ? stopVoiceInput : startVoiceInput}
                    className="rounded-xl border bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {isListening ? "Parar ditado" : "Ditado por voz"}
                  </button>
                </div>
              </form>

              {chatError ? <p className="mt-2 text-sm text-rose-700">{chatError}</p> : null}

              <p className="mt-2 text-xs text-slate-600">
                {activeTab === "chat"
                  ? "Modo conversação ativo."
                  : "Dica: selecione um módulo para respostas mais contextuais."}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
