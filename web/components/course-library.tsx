"use client";
import { useEffect, useState } from "react";
import { COURSE_MATERIALS, type CourseMaterial } from "@/lib/course-catalog";
import Dialog from "./dialog";
import Icon from "./ui-icon";
import MessageText from "./message-text";

type Material = CourseMaterial;
type Chunk = { text: string; section?: string; chunkIndex: number };

function formatUpdateDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function MaterialPreview({
  material,
  onAsk,
  onClose,
}: {
  material: Material;
  onAsk: (prompt: string) => void;
  onClose: () => void;
}) {
  const [chunks, setChunks] = useState<Chunk[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/materials?source=${encodeURIComponent(material.source)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Could not open the material. Please close this window and try again.",
          );
        return response.json();
      })
      .then((data: { chunks: Chunk[] }) => setChunks(data.chunks))
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      });
    return () => controller.abort();
  }, [material.source]);
  return (
    <Dialog title={material.title} onClose={onClose} wide>
      <div className="material-preview-heading">
        <span className="eyebrow">{material.category}</span>
        <h2>{material.title}</h2>
        <p className="muted">{material.description}</p>
        <button
          className="button primary"
          onClick={() => {
            onAsk(material.prompt);
            onClose();
          }}
        >
          Explore this with Prof Nui <Icon name="arrow" size={16} />
        </button>
      </div>
      <div className="material-preview-body">
        {error ? (
          <p role="alert" className="error-note">
            {error}
          </p>
        ) : chunks === null ? (
          <p role="status" className="muted">
            Opening course material…
          </p>
        ) : (
          chunks.map((chunk) => (
            <section key={chunk.chunkIndex} className="material-excerpt">
              {chunk.section && <h3>{chunk.section}</h3>}
              <MessageText
                text={
                  chunk.section && chunk.text.startsWith(chunk.section)
                    ? chunk.text.slice(chunk.section.length).trimStart()
                    : chunk.text
                }
              />
            </section>
          ))
        )}
      </div>
    </Dialog>
  );
}

export default function CourseLibrary({
  onAsk,
}: {
  onAsk: (prompt: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All materials");
  const [selected, setSelected] = useState<Material | null>(null);
  const categories = [
    "All materials",
    ...new Set(COURSE_MATERIALS.map((item) => item.category)),
  ];
  const matches = COURSE_MATERIALS.filter(
    (item) =>
      (filter === "All materials" || item.category === filter) &&
      `${item.title} ${item.description} ${item.category} ${item.date ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const updates = matches
    .filter((item) => item.category === "Class updates")
    .sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""));
  const materials = matches.filter((item) => item.category !== "Class updates");
  return (
    <section className="library-view view-enter">
      <span className="eyebrow">THE KNOWLEDGE SHELF</span>
      <h1>A place for every idea.</h1>
      <p className="view-description">
        Class updates, assignments, and key concepts.
      </p>
      <div className="library-toolbar">
        <div className="search-field">
          <Icon name="search" size={18} />
          <input
            aria-label="Search course materials"
            placeholder="Find a topic or framework…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="small muted">
          {matches.length} {matches.length === 1 ? "resource" : "resources"}
        </span>
      </div>
      <div className="filter-row" aria-label="Filter materials">
        {categories.map((category) => (
          <button
            key={category}
            aria-pressed={filter === category}
            className={filter === category ? "filter active" : "filter"}
            onClick={() => setFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>
      {updates.length > 0 && (
        <section className="class-updates" aria-labelledby="class-updates-heading">
          <h2 className="library-section-heading" id="class-updates-heading">
            Class updates
          </h2>
          <ul className="class-update-list">
            {updates.map((material) => (
              <li key={material.source}>
                <button
                  type="button"
                  className="class-update-card"
                  onClick={() => setSelected(material)}
                >
                  {material.date && (
                    <time className="class-update-date" dateTime={material.date}>
                      {formatUpdateDate(material.date)}
                    </time>
                  )}
                  <div className="class-update-copy">
                    <h3>{material.title}</h3>
                    <p>{material.description}</p>
                  </div>
                  <Icon name="arrow" size={20} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {materials.length > 0 && (
        <section aria-labelledby="course-materials-heading">
          <h2 className="library-section-heading" id="course-materials-heading">
            Course materials
          </h2>
          <div className="library-grid">
            {materials.map((material, i) => (
              <button
                key={material.source}
                className="material-card"
                onClick={() => setSelected(material)}
              >
                <span className={`tile-icon tone-${i % 3}`}>
                  <Icon name={material.icon} size={24} />
                </span>
                <span className="eyebrow">{material.category}</span>
                <h3>{material.title}</h3>
                <p>{material.description}</p>
                <span className="material-card-bottom">
                  Open material <Icon name="arrow" size={16} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {matches.length === 0 && (
        <div className="empty-result">
          <Icon name="search" size={30} />
          <h2>No matching materials</h2>
          <p>Try a broader topic, such as culture, strategy, or assignments.</p>
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setFilter("All materials");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {selected && (
        <MaterialPreview
          material={selected}
          onAsk={onAsk}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
