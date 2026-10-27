import { sourceTitle } from "@/lib/course-catalog";
import Icon from "./ui-icon";

export type Citation = { source: string; quote: string; section?: string };
export type CourseSource = {
  source: string;
  text: string;
  title?: string;
  section?: string;
  score?: number;
};
export function citationKey(citation: Citation): string {
  return `${citation.source}|${citation.quote}`.toLowerCase();
}

export default function CitationsPanel({
  citations,
}: {
  citations: Citation[];
}) {
  return (
    <section className="sources-panel">
      <div className="section-eyebrow">
        <Icon name="book" size={15} /> Course material consulted
      </div>
      <p className="muted small">
        Open an excerpt to check the original material.
      </p>
      {citations.length === 0 ? (
        <div className="sources-empty">
          <Icon name="book" size={28} />
          <p>Sources will appear here when you ask a course question.</p>
        </div>
      ) : (
        <div className="source-list">
          {citations.map((citation, i) => (
            <details key={citationKey(citation)} className="source-detail">
              <summary>
                <span className="source-number">{i + 1}</span>
                <span>
                  {sourceTitle(citation.source)}
                  {citation.section && <small>{citation.section}</small>}
                </span>
                <Icon name="chevron" size={14} />
              </summary>
              <p>{citation.quote}</p>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
