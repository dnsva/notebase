// ============================================================================
// notebase web — components/Snippet.jsx
// ============================================================================
// A result snippet with best-effort term highlighting. Semantic search
// matches MEANING, so exact query words often don't appear in a hit — but
// when they do, marking them helps the eye confirm why a result matched.
// Query words shorter than 3 chars are skipped ("a", "of" would light up
// everything).
// ============================================================================

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function Snippet({ text, query, maxChars = 220 }) {
  const truncated = text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  const words = [...new Set(
    (query ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3)
  )];
  if (words.length === 0) return <p className="result-snippet">{truncated}</p>;

  // Split on a capture group: odd indices are the matched words.
  const regex = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "gi");
  const parts = truncated.split(regex);
  return (
    <p className="result-snippet">
      {parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))}
    </p>
  );
}
