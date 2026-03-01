import { useCallback, useRef, useState } from 'react';
import type { ToastType } from '../components/Toast';
import type { TranslationKey } from '../shared/translations';
import type { AppUpdate } from '../shared/types';

interface UseReleaseNotesParams {
  addToast: (message: string, type?: ToastType) => void;
  t: (key: TranslationKey) => string;
}

export function useReleaseNotes({ addToast, t }: UseReleaseNotesParams) {
  const [releaseNotesUrlById, setReleaseNotesUrlById] = useState<Partial<Record<string, string | null>>>({});
  const [releaseNotesLoadingById, setReleaseNotesLoadingById] = useState<Partial<Record<string, boolean>>>({});
  const releaseNotesPrefetchRunRef = useRef(0);

  const resetReleaseNotesState = useCallback(() => {
    releaseNotesPrefetchRunRef.current += 1;
    setReleaseNotesUrlById({});
    setReleaseNotesLoadingById({});
  }, []);

  const prefetchReleaseNotesForUpdates = useCallback(async (items: AppUpdate[]) => {
    const runId = ++releaseNotesPrefetchRunRef.current;

    for (const update of items) {
      if (releaseNotesPrefetchRunRef.current !== runId) return;

      const { id } = update;
      setReleaseNotesLoadingById((prev) => ({ ...prev, [id]: true }));

      try {
        const fetchedUrl = await window.ipcRenderer.invoke('winget:get-release-notes-url', id);
        if (releaseNotesPrefetchRunRef.current !== runId) return;

        const normalizedUrl = fetchedUrl && fetchedUrl.trim().length > 0 ? fetchedUrl : null;
        setReleaseNotesUrlById((prev) => ({ ...prev, [id]: normalizedUrl }));
      } catch (error) {
        console.error(`[useReleaseNotes] Silent release-notes prefetch failed for ${id}:`, error);
        if (releaseNotesPrefetchRunRef.current !== runId) return;
        setReleaseNotesUrlById((prev) => ({ ...prev, [id]: null }));
      } finally {
        if (releaseNotesPrefetchRunRef.current === runId) {
          setReleaseNotesLoadingById((prev) => ({ ...prev, [id]: false }));
        }
      }
    }
  }, []);

  const openReleaseNotesForUpdate = useCallback(async (update: AppUpdate) => {
    const { id } = update;
    const cachedUrl = releaseNotesUrlById[id];

    if (typeof cachedUrl === 'string' && cachedUrl.length > 0) {
      try {
        await window.ipcRenderer.invoke('system:open-url', cachedUrl);
      } catch (error) {
        console.error(`[useReleaseNotes] Failed to open cached release notes URL for ${id}:`, error);
        addToast(t('releaseNotesUnavailable'), 'warning');
      }
      return;
    }

    if (cachedUrl === null || releaseNotesLoadingById[id]) {
      return;
    }

    setReleaseNotesLoadingById((prev) => ({ ...prev, [id]: true }));

    try {
      const fetchedUrl = await window.ipcRenderer.invoke('winget:get-release-notes-url', id);
      const normalizedUrl = fetchedUrl && fetchedUrl.trim().length > 0 ? fetchedUrl : null;
      setReleaseNotesUrlById((prev) => ({ ...prev, [id]: normalizedUrl }));

      if (normalizedUrl) {
        await window.ipcRenderer.invoke('system:open-url', normalizedUrl);
      }
    } catch (error) {
      console.error(`[useReleaseNotes] Failed to fetch release notes for ${id}:`, error);
      setReleaseNotesUrlById((prev) => ({ ...prev, [id]: null }));
    } finally {
      setReleaseNotesLoadingById((prev) => ({ ...prev, [id]: false }));
    }
  }, [addToast, releaseNotesLoadingById, releaseNotesUrlById, t]);

  return {
    releaseNotesUrlById,
    resetReleaseNotesState,
    prefetchReleaseNotesForUpdates,
    openReleaseNotesForUpdate
  };
}
