import { Fragment, type ReactNode } from "react";

/** Small safe Markdown renderer: content always remains React text, never HTML. */
function inline(text: string): ReactNode[] {
  return text
    .split(
      /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g,
    )
    .filter(Boolean)
    .map((segment, i) => {
      if (segment.startsWith("**") && segment.endsWith("**"))
        return <strong key={i}>{segment.slice(2, -2)}</strong>;
      if (segment.startsWith("*") && segment.endsWith("*"))
        return <em key={i}>{segment.slice(1, -1)}</em>;
      if (segment.startsWith("`") && segment.endsWith("`"))
        return <code key={i}>{segment.slice(1, -1)}</code>;
      const link = segment.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (link)
        return (
          <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">
            {link[1]}
          </a>
        );
      return <Fragment key={i}>{segment}</Fragment>;
    });
}
export default function MessageText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const key = i;
    if (line.startsWith("```")) {
      const code: string[] = [];
      while (i + 1 < lines.length && !lines[i + 1].trim().startsWith("```"))
        code.push(lines[++i]);
      if (i + 1 < lines.length) i++;
      blocks.push(
        <pre key={key}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])
    ) {
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim());
      const headings = cells(line);
      const rows: string[][] = [];
      i++;
      while (
        i + 1 < lines.length &&
        lines[i + 1].includes("|") &&
        lines[i + 1].trim()
      )
        rows.push(cells(lines[++i]));
      blocks.push(
        <div className="table-scroll" key={key}>
          <table>
            <thead>
              <tr>
                {headings.map((heading, n) => (
                  <th key={n} scope="col">
                    {inline(heading)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h3 key={key}>{inline(line.replace(/^#{1,6}\s+/, ""))}</h3>);
      continue;
    }
    if (/^>/.test(line)) {
      blocks.push(
        <blockquote key={key}>{inline(line.replace(/^>\s?/, ""))}</blockquote>,
      );
      continue;
    }
    const ordered = /^\d+[.)]\s/.test(line);
    if (ordered || /^[-*•]\s/.test(line)) {
      const items = [line];
      const pattern = ordered ? /^\d+[.)]\s/ : /^[-*•]\s/;
      while (i + 1 < lines.length && pattern.test(lines[i + 1].trim()))
        items.push(lines[++i].trim());
      const children = items.map((item, n) => (
        <li key={n}>{inline(item.replace(/^(?:\d+[.)]|[-*•])\s+/, ""))}</li>
      ));
      blocks.push(
        ordered ? (
          <ol key={key} start={Number.parseInt(line)}>
            {children}
          </ol>
        ) : (
          <ul key={key}>{children}</ul>
        ),
      );
      continue;
    }
    if (/^[-*_]{3,}$/.test(line)) {
      blocks.push(<hr key={key} />);
      continue;
    }
    blocks.push(<p key={key}>{inline(line)}</p>);
  }
  return <div className="formatted-message">{blocks}</div>;
}
