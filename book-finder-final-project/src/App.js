import React, { useEffect, useState, useRef } from "react";
import "./App.css";

/*
  BookFinder - upgraded (UI rearranged + improvements)
  - All original functionality preserved (search, filters, sort, favorites, modal)
  - Mode next to the search (small search)
  - Sort moved into Filters panel (left)
  - Centered modal for details
  - Improved favorites layout
  - Better dark mode contrast
*/

const LANG_OPTIONS = [
  { value: "", label: "Any language" },
  { value: "eng", label: "English" },
  { value: "spa", label: "Spanish" },
  { value: "fre", label: "French" },
  { value: "ger", label: "German" },
  { value: "hin", label: "Hindi" },
];

export default function App() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("title"); // title | author | isbn
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [numFound, setNumFound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [skeleton, setSkeleton] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("bf:favorites")) || [];
    } catch {
      return [];
    }
  });
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("bf:darkMode")) || false;
    } catch {
      return false;
    }
  });

  // Filters & sort (sort moved to filters panel)
  const [filters, setFilters] = useState({
    yearFrom: "",
    yearTo: "",
    language: "",
    hasCover: false,
  });
  const [sortBy, setSortBy] = useState("relevance"); // relevance | newest | oldest

  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const toastTimer = useRef(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    localStorage.setItem("bf:favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem("bf:darkMode", JSON.stringify(darkMode));
  }, [darkMode]);

  // Build fielded query
  function buildUrl(q, m, p = 1) {
    const base = "https://openlibrary.org/search.json";
    const field = m === "title" ? "title" : m === "author" ? "author" : "isbn";
    const encoded = encodeURIComponent(`${field}:${q}`);
    const limit = 20;
    return `${base}?q=${encoded}&page=${p}&limit=${limit}`;
  }

  async function fetchBooks(q, m, p = 1, append = false) {
    if (!q || !q.trim()) {
      setResults([]);
      setNumFound(0);
      return;
    }
    setError("");
    setLoading(true);
    setSkeleton(true);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch(buildUrl(q, m, p), { signal: abortRef.current.signal });
      if (!res.ok) throw new Error("Open Library returned " + res.status);
      const json = await res.json();
      let docs = json.docs || [];

      // client-side filters
      if (filters.hasCover) docs = docs.filter((d) => d.cover_i);
      if (filters.yearFrom) docs = docs.filter((d) => (d.first_publish_year || 0) >= Number(filters.yearFrom));
      if (filters.yearTo) docs = docs.filter((d) => (d.first_publish_year || 0) <= Number(filters.yearTo));
      if (filters.language) docs = docs.filter((d) => (d.language || []).includes(filters.language));

      // sort
      if (sortBy === "newest") docs.sort((a, b) => (b.first_publish_year || 0) - (a.first_publish_year || 0));
      if (sortBy === "oldest") docs.sort((a, b) => (a.first_publish_year || 0) - (b.first_publish_year || 0));

      setNumFound(json.numFound || docs.length);
      if (append) setResults((prev) => [...prev, ...docs]);
      else setResults(docs);
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message || "Failed to fetch");
    } finally {
      setLoading(false);
      setTimeout(() => setSkeleton(false), 300);
    }
  }

  // debounce for query/mode/filters/sort
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setNumFound(0);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchBooks(query, mode, 1, false);
    }, 420);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode, filters, sortBy]);

  // load more
  useEffect(() => {
    if (page === 1) return;
    fetchBooks(query, mode, page, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleFavorite(doc) {
    const id = doc.key || doc.cover_edition_key || `${doc.title}_${doc.first_publish_year}`;
    if (favorites.some((f) => f.id === id)) {
      setFavorites((s) => s.filter((f) => f.id !== id));
      showToast("Removed from favorites");
    } else {
      const toSave = {
        id,
        key: doc.key,
        title: doc.title,
        author_name: doc.author_name,
        first_publish_year: doc.first_publish_year,
        cover_i: doc.cover_i,
      };
      setFavorites((s) => [toSave, ...s].slice(0, 100));
      showToast("Added to favorites");
    }
  }

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  }

  function clearFilters() {
    setFilters({ yearFrom: "", yearTo: "", language: "", hasCover: false });
    setSortBy("relevance");
  }

  function handleSearchSubmit(e) {
    e?.preventDefault();
    setPage(1);
    fetchBooks(query, mode, 1, false);
  }

  // suggestions
  const suggestions = Array.from(new Set(results.slice(0, 10).map((r) => r.title))).slice(0, 5);

  return (
    <div className={darkMode ? "app dark" : "app"}>
      <header className="header" role="banner">
        <div className="brand" aria-hidden>
          <div className="logo">📚</div>
          <div>
            <h1>Book Finder</h1>
            <div className="subtitle">Search books quickly — title, author or ISBN</div>
          </div>
        </div>

        <div className="controls" role="region" aria-label="Search controls">
          {/* Small search + Mode next to it */}
          <form onSubmit={handleSearchSubmit} className="search-form" role="search">
            <input
              className="search-input"
              aria-label="Search books"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search by ${mode}... (press Enter)`}
            />
            <select
              className="mode-select"
              aria-label="Search mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="title">Title</option>
              <option value="author">Author</option>
              <option value="isbn">ISBN</option>
            </select>
            <button type="submit" className="btn primary">Search</button>
            <button
              type="button"
              className="btn light"
              onClick={() => {
                setQuery("");
                setResults([]);
                setNumFound(0);
              }}
              title="Clear search"
            >
              Clear
            </button>
          </form>

          {/* optional actions (kept minimal here) */}
          <button
            className="btn ghost"
            onClick={() => {
              setDarkMode((d) => !d);
              showToast(darkMode ? "Light mode" : "Dark mode");
            }}
            aria-pressed={darkMode}
            title="Toggle dark mode"
          >
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </header>

      <main className="main">
        {/* Left: filters panel (sort moved here) */}
        <aside className="sidebar" aria-label="Filters & quick items">
          <div className="card small" aria-hidden={false}>
            <h3>Filters</h3>

            <div className="filter-row">
              <input
                type="number"
                placeholder="Year from"
                value={filters.yearFrom}
                onChange={(e) => setFilters((s) => ({ ...s, yearFrom: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Year to"
                value={filters.yearTo}
                onChange={(e) => setFilters((s) => ({ ...s, yearTo: e.target.value }))}
              />
            </div>

            <div className="filter-row" style={{ marginTop: 10 }}>
              <select
                value={filters.language}
                onChange={(e) => setFilters((s) => ({ ...s, language: e.target.value }))}
              >
                {LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
{/* <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
  <input
    type="checkbox"
    checked={filters.hasCover}
    onChange={(e) => setFilters((s) => ({ ...s, hasCover: e.target.checked }))}
  />
  <span style={{ marginLeft: "8px" }}>Only with cover</span>
</label> */}

            </div>

            {/* SORT moved into filters */}
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Sort</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="relevance">Relevance</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>

            <div className="filter-actions" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => fetchBooks(query, mode, 1, false)}>Apply</button>
              <button className="btn light" onClick={clearFilters}>Reset</button>
            </div>
          </div>

          <div className="card small">
            <h3>Quick suggestions</h3>
            {suggestions.length === 0 ? (
              <p className="muted">No suggestions yet</p>
            ) : (
              <ul className="suggest-list">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      className="link"
                      onClick={() => {
                        setQuery(s);
                        setPage(1);
                        fetchBooks(s, mode, 1, false);
                      }}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card small">
            <h3>Favorites <span className="fav-count">({favorites.length})</span></h3>
            {favorites.length === 0 ? (
              <p className="muted">No favorites yet.</p>
            ) : (
              <ul className="fav-list">
                {favorites.map((f) => (
                  <li key={f.id} className="fav-item">
                    <img
                      src={f.cover_i ? `https://covers.openlibrary.org/b/id/${f.cover_i}-S.jpg` : `https://via.placeholder.com/40x60?text=No`}
                      alt={f.title}
                      className="fav-thumb"
                    />
                    <div className="fav-meta">
                      <div className="fav-title">{f.title}</div>
                      <div className="fav-sub">{(f.author_name || []).slice(0, 1).join(", ")}</div>
                    </div>
                    <button className="btn small remove" onClick={() => toggleFavorite(f)}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Center: results */}
        <section className="content" aria-live="polite">
          <div className="results-header">
            <h2>Results</h2>
            <div className="meta muted">{numFound ? `${numFound} found` : (results.length ? `${results.length} shown` : "")}</div>
          </div>

          {skeleton && (
            <ul className="results-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <li key={i} className="card skeleton">
                  <div className="skeleton-rect" style={{ height: 200 }} />
                  <div className="skeleton-line short" />
                  <div className="skeleton-line" />
                </li>
              ))}
            </ul>
          )}

          {!skeleton && results.length === 0 && !loading && (
            <div className="empty-state card">
              <h3>No results</h3>
              <p>Try a different query or remove filters.</p>
            </div>
          )}

          {!skeleton && results.length > 0 && (
            <ul className="results-grid">
              {results.map((doc) => {
                const id = doc.key || doc.cover_edition_key || doc.title;
                const isFav = favorites.some((f) => f.id === (doc.key || doc.cover_edition_key || `${doc.title}_${doc.first_publish_year}`));
                return (
                  <li
                    key={id}
                    className="card result-card"
                    tabIndex="0"
                    onClick={() => setSelected(doc)}
                    onKeyDown={(e) => { if (e.key === "Enter") setSelected(doc); }}
                    aria-label={`Open details for ${doc.title}`}
                  >
                    {doc.cover_i ? (
                      <img className="cover" src={`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`} alt={doc.title} />
                    ) : (
                      <div className="no-cover">No cover</div>
                    )}

                    <div className="card-body">
                      <h3 className="title">{doc.title}</h3>
                      <div className="meta">{(doc.author_name || []).slice(0, 2).join(", ") || "Unknown author"}</div>
                      <div className="meta small">{doc.first_publish_year || "—"}</div>
                    </div>

                    <div className="card-actions">
                      <button
                        className={`btn small ${isFav ? "danger" : "ghost"}`}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(doc); }}
                        aria-pressed={isFav}
                      >
                        {isFav ? "Remove" : "Save"}
                      </button>
                      <button className="btn small" onClick={(e) => { e.stopPropagation(); setSelected(doc); }}>Details</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {results.length > 0 && numFound > results.length && (
            <div className="center" style={{ marginTop: 18 }}>
              <button className="btn primary" onClick={() => setPage((p) => p + 1)}>Load more</button>
            </div>
          )}

          {error && <div className="error card">{error}</div>}
        </section>
      </main>

      {/* Modal (centered) */}
      {selected && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setSelected(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="close" aria-label="close" onClick={() => setSelected(null)}>✖</button>
            <div className="modal-content">
              <img className="modal-cover" src={selected.cover_i ? `https://covers.openlibrary.org/b/id/${selected.cover_i}-L.jpg` : `https://via.placeholder.com/200x300?text=No+Cover`} alt={selected.title} />
              <div className="modal-body">
                <h2>{selected.title}</h2>
                <p className="muted">{(selected.author_name || []).join(", ")}</p>
                <p><strong>First published:</strong> {selected.first_publish_year || "N/A"}</p>
                <p><strong>Editions:</strong> {selected.edition_count || "N/A"}</p>
                {selected.subject && <p><strong>Subjects:</strong> {(selected.subject || []).slice(0, 8).join(", ")}</p>}
                <div className="modal-actions">
                  <a className="btn primary" href={`https://openlibrary.org${selected.key}`} target="_blank" rel="noreferrer">Open on OpenLibrary</a>
                  <button className="btn" onClick={() => toggleFavorite(selected)}>{favorites.some(f => f.key === selected.key) ? "Remove fav" : "Save fav"}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && <div className="toast">{toast}</div>}

      <footer className="footer">
        Built for Alex • Uses Open Library API
      </footer>
    </div>
  );
}
