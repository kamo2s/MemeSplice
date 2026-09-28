"use client";
import { useEffect, useState } from "react";
import { fetchTokens, tokenToCoin } from "@/lib/tokens/client";
import { classifyQuery } from "@/lib/tokens/validation";
import type { Coin } from "@/lib/memesplice/types";
import { settleSearchRequest } from "@/lib/tokens/search-request";

type SearchState = { query: string; coins: Coin[]; status: "idle" | "loading" | "success" | "error"; message: string };
export function useTokenSearch(input: string, enabled: boolean) {
  const query = input.trim();
  const classification = classifyQuery(query);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ query: "", coins: [], status: "idle", message: "" });
  useEffect(() => {
    if (!enabled || classification.kind === "empty" || classification.kind === "invalid") return;
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(async () => {
      setState({ query, coins: [], status: "loading", message: "Searching Solana tokens…" });
      const deadline = setTimeout(() => controller.abort("timeout"), 65000);
      try {
        await settleSearchRequest(()=>fetchTokens(query,controller.signal),controller.signal,()=>current,
          result=>setState({ query, coins: result.tokens.map(tokenToCoin), status: "success", message: result.warning ?? (result.tokens.length ? "" : "Token not found.") }),
          error=>setState({ query, coins: [], status: "error", message: controller.signal.aborted ? "Token search timed out. Please try again." : error instanceof Error ? error.message : "Token search is unavailable. Please try again." }));
      } finally { clearTimeout(deadline); }
    }, classification.kind === "mint" ? 0 : 600);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [query, enabled, attempt, classification.kind]);
  const retry = () => { setState({ query, coins: [], status: "loading", message: "Searching Solana tokens…" }); setAttempt(value => value + 1); };
  if (!enabled || classification.kind === "empty") return { coins: [], status: "idle" as const, message: "Search by name, ticker, or paste a Solana mint address.", retry };
  if (classification.kind === "invalid") return { coins: [], status: "error" as const, message: classification.message!, retry };
  // Hide previous-query results immediately, before the debounced request starts.
  if (state.query !== query) return { coins: [], status: "loading" as const, message: "Searching Solana tokens…", retry };
  return { ...state, retry };
}
