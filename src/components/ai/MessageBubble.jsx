import React from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, CheckCircle2, Loader2, XCircle, Wrench } from "lucide-react";

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground" : "rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5"}`}>
        {message.content && (
          isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-line">{message.content}</p>
          ) : (
            <div className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-background/50 [&_pre]:p-2 [&_pre]:rounded-lg [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:text-foreground">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )
        )}
        {message.tool_calls?.map((tc, i) => (
          <ToolCallDisplay key={i} toolCall={tc} />
        ))}
      </div>
    </div>
  );
}

function ToolCallDisplay({ toolCall }) {
  const [expanded, setExpanded] = React.useState(false);

  const status = toolCall.status || "pending";
  const isFailed = status === "failed" || status === "error";
  const isRunning = status === "pending" || status === "running" || status === "in_progress";

  let parsedResults = toolCall.results;
  try {
    if (typeof toolCall.results === "string") parsedResults = JSON.parse(toolCall.results);
  } catch {
    // keep raw
  }

  const dp = toolCall.display_projection || {};
  const hideDetails = dp.hide_details && dp.details_redacted;

  const label = dp.label || formatToolName(toolCall.name);
  const activeLabel = dp.active_label || label;
  const errorLabel = dp.error_label || label;

  const displayLabel = isFailed ? errorLabel : isRunning ? activeLabel : label;

  let parsedArgs = toolCall.arguments_string;
  try {
    if (typeof parsedArgs === "string") parsedArgs = JSON.parse(parsedArgs);
  } catch {
    // keep raw
  }

  return (
    <div className="mt-2 border-t border-border/50 pt-2">
      <button
        onClick={() => !hideDetails && setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        {isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isFailed ? (
          <XCircle className="h-3 w-3 text-destructive" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        )}
        <span className={isFailed ? "text-destructive" : ""}>{displayLabel}</span>
        {!hideDetails && (
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>
      {expanded && !hideDetails && (
        <div className="mt-1.5 space-y-1">
          {parsedArgs && typeof parsedArgs === "object" && Object.keys(parsedArgs).length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Parameters</span>
              <pre className="mt-0.5 overflow-x-auto rounded bg-background/50 p-1.5 text-[10px] text-muted-foreground">{JSON.stringify(parsedArgs, null, 2)}</pre>
            </div>
          )}
          {parsedResults && (
            <div>
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Result</span>
              <pre className="mt-0.5 overflow-x-auto rounded bg-background/50 p-1.5 text-[10px] text-muted-foreground">{typeof parsedResults === "string" ? parsedResults : JSON.stringify(parsedResults, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatToolName(name) {
  if (!name) return "Tool";
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}