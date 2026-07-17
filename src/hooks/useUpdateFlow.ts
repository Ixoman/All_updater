import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ToastType } from '../components/Toast';
import type { TranslationKey } from '../shared/translations';
import type {
  AppUpdate,
  HistoryItem,
  RestoreFailureReason,
  RestorePointResult,
  RestorePointVerificationResult,
  PreflightResult
} from '../shared/types';
import {
  parseInstallerFailurePayload,
  type InstallerFailurePayload
} from '../utils/app-helpers';

interface ConflictState {
  appName: string;
  onRetry: () => void;
  onSkip: () => void;
}

interface RestoreDecisionState {
  message: string;
  details?: string;
  onContinue: () => void;
  onCancel: () => void;
}

interface RestoreVerificationSummaryState {
  status: 'confirmed' | 'missing' | 'unverified';
  message: string;
  details?: string;
}

interface BatchInstallController {
  beginInstallSession: () => void;
  resetBatchInstallState: () => void;
  initializeBatchProgress: (total: number) => void;
  updateBatchProgress: (current: number, total: number) => void;
  markBatchItemStarted: () => void;
  markBatchItemCompleted: () => void;
  setIsCreatingRestore: (value: boolean) => void;
  setCurrentInstallingApp: (value: string | null) => void;
  setCurrentLogLine: (value: string | null) => void;
  setCurrentAppProgress: (value: number | null) => void;
  setCurrentAppProgressMode: (value: 'real' | 'estimated' | null) => void;
  startEstimatedAppProgress: () => void;
  stopEstimatedAppProgress: () => void;
  isBatchCancelRequested: () => boolean;
}

interface UseUpdateFlowParams {
  addToast: (message: string, type?: ToastType) => void;
  t: (key: TranslationKey) => string;
  updates: AppUpdate[];
  selectedIds: Set<string>;
  setUpdates: Dispatch<SetStateAction<AppUpdate[]>>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  addHistoryEntrySafely: (entry: Omit<HistoryItem, 'date'>) => Promise<void>;
  resetHistoryWriteWarning: () => void;
  refreshUpdatesAfterBatch?: () => Promise<void>;
  batchInstall: BatchInstallController;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const getRestoreFailureMessage = (
  reason: RestoreFailureReason | undefined,
  t: (key: TranslationKey) => string
): string => {
  if (reason === 'system-protection-disabled') return t('restoreFailDisabled');
  if (reason === 'frequency-limit') return t('restoreFailFrequency');
  if (reason === 'access-denied') return t('restoreFailAccess');
  if (reason === 'service-unavailable') return t('restoreFailService');
  if (reason === 'verification-failed') return t('restoreFailVerification');
  if (reason === 'command-failed') return t('restoreFailCommand');
  return t('restoreFailUnknown');
};

const getInstallerFailureMessage = (
  payload: InstallerFailurePayload | null,
  t: (key: TranslationKey) => string
): string => {
  const category = payload?.category || 'generic';
  let message = t('updateInstallerFailedGeneric');

  if (category === 'postgres-config') message = t('updateInstallerFailedPostgresConfig');
  else if (category === 'existing-config') message = t('updateInstallerFailedExistingConfig');
  else if (category === 'user-cancelled') message = t('updateInstallerFailedCanceled');
  else if (category === 'permission') message = t('updateInstallerFailedPermission');

  if (payload?.installerExitCode) {
    return `${message} (${t('updateInstallerExitCodeLabel')}: ${payload.installerExitCode})`;
  }

  return message;
};

export function useUpdateFlow({
  addToast,
  t,
  updates,
  selectedIds,
  setUpdates,
  setSelectedIds,
  addHistoryEntrySafely,
  resetHistoryWriteWarning,
  refreshUpdatesAfterBatch,
  batchInstall
}: UseUpdateFlowParams) {
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const [restoreDecisionState, setRestoreDecisionState] = useState<RestoreDecisionState | null>(null);
  const [restoreVerificationAlert, setRestoreVerificationAlert] = useState<{ message: string; details?: string } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [batchResults, setBatchResults] = useState<HistoryItem[]>([]);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [runningPreflight, setRunningPreflight] = useState(false);
  const [restoreVerificationSummary, setRestoreVerificationSummary] = useState<RestoreVerificationSummaryState | null>(null);
  const pendingSelectedIdsRef = useRef<Set<string> | null>(null);

  const clearFlowState = useCallback(() => {
    pendingSelectedIdsRef.current = null;
    setShowRestoreModal(false);
    setConflictState(null);
    setRestoreDecisionState(null);
    setRestoreVerificationAlert(null);
    setShowSummary(false);
    setBatchResults([]);
    setPreflightResult(null);
    setRunningPreflight(false);
    setRestoreVerificationSummary(null);
  }, []);

  const hideSummary = useCallback(() => {
    setShowSummary(false);
  }, []);

  const closeRestoreVerificationAlert = useCallback(() => {
    setRestoreVerificationAlert(null);
  }, []);

  const closeRestoreModal = useCallback(() => {
    pendingSelectedIdsRef.current = null;
    setShowRestoreModal(false);
  }, []);

  const handleRestoreDecisionContinue = useCallback(() => {
    if (!restoreDecisionState) return;
    restoreDecisionState.onContinue();
    setRestoreDecisionState(null);
  }, [restoreDecisionState]);

  const handleRestoreDecisionCancel = useCallback(() => {
    if (!restoreDecisionState) return;
    restoreDecisionState.onCancel();
    setRestoreDecisionState(null);
  }, [restoreDecisionState]);

  const handlePreflightContinue = useCallback(() => {
    if (!preflightResult) return;
    const canContinue = preflightResult.overall !== 'error';
    setPreflightResult(null);
    if (canContinue) {
      setShowRestoreModal(true);
    } else {
      pendingSelectedIdsRef.current = null;
    }
  }, [preflightResult]);

  const handlePreflightCancel = useCallback(() => {
    pendingSelectedIdsRef.current = null;
    setPreflightResult(null);
  }, []);

  const askContinueWithoutRestore = useCallback((message: string, details?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setRestoreDecisionState({
        message,
        details,
        onContinue: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  }, []);

  const handleUpdateClick = useCallback(async (selectedOverride?: Set<string>) => {
    const effectiveSelected = selectedOverride ?? selectedIds;
    if (effectiveSelected.size === 0) return;

    pendingSelectedIdsRef.current = new Set(effectiveSelected);
    setRunningPreflight(true);

    try {
      const result = await window.ipcRenderer.invoke('system:run-preflight') as PreflightResult;
      if (!result.success || result.overall !== 'ok') {
        setPreflightResult(result);
        return;
      }
      setShowRestoreModal(true);
    } catch (error) {
      console.error('[useUpdateFlow] Preflight failed unexpectedly:', error);
      addToast(t('preflightUnexpectedFailure'), 'warning');
      setShowRestoreModal(true);
    } finally {
      setRunningPreflight(false);
    }
  }, [addToast, selectedIds, t]);

  const processUpdates = useCallback(async (createRestore: boolean) => {
    setShowRestoreModal(false);
    resetHistoryWriteWarning();
    batchInstall.beginInstallSession();
    setBatchResults([]);
    setRestoreVerificationSummary(null);

    let operationToken: string | null = null;
    let createdRestoreMeta: { sequenceNumber: number; description: string } | null = null;
    const selectedSnapshot = pendingSelectedIdsRef.current
      ? new Set(pendingSelectedIdsRef.current)
      : new Set(selectedIds);

    pendingSelectedIdsRef.current = null;

    if (selectedSnapshot.size === 0) {
      batchInstall.resetBatchInstallState();
      addToast(t('summaryRetryNothing'), 'info');
      return;
    }

    try {
      operationToken = await window.ipcRenderer.invoke('system:begin-operation');

      if (createRestore) {
        batchInstall.setIsCreatingRestore(true);
        batchInstall.setCurrentLogLine(t('creatingRestore'));
        try {
          const result = await window.ipcRenderer.invoke(
            'system:create-restore-point',
            'All Updater Auto-Restore'
          ) as RestorePointResult;

          if (!result.success) {
            const specificMessage = getRestoreFailureMessage(result.reason, t);
            console.error('[useUpdateFlow] Restore point failed:', result);
            addToast(specificMessage, 'error');
            batchInstall.setCurrentLogLine(specificMessage);
            const continueWithoutRestore = await askContinueWithoutRestore(specificMessage, result.details);
            setRestoreDecisionState(null);
            if (!continueWithoutRestore) {
              addToast(t('restoreFailedAbort'), 'warning');
              return;
            }
            addToast(t('restoreContinueWithoutPoint'), 'warning');
          } else if (typeof result.sequenceNumber === 'number' && typeof result.description === 'string') {
            createdRestoreMeta = {
              sequenceNumber: result.sequenceNumber,
              description: result.description
            };
          }
        } catch (error) {
          console.error('[useUpdateFlow] Failed to create restore point', error);
          const details = getErrorMessage(error);
          const unknownMessage = t('restoreFailUnknown');
          addToast(`${t('restoreFailedAbort')} ${unknownMessage}`, 'error');
          batchInstall.setCurrentLogLine(unknownMessage);
          const continueWithoutRestore = await askContinueWithoutRestore(unknownMessage, details);
          setRestoreDecisionState(null);
          if (!continueWithoutRestore) {
            batchInstall.setCurrentLogLine(null);
            return;
          }
          addToast(t('restoreContinueWithoutPoint'), 'warning');
        } finally {
          batchInstall.setIsCreatingRestore(false);
        }
      }

      const total = selectedSnapshot.size;
      let current = 0;
      const currentResults: HistoryItem[] = [];
      let stopBatchForNetwork = false;
      batchInstall.initializeBatchProgress(total);

      const queue = Array.from(selectedSnapshot);
      let i = 0;

      while (i < queue.length) {
        if (batchInstall.isBatchCancelRequested()) {
          break;
        }

        const id = queue[i];
        const update = updates.find((item) => item.id === id);
        const appName = update?.name || id;
        const appVersion = update?.available || 'unknown';

        try {
          batchInstall.markBatchItemStarted();
          batchInstall.setCurrentInstallingApp(appName);
          batchInstall.setCurrentLogLine(null);
          batchInstall.setCurrentAppProgress(3);
          batchInstall.setCurrentAppProgressMode('estimated');
          batchInstall.startEstimatedAppProgress();

          let retry = true;
          while (retry) {
            try {
              retry = false;
              await window.ipcRenderer.invoke('winget:install-update', id, update?.source);
            } catch (error: unknown) {
              const errorMessage = getErrorMessage(error);

              if (errorMessage.includes('AppInUse')) {
                const userDecision = await new Promise<'retry' | 'skip'>((resolve) => {
                  setConflictState({
                    appName,
                    onRetry: () => resolve('retry'),
                    onSkip: () => resolve('skip')
                  });
                });

                setConflictState(null);

                if (userDecision === 'retry') {
                  retry = true;
                  continue;
                }
              }

              throw error;
            }
          }

          const historyEntry: Omit<HistoryItem, 'date'> = {
            id,
            appName,
            version: appVersion,
            previousVersion: update?.version,
            status: 'success'
          };
          await addHistoryEntrySafely(historyEntry);
          currentResults.push({ ...historyEntry, date: new Date().toISOString() });

          addToast(`${t('updateSuccess')} ${appName}`, 'success');
          batchInstall.stopEstimatedAppProgress();
          batchInstall.setCurrentAppProgressMode('real');
          batchInstall.setCurrentAppProgress(100);

          setUpdates((prev) => prev.filter((item) => item.id !== id));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } catch (error: unknown) {
          const errorMessage = getErrorMessage(error);
          const installerFailurePayload = parseInstallerFailurePayload(errorMessage);
          const installerFailureMessage = installerFailurePayload
            ? getInstallerFailureMessage(installerFailurePayload, t)
            : null;
          console.error(`[useUpdateFlow] Failed to update ${id}`, error);

          const isInapplicable = errorMessage.includes('Inapplicable');
          const isReboot = errorMessage.includes('RebootRequired');
          const isInUse = errorMessage.includes('AppInUse');
          const isSecurity = errorMessage.includes('HashMismatch');
          const isFileLockDetected = errorMessage.includes('FileLockDetected');
          const isInstallerFailed = Boolean(installerFailurePayload);
          const isNetworkInterrupted = errorMessage.includes('NetworkInterrupted');
          const failureDetails = isNetworkInterrupted
            ? t('updateNetworkInterruptedDetail')
            : installerFailureMessage || errorMessage;

          let status: 'failed' | 'inapplicable' | 'reboot' | 'in-use' | 'security-error' = 'failed';
          if (isInapplicable) status = 'inapplicable';
          if (isReboot) status = 'reboot';
          if (isInUse) status = 'in-use';
          if (isSecurity) status = 'security-error';

          const historyEntry: Omit<HistoryItem, 'date'> = {
            id,
            appName,
            version: appVersion,
            previousVersion: update?.version,
            status,
            details: failureDetails
          };
          await addHistoryEntrySafely(historyEntry);
          currentResults.push({ ...historyEntry, date: new Date().toISOString() });

          if (isInapplicable) {
            addToast(`${appName}: ${t('updateSkipped')}`, 'warning');
          } else if (isNetworkInterrupted) {
            addToast(`${appName}: ${t('updateNetworkInterruptedApp')}`, 'warning');
            stopBatchForNetwork = true;
          } else if (isInstallerFailed && installerFailureMessage) {
            addToast(`${appName}: ${installerFailureMessage}`, 'warning');
          } else if (isSecurity) {
            addToast(`${appName}: ${t('updateSecuritySkipped')}`, 'error');
          } else if (isReboot) {
            addToast(`${appName}: ${t('updateRebootPending')}`, 'warning');
            setUpdates((prev) => prev.filter((item) => item.id !== id));
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          } else if (isInUse) {
            addToast(`${appName}: ${t('updateInUseSkipped')}`, 'warning');
          } else if (isFileLockDetected) {
            addToast(`${appName}: ${t('updateFileLockDetected')}`, 'warning');
          } else {
            addToast(`${t('updateFailed')} ${appName}`, 'error');
          }
        }

        current++;
        batchInstall.markBatchItemCompleted();
        batchInstall.updateBatchProgress(current, total);
        batchInstall.stopEstimatedAppProgress();
        batchInstall.setCurrentAppProgress(null);
        batchInstall.setCurrentAppProgressMode(null);

        if (stopBatchForNetwork) {
          batchInstall.setCurrentLogLine(t('updateBatchStoppedNoInternet'));
          break;
        }

        if (batchInstall.isBatchCancelRequested()) {
          batchInstall.setCurrentLogLine(t('updateBatchCanceledAfterCurrent'));
          break;
        }

        i++;
      }

      if (stopBatchForNetwork) {
        addToast(t('updateBatchStoppedNoInternet'), 'warning');
      }

      if (batchInstall.isBatchCancelRequested()) {
        addToast(t('updateBatchCanceledAfterCurrent'), 'info');
      }

      if (createdRestoreMeta) {
        try {
          const verification = await window.ipcRenderer.invoke(
            'system:verify-restore-point',
            createdRestoreMeta.sequenceNumber,
            createdRestoreMeta.description
          ) as RestorePointVerificationResult;

          if (!verification.confirmed) {
            const message = t('restorePostBatchMissing');
            const detailLines = [
              `${t('restoreSequenceLabel')}: ${verification.sequenceNumber}`,
              `${t('restoreExpectedDescriptionLabel')}: ${verification.expectedDescription}`
            ];

            if (verification.actualDescription) {
              detailLines.push(`${t('restoreActualDescriptionLabel')}: ${verification.actualDescription}`);
            }
            if (verification.details) {
              detailLines.push(verification.details);
            }

            const details = detailLines.join('\n');
            setRestoreVerificationAlert({ message, details });
            setRestoreVerificationSummary({ status: 'missing', message, details });
            addToast(message, 'error');
          } else {
            const detailLines = [
              `${t('restoreSequenceLabel')}: ${verification.sequenceNumber}`,
              `${t('restoreExpectedDescriptionLabel')}: ${verification.expectedDescription}`
            ];

            if (verification.actualDescription) {
              detailLines.push(`${t('restoreActualDescriptionLabel')}: ${verification.actualDescription}`);
            }

            setRestoreVerificationSummary({
              status: 'confirmed',
              message: t('restorePostBatchConfirmed'),
              details: detailLines.join('\n')
            });
          }
        } catch (error) {
          const message = t('restorePostBatchUnverified');
          const details = getErrorMessage(error);
          setRestoreVerificationAlert({ message, details });
          setRestoreVerificationSummary({ status: 'unverified', message, details });
          addToast(message, 'warning');
        }
      }

      setBatchResults(currentResults);
      if (currentResults.length > 0) {
        setShowSummary(true);
        if (refreshUpdatesAfterBatch) {
          void refreshUpdatesAfterBatch().catch((error) => {
            console.error('[useUpdateFlow] Auto-refresh after batch failed:', error);
          });
        }
      }
    } finally {
      batchInstall.resetBatchInstallState();
      setConflictState(null);
      setRestoreDecisionState(null);
      setPreflightResult(null);

      if (operationToken) {
        try {
          await window.ipcRenderer.invoke('system:end-operation', operationToken);
        } catch (cleanupError) {
          console.error('[useUpdateFlow] Failed to reset operation state', cleanupError);
        }
      }
    }
  }, [
    addHistoryEntrySafely,
    addToast,
    askContinueWithoutRestore,
    batchInstall,
    refreshUpdatesAfterBatch,
    resetHistoryWriteWarning,
    selectedIds,
    setSelectedIds,
    setUpdates,
    t,
    updates
  ]);

  const retryFailedFromSummary = useCallback(async () => {
    const retryableStatuses = new Set(['failed', 'in-use', 'security-error']);
    const availableIds = new Set(updates.map((update) => update.id));
    const retryIds = batchResults
      .filter((item) => retryableStatuses.has(item.status))
      .map((item) => item.id)
      .filter((id) => availableIds.has(id));

    if (retryIds.length === 0) {
      addToast(t('summaryRetryNothing'), 'info');
      return;
    }

    setSelectedIds(new Set(retryIds));
    setShowSummary(false);
    await handleUpdateClick(new Set(retryIds));
  }, [addToast, batchResults, handleUpdateClick, setSelectedIds, t, updates]);

  const summaryStats = useMemo(() => {
    const summaryTotal = batchResults.length;
    const summaryFailedCount = batchResults.filter(
      (result) => result.status === 'failed' || result.status === 'inapplicable' || result.status === 'in-use' || result.status === 'security-error'
    ).length;
    const summaryUpdatedCount = batchResults.filter((result) => result.status === 'success').length;
    const summaryRebootCount = batchResults.filter((result) => result.status === 'reboot').length;
    const summaryNoChangeCount = batchResults.filter(
      (result) => result.status === 'inapplicable' || result.status === 'skipped'
    ).length;
    const summaryActionNeededCount = batchResults.filter(
      (result) => result.status === 'failed' || result.status === 'in-use' || result.status === 'security-error'
    ).length;
    const retryableStatuses = new Set(['failed', 'in-use', 'security-error']);
    const availableUpdateIds = new Set(updates.map((update) => update.id));
    const retryableSummaryIds = batchResults
      .filter((result) => retryableStatuses.has(result.status))
      .map((result) => result.id)
      .filter((id) => availableUpdateIds.has(id));

    return {
      summaryTotal,
      summaryFailedCount,
      summaryUpdatedCount,
      summaryRebootCount,
      summaryNoChangeCount,
      summaryActionNeededCount,
      hasRetryableSummaryItems: retryableSummaryIds.length > 0,
      hasSuccessfulResults: batchResults.some((result) => result.status === 'success' || result.status === 'reboot')
    };
  }, [batchResults, updates]);

  return {
    showRestoreModal,
    conflictState,
    restoreDecisionState,
    restoreVerificationAlert,
    showSummary,
    batchResults,
    preflightResult,
    runningPreflight,
    restoreVerificationSummary,
    summaryStats,
    handleUpdateClick,
    processUpdates,
    retryFailedFromSummary,
    hideSummary,
    closeRestoreVerificationAlert,
    closeRestoreModal,
    handleRestoreDecisionContinue,
    handleRestoreDecisionCancel,
    handlePreflightContinue,
    handlePreflightCancel,
    clearFlowState
  };
}
