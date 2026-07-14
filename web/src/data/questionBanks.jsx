// ============================================================================
// notebase web — data/questionBanks.jsx
// ============================================================================
// All question-bank state and operations, as a React context. Pages call
// the action functions; the context keeps the in-memory bank list in sync
// with the repo (see lib/github.js for the storage model).
//
// WRITE STRATEGY — save first, update state on success. No optimistic
// updates: a failed GitHub write (offline, bad token, stale sha) leaves
// local state untouched and surfaces the error, so what you see is always
// what the repo has. On a stale-sha conflict (409/422) we reload from the
// repo so the next attempt starts fresh.
//
// EMBEDDINGS — saveQuestion embeds "question + answer" plain text right
// here (lib/embeddings.js, same model as the notes pipeline) so every
// stored question is immediately searchable alongside notes. If the model
// hasn't finished its first-load yet, the save simply awaits it.
//
// BANK IDs are slug-of-title + random suffix, fixed at creation (renames
// don't move files, so links stay stable).
// ============================================================================

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  BANKS_DIR,
  deleteJsonFile,
  fetchJsonFile,
  hasToken,
  listBankPaths,
  saveJsonFile,
} from "../lib/github.js";
import { embedText } from "../lib/embeddings.js";
import { extractText } from "../lib/richtext.js";

const QuestionBanksContext = createContext(null);

const now = () => new Date().toISOString();
const randomId = (prefix) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function slugify(title) {
  return (
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) ||
    "bank"
  );
}

export function QuestionBanksProvider({ children }) {
  // banks: [{ ...bankJson, path, sha }] — path/sha are storage bookkeeping,
  // stripped before every save so they never leak into the repo files.
  const [banks, setBanks] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const canEdit = hasToken();

  const reload = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const paths = await listBankPaths();
      const loaded = await Promise.all(
        paths.map(async (path) => {
          const { data, sha } = await fetchJsonFile(path);
          return { ...data, path, sha };
        })
      );
      loaded.sort((a, b) => a.title.localeCompare(b.title));
      setBanks(loaded);
      setStatus("ready");
    } catch (err) {
      console.error(err);
      setError(err.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Serialize a bank for the repo (drop local bookkeeping), save, sync state. */
  async function persistBank(bank, message) {
    const { path, sha, ...fileData } = bank;
    fileData.updated_at = now();
    try {
      const newSha = await saveJsonFile(path, fileData, sha, message);
      const stored = { ...fileData, path, sha: newSha };
      setBanks((current) => {
        const others = current.filter((b) => b.id !== bank.id);
        return [...others, stored].sort((a, b) => a.title.localeCompare(b.title));
      });
      return stored;
    } catch (err) {
      if (err.status === 409 || err.status === 422) {
        // Stale sha: the file changed under us (edit from another device).
        // Resync so the user can retry against fresh data.
        await reload();
        throw new Error(
          "This bank was changed elsewhere — reloaded the latest version, please retry your edit."
        );
      }
      throw err;
    }
  }

  // ------------------------------------------------------------- banks ---

  async function createBank({ title, folder }) {
    const id = `${slugify(title)}-${randomId("")}`;
    const bank = {
      id,
      title,
      folder: folder.trim() || "general",
      updated_at: now(),
      questions: [],
      path: `${BANKS_DIR}/${id}.json`,
      sha: null,
    };
    return persistBank(bank, `banks: create "${title}"`);
  }

  async function updateBankMeta(bankId, { title, folder }) {
    const bank = requireBank(bankId);
    return persistBank(
      { ...bank, title: title ?? bank.title, folder: folder ?? bank.folder },
      `banks: update "${bank.title}"`
    );
  }

  async function deleteBank(bankId) {
    const bank = requireBank(bankId);
    await deleteJsonFile(bank.path, bank.sha, `banks: delete "${bank.title}"`);
    setBanks((current) => current.filter((b) => b.id !== bankId));
  }

  // --------------------------------------------------------- questions ---

  /**
   * Create or update a question. `draft` = { id?, question, answer, tags,
   * difficulty } with question/answer as TipTap JSON. Embedding and plain
   * text are (re)computed here on every save so they can never go stale.
   */
  async function saveQuestion(bankId, draft) {
    const bank = requireBank(bankId);
    const question_text = extractText(draft.question);
    const answer_text = extractText(draft.answer);
    const vector = await embedText(`${question_text}\n${answer_text}`);
    const question = {
      id: draft.id ?? randomId("q_"),
      question: draft.question,
      answer: draft.answer,
      question_text,
      answer_text,
      embedding: [...vector].map((v) => Math.round(v * 1e6) / 1e6),
      tags: draft.tags ?? [],
      difficulty: draft.difficulty ?? null,
      updated_at: now(),
    };
    const questions = draft.id
      ? bank.questions.map((q) => (q.id === draft.id ? question : q))
      : [...bank.questions, question];
    await persistBank(
      { ...bank, questions },
      `banks: ${draft.id ? "edit" : "add"} question in "${bank.title}"`
    );
    return question;
  }

  async function duplicateQuestion(bankId, questionId) {
    const bank = requireBank(bankId);
    const original = bank.questions.find((q) => q.id === questionId);
    if (!original) throw new Error("Question not found");
    const copy = { ...original, id: randomId("q_"), updated_at: now() };
    const index = bank.questions.indexOf(original);
    const questions = [...bank.questions];
    questions.splice(index + 1, 0, copy); // duplicate lands next to original
    await persistBank({ ...bank, questions }, `banks: duplicate question in "${bank.title}"`);
  }

  async function deleteQuestion(bankId, questionId) {
    const bank = requireBank(bankId);
    await persistBank(
      { ...bank, questions: bank.questions.filter((q) => q.id !== questionId) },
      `banks: delete question in "${bank.title}"`
    );
  }

  /**
   * Move a question between banks: add to target first, then remove from
   * source. If the removal fails the question exists in both banks — a
   * visible, recoverable state (delete the copy) rather than silent loss.
   */
  async function moveQuestion(fromBankId, toBankId, questionId) {
    const from = requireBank(fromBankId);
    const to = requireBank(toBankId);
    const question = from.questions.find((q) => q.id === questionId);
    if (!question) throw new Error("Question not found");
    await persistBank(
      { ...to, questions: [...to.questions, question] },
      `banks: move question into "${to.title}"`
    );
    await persistBank(
      { ...from, questions: from.questions.filter((q) => q.id !== questionId) },
      `banks: move question out of "${from.title}"`
    );
  }

  function requireBank(bankId) {
    const bank = banks.find((b) => b.id === bankId);
    if (!bank) throw new Error(`Unknown bank: ${bankId}`);
    return bank;
  }

  const value = {
    banks,
    status,
    error,
    canEdit,
    reload,
    createBank,
    updateBankMeta,
    deleteBank,
    saveQuestion,
    duplicateQuestion,
    deleteQuestion,
    moveQuestion,
  };

  return (
    <QuestionBanksContext.Provider value={value}>
      {children}
    </QuestionBanksContext.Provider>
  );
}

export function useQuestionBanks() {
  const value = useContext(QuestionBanksContext);
  if (!value) throw new Error("useQuestionBanks must be used inside <QuestionBanksProvider>");
  return value;
}

/** Group banks into folder cards: [{ folder, banks, questionCount }]. */
export function bankFolders(banks) {
  const byFolder = new Map();
  for (const bank of banks) {
    if (!byFolder.has(bank.folder)) byFolder.set(bank.folder, []);
    byFolder.get(bank.folder).push(bank);
  }
  return [...byFolder.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, folderBanks]) => ({
      folder,
      banks: folderBanks,
      questionCount: folderBanks.reduce((sum, b) => sum + b.questions.length, 0),
    }));
}
