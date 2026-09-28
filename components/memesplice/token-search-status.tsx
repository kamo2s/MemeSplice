import { LoaderCircle } from "lucide-react";
export function TokenSearchStatus({ status, message, retry }: { status: string; message: string; retry: () => void }) {
  if (!message) return null;
  return <div className="search-empty token-search-status" role={status === "error" ? "alert" : "status"} aria-live="polite">
    {status === "loading" && <LoaderCircle size={16} className="animate-spin" aria-hidden="true"/>}<span>{message}</span>
    {status === "error" && !message.startsWith("Invalid") && <button type="button" className="token-search-retry" onClick={retry}>Try again</button>}
  </div>;
}
