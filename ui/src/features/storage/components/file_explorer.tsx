import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AiAssistantIcon } from '@/features/storage/components/ai_icon';
import {
  ArrowLeft,
  Search,
  Sparkles,
  SlidersHorizontal,
  Settings2,
  X,
  Upload,
  ChevronDown,
  File as FileIcon,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileCode2,
  FolderUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  Trash2,
  Check,
  DatabaseZap,
  Ban,
  Link2,
} from 'lucide-react';
import { ChatPage } from '@/features/chat/components/chat_page';
import {
  useDeleteFilesMutation,
  useIndexFilesMutation,
  useListFilesQuery,
  useUploadFilesMutation,
  type CloudFile,
} from '@/features/storage/api/storage_api';
import { auth } from '@/shared/lib/firebase';
import { useAppDispatch, useAppSelector } from '@/app/store';
import { clearStorageSearchQuery, setStorageSearchQuery } from '@/features/storage/state/storage_search_slice';

// How long to wait after the user stops typing before the search actually
// fires — without this, every keystroke would dispatch a redux update and
// (since that redux value drives the RTK Query arg) fire a new /list_files
// request, which is wasteful and would make results flicker mid-word.
const SEARCH_DEBOUNCE_MS = 350;

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 3;
const STORAGE_CHAT_WINDOW_ID = 'storage-chat';

type UploadItem = {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'success' | 'error';
  errorMessage?: string;
  file: File;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const maybe = err as { data?: { error?: string }; error?: string };
    if (maybe.data?.error) return maybe.data.error;
    if (typeof maybe.error === 'string') return maybe.error;
  }
  return 'Something went wrong';
}

function getFileVisual(name: string): { Icon: typeof FileIcon; className: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return { Icon: FileText, className: 'file-icon--pdf' };
  if (['doc', 'docx'].includes(ext)) return { Icon: FileText, className: 'file-icon--doc' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { Icon: FileSpreadsheet, className: 'file-icon--sheet' };
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return { Icon: FileImage, className: 'file-icon--image' };
  if (['js', 'ts', 'tsx', 'jsx', 'json', 'py', 'java', 'go', 'rs', 'html', 'css'].includes(ext)) {
    return { Icon: FileCode2, className: 'file-icon--code' };
  }
  return { Icon: FileIcon, className: 'file-icon--default' };
}

function ownerInitials(): string {
  const user = auth.currentUser;
  const source = user?.displayName?.trim() || user?.email?.split('@')[0] || '';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase() || '?';
}

const baseName = (key: string) => key.split('/').pop() || key;

function formatChanged(value: string | null): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

type RagBadgeProps = {
  file: CloudFile;
  indexing: boolean;
  onIndex: () => void;
};
// Whether the AI can search this file (RAG), with a button for files that
// aren't indexed yet.
function RagBadge({ file, indexing, onIndex }: RagBadgeProps) {
  const rag = file.rag;
  if (!rag) return <span className="text-secondary">—</span>;
  if (indexing) {
    return (
      <span className="rag-badge rag-badge--busy">
        <Loader2 size={13} className="spinner-icon" />
        <span className="rag-badge__label">Indexing…</span>
      </span>
    );
  }
  switch (rag.status) {
    case 'indexed':
      return (
        <span className="rag-badge rag-badge--indexed" title={`Searchable by the AI · ${rag.chunks} section${rag.chunks === 1 ? '' : 's'}`}>
          <CheckCircle2 size={13} />
          <span className="rag-badge__label">Indexed</span>
        </span>
      );
    case 'copy':
      return (
        <span className="rag-badge rag-badge--copy" title={`Text copy of "${baseName(rag.of)}" — searchable through that file`}>
          <Link2 size={13} />
          <span className="rag-badge__label">Text copy</span>
        </span>
      );
    case 'unsupported':
      return (
        <span className="rag-badge rag-badge--none" title="No text to search in this kind of file">
          <Ban size={13} />
          <span className="rag-badge__label">No text</span>
        </span>
      );
    default:
      return (
        <button
          type="button"
          className="rag-index-btn"
          title="Not searchable yet — build the AI search index for this file"
          aria-label={`Index ${file.name} for AI search`}
          onClick={onIndex}
        >
          <DatabaseZap size={13} />
          <span className="rag-badge__label">Index now</span>
        </button>
      );
  }
}

type ConfirmDialogProps = {
  title: string;
  subtitle?: string;
  confirmLabel: string;
  confirmTone?: 'default' | 'danger';
  confirmDisabled?: boolean;
  confirmIcon?: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
};
function ConfirmDialog({
  title,
  subtitle,
  confirmLabel,
  confirmTone = 'default',
  confirmDisabled,
  confirmIcon,
  onCancel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div className="modal__header-text">
            <div className="modal__title">{title}</div>
            {subtitle && <div className="modal__subtitle">{subtitle}</div>}
          </div>
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${confirmTone === 'danger' ? 'btn--danger' : 'btn--primary'}`}
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              {confirmIcon}
              {confirmLabel}
            </button>
          </div>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

export function S3FolderBrowser() {
  const navigate = useNavigate();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);

  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  // Search: local state gives instant typing feedback; the redux value only
  // updates after SEARCH_DEBOUNCE_MS of no typing, and that debounced value
  // is what actually drives the useListFilesQuery arg below.
  const dispatch = useAppDispatch();
  const [searchInput, setSearchInput] = useState('');
  const searchQuery = useAppSelector((s) => s.storageSearch.query);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput.trim()) {
        dispatch(setStorageSearchQuery(searchInput.trim()));
      } else {
        dispatch(clearStorageSearchQuery());
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput, dispatch]);

  // NEW: multi-select + delete
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [keysPendingDelete, setKeysPendingDelete] = useState<string[] | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target as Node)) {
        setIsUploadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cursor-based pagination: S3 only hands back a forward continuation token,
  // so we cache the token that leads to each page we've visited, which lets us
  // support a numbered Prev/Next pager instead of a one-way "Load more" button.
  const [pageTokens, setPageTokens] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const currentPageToken = pageTokens[pageIndex];
  const { data, isLoading, isFetching, error } = useListFilesQuery({
    continuationToken: currentPageToken,
    search: searchQuery || undefined,
  });

  useEffect(() => {
    if (!data?.continuationToken) return;
    setPageTokens((prev) => {
      if (prev[pageIndex + 1] === data.continuationToken) return prev;
      const next = prev.slice(0, pageIndex + 1);
      next[pageIndex + 1] = data.continuationToken!;
      return next;
    });
  }, [data?.continuationToken, pageIndex]);

  const resetPagination = () => {
    setPageIndex(0);
    setPageTokens([undefined]);
  };

  // A search result set isn't paginated the same way a plain listing is (the
  // backend returns a flat, unpaginated match list — see storage_routes.ts),
  // so a page cursor from browsing plain results is meaningless once a
  // search starts, and vice versa when it's cleared.
  useEffect(() => {
    resetPagination();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const hasNextPage = Boolean(data?.continuationToken);
  const hasPrevPage = pageIndex > 0;
  const goToNextPage = () => {
    if (hasNextPage) setPageIndex((p) => p + 1);
  };
  const goToPrevPage = () => {
    if (hasPrevPage) setPageIndex((p) => p - 1);
  };
  const [triggerUpload] = useUploadFilesMutation();
  const [triggerDelete, { isLoading: isDeleting }] = useDeleteFilesMutation();
  const [triggerIndex] = useIndexFilesMutation();

  // Search index (RAG): which rows are indexing right now, and the outcome
  // of the last run (shown in a banner above the list).
  const [indexingKeys, setIndexingKeys] = useState<Set<string>>(new Set());
  const [indexingAll, setIndexingAll] = useState(false);
  const [indexNotice, setIndexNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const ownerAvatar = ownerInitials();

  const indexFiles = async (keys: string[] | 'all') => {
    setIndexNotice(null);
    const all = keys === 'all';
    if (all) setIndexingAll(true);
    else setIndexingKeys((prev) => new Set([...prev, ...keys]));
    try {
      const r = await triggerIndex(all ? { all: true } : { keys }).unwrap();
      const failures = r.results.filter((x) => x.status === 'failed');
      if (r.indexed === 0 && failures.length === 0) {
        setIndexNotice({ tone: 'success', text: 'Every file is already indexed.' });
      } else if (failures.length === 0) {
        setIndexNotice({
          tone: 'success',
          text: `Indexed ${r.indexed} file${r.indexed === 1 ? '' : 's'} — the AI can search ${r.indexed === 1 ? 'it' : 'them'} now.${r.remaining ? ` ${r.remaining} more left; run it again.` : ''}`,
        });
      } else {
        const first = failures[0];
        setIndexNotice({
          tone: 'error',
          text: `${r.indexed ? `Indexed ${r.indexed}, ` : ''}${failures.length} failed${first.status === 'failed' ? ` — ${first.error}` : ''}`,
        });
      }
    } catch (err) {
      setIndexNotice({ tone: 'error', text: getErrorMessage(err) });
    } finally {
      if (all) setIndexingAll(false);
      else
        setIndexingKeys((prev) => {
          const next = new Set(prev);
          keys.forEach((k) => next.delete(k));
          return next;
        });
    }
  };

  const activeUploadsCount = uploadQueue.filter((item) => item.status === 'uploading').length;
  const isUploading = activeUploadsCount > 0;

  const files = data?.files ?? [];
  const allSelected = files.length > 0 && files.every((f) => selectedKeys.has(f.key));
  const unindexedCount = files.filter((f) => f.rag?.status === 'not_indexed').length;
  const selectedUnindexed = files.filter((f) => selectedKeys.has(f.key) && f.rag?.status === 'not_indexed').map((f) => f.key);

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setUploadQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };
  const handleOpenFile = (file: { url?: string }) => {
    console.log(file);
    if (!file.url) return;
    window.open(file.url, '_blank', 'noopener,noreferrer');
  };

  const toggleSelected = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedKeys(() => {
      if (allSelected) return new Set();
      return new Set(files.map((f) => f.key));
    });
  };

  const clearSelection = () => setSelectedKeys(new Set());

  const requestDelete = (keys: string[]) => {
    setDeleteError(null);
    setKeysPendingDelete(keys);
  };

  const confirmDelete = async () => {
    if (!keysPendingDelete) return;
    try {
      await triggerDelete(keysPendingDelete).unwrap();
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        keysPendingDelete.forEach((k) => next.delete(k));
        return next;
      });
      setKeysPendingDelete(null);
      resetPagination();
    } catch (err) {
      setDeleteError(getErrorMessage(err));
    }
  };

  // Picking files now just opens the review dialog — nothing uploads yet.
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      e.target.value = '';
      return;
    }
    const selected = Array.from(fileList); // snapshot before clearing — input.files is live
    e.target.value = '';
    setPendingFiles(selected);
    setIsConfirmDialogOpen(true);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const cancelSelection = () => {
    setPendingFiles([]);
    setIsConfirmDialogOpen(false);
  };

  const uploadFileList = async (selected: File[]) => {
    if (!selected.length) return;

    const items: UploadItem[] = selected.map((file, index) => {
      const oversized = file.size > MAX_FILE_SIZE;
      return {
        id: `${Date.now()}-${index}-${file.name}`,
        name: file.name,
        size: file.size,
        file,
        status: oversized ? 'error' : 'uploading',
        errorMessage: oversized ? `Exceeds ${formatBytes(MAX_FILE_SIZE)} limit` : undefined,
      };
    });

    setUploadQueue((prev) => [...prev, ...items]);
    setIsUploadPanelOpen(true);

    const toUpload = items.filter((item) => item.status === 'uploading');
    let cursor = 0;
    const worker = async (): Promise<void> => {
      const index = cursor++;
      if (index >= toUpload.length) return;
      await runUpload(toUpload[index]);
      return worker();
    };
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, toUpload.length) }, worker));
    resetPagination();
  };

  const confirmUpload = async () => {
    const filesToUpload = pendingFiles;
    setPendingFiles([]);
    setIsConfirmDialogOpen(false);
    await uploadFileList(filesToUpload);
  };

  const runUpload = async (item: UploadItem) => {
    updateItem(item.id, { status: 'uploading', errorMessage: undefined });
    try {
      await triggerUpload({ files: [item.file], prefix: '' }).unwrap();
      updateItem(item.id, { status: 'success' });
    } catch (err) {
      console.error(`Failed to upload ${item.name}:`, err);
      updateItem(item.id, { status: 'error', errorMessage: getErrorMessage(err) });
    }
  };

  const clearCompleted = () => {
    setUploadQueue((prev) => prev.filter((item) => item.status === 'uploading'));
  };

  return (
    <div className="app-shell">
      {isConfirmDialogOpen && (
        <ConfirmDialog
          title={`${pendingFiles.length} file${pendingFiles.length !== 1 ? 's' : ''} selected`}
          subtitle={`Total: ${formatBytes(pendingFiles.reduce((sum, f) => sum + f.size, 0))}`}
          confirmLabel="Upload"
          confirmIcon={<Upload size={14} />}
          confirmDisabled={pendingFiles.length === 0}
          onCancel={cancelSelection}
          onConfirm={confirmUpload}
        >
          <div className="file-review-list">
            {pendingFiles.length === 0 && (
              <div className="empty-state empty-state--compact">No files left to upload.</div>
            )}
            {pendingFiles.map((file, index) => {
              const oversized = file.size > MAX_FILE_SIZE;
              const { Icon, className } = getFileVisual(file.name);
              return (
                <div key={`${file.name}-${index}`} className="file-review-row">
                  <Icon size={18} className={oversized ? 'file-icon--error' : className} />
                  <div className="file-review-row__text">
                    <div className="file-review-row__name truncate" title={file.name}>
                      {file.name}
                    </div>
                    <div className={`file-review-row__meta ${oversized ? 'file-review-row__meta--error' : ''}`}>
                      {oversized ? `Too large — exceeds ${formatBytes(MAX_FILE_SIZE)}` : formatBytes(file.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-button icon-button--sm"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removePendingFile(index)}
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </ConfirmDialog>
      )}

      {keysPendingDelete && (
        <ConfirmDialog
          title={`Delete ${keysPendingDelete.length} item${keysPendingDelete.length !== 1 ? 's' : ''}?`}
          subtitle="This can't be undone."
          confirmLabel={isDeleting ? 'Deleting…' : 'Delete'}
          confirmTone="danger"
          confirmDisabled={isDeleting}
          confirmIcon={isDeleting ? <Loader2 size={14} className="spinner-icon" /> : <Trash2 size={14} />}
          onCancel={() => setKeysPendingDelete(null)}
          onConfirm={confirmDelete}
        >
          <div className="file-review-list">
            {keysPendingDelete.map((key) => {
              const name = files.find((f) => f.key === key)?.name ?? key;
              const { Icon, className } = getFileVisual(name);
              return (
                <div key={key} className="file-review-row">
                  <Icon size={18} className={className} />
                  <div className="file-review-row__text">
                    <div className="file-review-row__name truncate" title={name}>
                      {name}
                    </div>
                  </div>
                </div>
              );
            })}
            {deleteError && (
              <div className="inline-error">
                <AlertCircle size={14} />
                {deleteError}
              </div>
            )}
          </div>
        </ConfirmDialog>
      )}

      <div className="storage-main">
        <header className="storage-header">
          <button
            type="button"
            className="icon-button storage-header__back"
            aria-label="Back to chat"
            onClick={() => navigate('/chathome')}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="storage-header__titles">
            <div className="storage-heading truncate">Knowledge base</div>
            <div className="storage-subheading truncate">Files your AI assistant can search and cite</div>
          </div>
          <div className="action-icons">
            <div className="upload-menu" ref={uploadMenuRef}>
              <button
                type="button"
                className="upload-btn"
                disabled={isUploading}
                onClick={() => setIsUploadMenuOpen((v) => !v)}
              >
                <Upload size={16} strokeWidth={2.25} />
                <span>{isUploading ? 'Uploading…' : 'Upload'}</span>
                <ChevronDown
                  size={14}
                  strokeWidth={2.25}
                  className={`upload-btn__chevron ${isUploadMenuOpen ? 'upload-btn__chevron--open' : ''}`}
                />
              </button>

              {isUploadMenuOpen && (
                <div className="upload-menu__dropdown">
                  <button
                    type="button"
                    className="upload-menu__item"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setIsUploadMenuOpen(false);
                    }}
                  >
                    <FileIcon size={16} strokeWidth={2} />
                    <div className="upload-menu__item-text">
                      <span>Upload files</span>
                      <small>Select one or more files</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="upload-menu__item"
                    onClick={() => {
                      folderInputRef.current?.click();
                      setIsUploadMenuOpen(false);
                    }}
                  >
                    <FolderUp size={16} strokeWidth={2} />
                    <div className="upload-menu__item-text">
                      <span>Upload folder</span>
                      <small>Keeps the folder structure</small>
                    </div>
                  </button>
                </div>
              )}

              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFilesSelected} />
              <input
                ref={folderInputRef}
                type="file"
                // @ts-ignore
                webkitdirectory="true"
                directory="true"
                multiple
                style={{ display: 'none' }}
                onChange={handleFilesSelected}
              />
            </div>

            {(unindexedCount > 0 || indexingAll) && (
              <button
                type="button"
                className="btn btn--ghost index-all-btn"
                disabled={indexingAll}
                title="Build the AI search index for every file that doesn't have one yet"
                onClick={() => indexFiles('all')}
              >
                {indexingAll ? <Loader2 size={15} className="spinner-icon" /> : <DatabaseZap size={15} />}
                <span>{indexingAll ? 'Indexing…' : 'Index all'}</span>
              </button>
            )}

            <div className="action-icons__divider" />

            <button type="button" className="icon-button" aria-label="Advanced Search">
              <Settings2 size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Filter Results">
              <SlidersHorizontal size={20} />
            </button>
          </div>
        </header>

        <div className="storage-top-bar">
          <div className="storage-top-bar__search_bar">
            <div className="search-icon-group">
              <Search size={20} strokeWidth={2} />
              <Sparkles size={10} strokeWidth={2.5} className="sparkle-icon" />
            </div>
            <input
              className="search-input"
              type="search"
              enterKeyHint="search"
              placeholder="Search your files"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                className="search-input__clear"
                aria-label="Clear search"
                onClick={() => setSearchInput('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {indexNotice && (
          <div className={`index-notice index-notice--${indexNotice.tone}`} role="status">
            {indexNotice.tone === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{indexNotice.text}</span>
            <button type="button" className="index-notice__close" aria-label="Dismiss" onClick={() => setIndexNotice(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="storage-file-list-container">
          {/* Selection toolbar replaces the header row while something is selected */}
          {selectedKeys.size > 0 ? (
            <div className="selection-bar">
              <button type="button" className="selection-bar__checkbox" onClick={toggleSelectAll} aria-label="Deselect all">
                <span className="checkbox checkbox--checked">
                  <Check size={12} strokeWidth={3} />
                </span>
              </button>
              <span className="selection-bar__count">{selectedKeys.size} selected</span>
              <div className="selection-bar__spacer" />
              {selectedUnindexed.length > 0 && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => indexFiles(selectedUnindexed)}>
                  <DatabaseZap size={14} />
                  Index {selectedUnindexed.length}
                </button>
              )}
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => requestDelete(Array.from(selectedKeys))}
              >
                <Trash2 size={14} />
                Delete
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={clearSelection}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="file-row list-header">
              <div className="cell checkbox-cell">
                <button
                  type="button"
                  className="selection-bar__checkbox"
                  onClick={toggleSelectAll}
                  aria-label="Select all"
                  disabled={files.length === 0}
                >
                  <span className="checkbox" />
                </button>
              </div>
              <div className="cell">Name</div>
              <div className="cell date-cell">Changed Date</div>
              <div className="cell owner-cell">Owner</div>
              <div className="cell rag-cell">AI search</div>
              <div className="cell action-cell"></div>
            </div>
          )}

          <div className="storage-file-list-body">
            {isLoading && (
              <div className="skeleton-list">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="file-row skeleton-row">
                    <div className="cell checkbox-cell">
                      <div className="skeleton skeleton--checkbox" />
                    </div>
                    <div className="cell">
                      <div className="skeleton skeleton--icon" />
                      <div className="skeleton skeleton--text" style={{ width: '55%' }} />
                    </div>
                    <div className="cell date-cell">
                      <div className="skeleton skeleton--text" style={{ width: '70%' }} />
                    </div>
                    <div className="cell owner-cell">
                      <div className="skeleton skeleton--text" style={{ width: '40%' }} />
                    </div>
                    <div className="cell rag-cell">
                      <div className="skeleton skeleton--text" style={{ width: '50%' }} />
                    </div>
                    <div className="cell action-cell" />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="empty-state">
                <AlertCircle size={28} />
                <div className="empty-state__title">Couldn't load files</div>
                <div className="empty-state__subtitle">Try refreshing the page.</div>
              </div>
            )}

            {!isLoading && !error && files.length === 0 && (
              <div className="empty-state">
                {searchQuery ? (
                  <>
                    <Search size={28} />
                    <div className="empty-state__title">No results for "{searchQuery}"</div>
                    <div className="empty-state__subtitle">Try a different name or clear the search.</div>
                  </>
                ) : (
                  <>
                    <FolderUp size={28} />
                    <div className="empty-state__title">No files yet</div>
                    <div className="empty-state__subtitle">Upload a file to get started.</div>
                  </>
                )}
              </div>
            )}

            {!isLoading &&
              files.map((file) => {
                const { Icon, className } = getFileVisual(file.name);
                const isSelected = selectedKeys.has(file.key);
                return (
                  <div
                    key={file.key}
                    className={`file-row list-item ${isSelected ? 'list-item--selected' : ''} ${!file.url ? 'list-item--no-link' : ''}`}
                  >
                    <div className="cell checkbox-cell">
                      <button
                        type="button"
                        className="selection-bar__checkbox"
                        onClick={() => toggleSelected(file.key)}
                        aria-label={`Select ${file.name}`}
                      >
                        <span className={`checkbox ${isSelected ? 'checkbox--checked' : ''}`}>
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </span>
                      </button>
                    </div>
                    <div className="cell name-cell" onClick={() => handleOpenFile(file)}>
                      <Icon size={18} className={className} />
                      <div className="name-cell__text">
                        <span className="truncate">{file.name}</span>
                        {/* Shown only once the Date column is hidden on narrow widths */}
                        <span className="name-cell__meta truncate">{formatChanged(file.lastModified)}</span>
                      </div>
                    </div>
                    <div className="cell date-cell">
                      <span className="truncate text-secondary">{formatChanged(file.lastModified)}</span>
                    </div>
                    <div className="cell owner-cell">
                      <div className="avatar" aria-hidden="true">{ownerAvatar}</div>
                      <span className="text-secondary truncate">You</span>
                    </div>
                    <div className="cell rag-cell">
                      <RagBadge
                        file={file}
                        indexing={indexingAll ? file.rag?.status === 'not_indexed' : indexingKeys.has(file.key)}
                        onIndex={() => indexFiles([file.key])}
                      />
                    </div>
                    <div className="cell action-cell">
                      <button
                        type="button"
                        className="icon-button icon-button--sm row-delete-btn"
                        aria-label={`Delete ${file.name}`}
                        onClick={() => requestDelete([file.key])}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>

          {!isLoading && !error && (files.length > 0 || hasPrevPage) && (
            <div className="storage-pagination">
              <span className="storage-pagination__info">
                Page {pageIndex + 1}
                {isFetching && <Loader2 size={13} className="spinner-icon storage-pagination__spinner" />}
              </span>
              <div className="storage-pagination__controls">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={goToPrevPage}
                  disabled={!hasPrevPage || isFetching}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={goToNextPage}
                  disabled={!hasNextPage || isFetching}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {isUploadPanelOpen && uploadQueue.length > 0 && (
          <div className="upload-manager">
            <div className="upload-manager__header">
              <h3>
                {activeUploadsCount > 0
                  ? `Uploading ${activeUploadsCount} item${activeUploadsCount > 1 ? 's' : ''}`
                  : 'Uploads complete'}
              </h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {activeUploadsCount === 0 && (
                  <button className="upload-manager__clear" onClick={clearCompleted}>
                    Clear
                  </button>
                )}
                <button className="upload-manager__close" onClick={() => setIsUploadPanelOpen(false)}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="upload-manager__body">
              {uploadQueue.map((item) => {
                const { Icon, className } = getFileVisual(item.name);
                return (
                  <div key={item.id} className="upload-manager__item">
                    <Icon size={18} className={className} />
                    <div className="upload-manager__item-text">
                      <span className="upload-manager__item-name truncate">{item.name}</span>
                      <small className="upload-manager__item-meta">
                        {item.status === 'error' ? item.errorMessage : formatBytes(item.size)}
                      </small>
                    </div>

                    <div className="upload-manager__item-status">
                      {item.status === 'uploading' && <Loader2 size={16} className="spinner-icon text-blue-500" />}
                      {item.status === 'success' && <CheckCircle2 size={18} className="text-green-500" />}
                      {item.status === 'error' && (
                        <>
                          <AlertCircle size={18} className="text-red-500" />
                          <button
                            className="upload-manager__retry"
                            aria-label={`Retry ${item.name}`}
                            onClick={() => runUpload(item)}
                          >
                            <RotateCcw size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isChatOpen && (
          <button type="button" className="ai-icon" aria-label="Ask AI about your files" onClick={() => setIsChatOpen(true)}>
            <AiAssistantIcon />
            <span className="ai-icon__label">Ask AI</span>
          </button>
        )}
      </div>

      <aside className={`chat-side-panel ${isChatOpen ? 'chat-side-panel--open' : ''}`}>
        <div className="chat-side-panel__inner">
          <button type="button" className="chat-side-panel__close" aria-label="Close AI assistant" onClick={() => setIsChatOpen(false)}>
            <X size={18} />
          </button>
          <div className="chat-side-panel__body">
            {isChatOpen && (
              <ChatPage
                windowId={STORAGE_CHAT_WINDOW_ID}
                showTopBar={false}
                welcomeMessage="Ask me anything about your files"
                className="chat_plane--embedded"
              />
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}