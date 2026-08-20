import { Fragment } from "react";

/**
 * Minimal, injection-safe renderer for the small amount of markdown Prof Nui
 * produces: **bold** spans and "> quote" lines from her citation blocks.
 */

function renderBold(text: string, keyPrefix: string) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return segments.map((segment, i) => {
    if (segment.startsWith("**") && segment.endsWith("**") && segment.length > 4) {
      return (
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold">
          {segment.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={`${keyPrefix}-t${i}`}>{segment}</Fragment>;
  });
}

export default function MessageText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((line, index) => {
        const key = `l${index}`;
        if (line.trim().startsWith(">")) {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-slate-300 pl-3 text-sm italic text-slate-600 dark:border-slate-600 dark:text-slate-300"
            >
              {renderBold(line.replace(/^\s*>\s?/, ""), key)}
            </blockquote>
          );
        }
        if (line.trim() === "") {
          return <span key={key} className="h-1" />;
        }
        return <p key={key}>{renderBold(line, key)}</p>;
      })}
    </div>
  );
}
