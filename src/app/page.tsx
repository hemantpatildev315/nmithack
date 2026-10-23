"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";

interface TestCase {
  id: string;
  name: string;
  input: string;
  expectedOutput: string;
  context?: string;
}

const PRESET_TEST_CASES: TestCase[] = [
  {
    id: "case-01",
    name: "Factual Ground Truth (Capital of France)",
    input: "What is the capital of France?",
    expectedOutput: "The capital of France is Paris.",
  },
  {
    id: "case-02",
    name: "Code Generation (Fibonacci in Python)",
    input: "Write a python function to compute the fibonacci sequence.",
    expectedOutput: "def fibonacci(n: int) -> int:",
  },
  {
    id: "case-03",
    name: "Context Summarization (Document Thesis)",
    input: "Summarize the key document takeaways.",
    context: "Rigorous deterministic evaluations are crucial for LLM safety, reproducibility, and benchmark validity.",
    expectedOutput: "deterministic evaluations are crucial for LLM safety",
  },
];

export default function HomePage() {
  const [selectedCase, setSelectedCase] = useState<TestCase>(PRESET_TEST_CASES[0]!);
  const [customInput, setCustomInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRunEvaluation = async () => {
    setIsRunning(true);
    setErrorMsg(null);
    setEvalResult(null);

    const testCaseToRun = customInput.trim()
      ? {
          id: `custom-${Date.now()}`,
          input: customInput.trim(),
          expectedOutput: selectedCase.expectedOutput,
          context: selectedCase.context,
        }
      : selectedCase;

    try {
      const response = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-1.5-pro",
          testCases: [testCaseToRun],
          rubrics: [
            { metric: "exact_match", weight: 0.35, threshold: 0.7 },
            { metric: "f1_score", weight: 0.35, threshold: 0.7 },
            { metric: "latency", weight: 0.3, threshold: 0.5 },
          ],
          forceMock: false,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || "Evaluation request failed");
      }

      setEvalResult(json.data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to execute evaluation");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="border-b border-slate-800 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                AI Evaluation Studio
              </h1>
              <Badge variant="success" dot>
                Hackathon Ready
              </Badge>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Production-grade evaluation harnesses, deterministic metric engines, and Gemini integration with safe fallback mocks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="info">Next.js 15 App Router</Badge>
            <Badge variant="neutral">TypeScript Strict</Badge>
          </div>
        </header>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-900/60">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs uppercase tracking-wider text-slate-400">
                Evaluation Engine
              </CardDescription>
              <CardTitle className="text-xl text-white">Google Gemini</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <span className="text-xs text-emerald-400 font-mono">Safe Mock Fallback Active</span>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs uppercase tracking-wider text-slate-400">
                Type Safety
              </CardDescription>
              <CardTitle className="text-xl text-white">100% Strict</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <span className="text-xs text-blue-400 font-mono">noImplicitAny: true</span>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs uppercase tracking-wider text-slate-400">
                Deterministic Tools
              </CardDescription>
              <CardTitle className="text-xl text-white">EM + Token F1</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <span className="text-xs text-purple-400 font-mono">SQuAD Math Rubric</span>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs uppercase tracking-wider text-slate-400">
                Repository Budget
              </CardDescription>
              <CardTitle className="text-xl text-white">&lt; 5 MB Target</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <span className="text-xs text-emerald-400 font-mono">Strict .gitignore Enforced</span>
            </CardContent>
          </Card>
        </div>

        {/* Evaluation Playground */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Controls column */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Select Evaluation Case</CardTitle>
                <CardDescription>
                  Choose a benchmark baseline test case or provide custom prompts.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {PRESET_TEST_CASES.map((tc) => (
                    <button
                      key={tc.id}
                      type="button"
                      onClick={() => {
                        setSelectedCase(tc);
                        setCustomInput("");
                      }}
                      className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                        selectedCase.id === tc.id && !customInput
                          ? "border-blue-500 bg-blue-950/40 text-blue-100"
                          : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-medium text-white">{tc.name}</div>
                      <div className="text-xs text-slate-400 truncate mt-1">{tc.input}</div>
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <Input
                    label="Custom Evaluation Prompt (Optional)"
                    placeholder="Enter custom prompt to evaluate..."
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    helperText="Overrides preset prompt when provided"
                  />
                </div>

                <Button
                  onClick={handleRunEvaluation}
                  isLoading={isRunning}
                  className="w-full mt-4"
                  variant="primary"
                >
                  {isRunning ? "Evaluating Case..." : "Run Evaluation Benchmark"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Results column */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Benchmark Execution Output</CardTitle>
                    <CardDescription>
                      Real-time inspection of LLM responses, latency metrics, and deterministic scoring.
                    </CardDescription>
                  </div>
                  {evalResult && (
                    <Badge variant={evalResult.results[0]?.passed ? "success" : "error"}>
                      {evalResult.results[0]?.passed ? "Passed Threshold" : "Failed Threshold"}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {errorMsg && (
                  <div
                    role="alert"
                    className="p-4 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-200 text-sm"
                  >
                    <span className="font-semibold">Execution Error: </span>
                    {errorMsg}
                  </div>
                )}

                {!evalResult && !isRunning && !errorMsg && (
                  <div className="text-center py-16 border border-dashed border-slate-800 rounded-lg text-slate-500 text-sm">
                    Click <span className="text-slate-300 font-medium">"Run Evaluation Benchmark"</span> to trigger evaluation.
                  </div>
                )}

                {isRunning && (
                  <div className="text-center py-16 text-slate-400 text-sm space-y-2">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                    <div>Executing model generation and scoring rubrics...</div>
                  </div>
                )}

                {evalResult && evalResult.results?.[0] && (
                  <div className="space-y-4">
                    {/* Actual Output */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Model Output
                      </label>
                      <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap">
                        {evalResult.results[0].actualOutput}
                      </pre>
                    </div>

                    {/* Metadata & Latency */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                      <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                        <div className="text-[10px] uppercase text-slate-500">Latency</div>
                        <div className="text-sm font-mono font-medium text-white">
                          {evalResult.results[0].latencyMs}ms
                        </div>
                      </div>
                      <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                        <div className="text-[10px] uppercase text-slate-500">Total Tokens</div>
                        <div className="text-sm font-mono font-medium text-white">
                          {evalResult.results[0].tokenUsage.totalTokens}
                        </div>
                      </div>
                      <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                        <div className="text-[10px] uppercase text-slate-500">Overall Score</div>
                        <div className="text-sm font-mono font-medium text-blue-400">
                          {(evalResult.results[0].overallScore * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                        <div className="text-[10px] uppercase text-slate-500">Execution Mode</div>
                        <div className="text-sm font-mono font-medium text-purple-300">
                          {evalResult.results[0].isMock ? "Mock Fallback" : "Live Gemini"}
                        </div>
                      </div>
                    </div>

                    {/* Rubric Breakdown */}
                    <div className="space-y-2 pt-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Rubric Metrics Breakdown
                      </label>
                      <div className="space-y-2">
                        {evalResult.results[0].metrics.map((m: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-mono font-semibold uppercase text-slate-200">
                                {m.metric}
                              </span>
                              <p className="text-slate-400 text-[11px] mt-0.5">{m.reasoning}</p>
                            </div>
                            <div className="text-right">
                              <Badge variant={m.passed ? "success" : "error"}>
                                {(m.score * 100).toFixed(0)}%
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
