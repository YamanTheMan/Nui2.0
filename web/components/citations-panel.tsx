export type Citation = {
  source: string;
  quote: string;
};

export function citationKey(citation: Citation): string {
  return `${citation.source}|${citation.quote}`.toLowerCase();
}

export default function CitationsPanel({ citations }: { citations: Citation[] }) {
  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sources</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Anything Prof Nui cites out loud shows up here.
      </p>

      {citations.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">
          No sources cited yet.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {citations.map((citation) => (
            <li
              key={citationKey(citation)}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {citation.source}
              </p>
              <p className="mt-1 text-xs italic leading-relaxed text-slate-600 dark:text-slate-300">
                &ldquo;{citation.quote}&rdquo;
              </p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
