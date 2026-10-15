import { useCallback, useMemo, useState } from "react";

let versionSequence = 0;
const nextVersionId = () => `version-${Date.now()}-${++versionSequence}`;

/**
 * Lays the version tree out as rows: each row follows first children, and every
 * later child of a version starts a branch row that remembers where it forked.
 */
export const buildVersionRows = (versions) => {
  const childrenOf = new Map();
  for (const version of versions) {
    const siblings = childrenOf.get(version.parentId) || [];
    siblings.push(version);
    childrenOf.set(version.parentId, siblings);
  }

  const rows = [];
  const walk = (start, fromId) => {
    const row = { fromId, items: [] };
    rows.push(row);
    const branches = [];
    for (let current = start; current; current = childrenOf.get(current.id)?.[0]) {
      row.items.push(current);
      branches.push(...(childrenOf.get(current.id) || []).slice(1));
    }
    for (const branch of branches) walk(branch, branch.parentId);
  };
  for (const root of childrenOf.get(null) || []) walk(root, null);

  const order = new Map(versions.map((version, index) => [version.id, index]));
  return rows.sort((a, b) => order.get(a.items[0].id) - order.get(b.items[0].id));
};

/**
 * The in-memory version chain of the current creation: a generation (or a
 * history item) starts a new chain, and every refinement is a child of the
 * version that was selected when it was requested. Nothing is persisted.
 */
export default function useImageVersions() {
  const [versions, setVersions] = useState([]);
  const [activeVersionId, setActiveVersionId] = useState(null);

  /** `fromHistory` marks the history's compressed preview as the chain's source. */
  const startChain = useCallback(({ jobId = null, imageUrl, instruction = "", fromHistory = false }) => {
    const version = {
      id: nextVersionId(),
      jobId,
      imageUrl,
      instruction,
      parentId: null,
      createdAt: Date.now(),
      upload: null,
      fromHistory,
    };
    setVersions([version]);
    setActiveVersionId(version.id);
    return version;
  }, []);

  const addVersion = useCallback(({ jobId, imageUrl, instruction, parentId }) => {
    const version = {
      id: nextVersionId(),
      jobId,
      imageUrl,
      instruction,
      parentId,
      createdAt: Date.now(),
      upload: null,
      fromHistory: false,
    };
    setVersions((current) => [...current, version]);
    setActiveVersionId(version.id);
    return version;
  }, []);

  /** Remembers a version's uploaded copy so it is uploaded at most once. */
  const setVersionUpload = useCallback((versionId, upload) => {
    setVersions((current) =>
      current.map((version) => (version.id === versionId ? { ...version, upload } : version))
    );
  }, []);

  const rows = useMemo(() => buildVersionRows(versions), [versions]);
  const activeVersion = versions.find((version) => version.id === activeVersionId) || null;
  const getVersion = useCallback(
    (id) => versions.find((version) => version.id === id) || null,
    [versions]
  );
  const getVersionLabel = useCallback(
    (version) => `v${versions.findIndex((item) => item.id === version?.id) + 1}`,
    [versions]
  );

  return {
    versions,
    rows,
    activeVersion,
    activeVersionId,
    selectVersion: setActiveVersionId,
    startChain,
    addVersion,
    setVersionUpload,
    getVersion,
    getVersionLabel,
  };
}
