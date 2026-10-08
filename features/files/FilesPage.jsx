import { h, Fragment, useEffect, useMemo, useRef, useState } from "../../assets/preact.esm.js";
import Sidebar from "../../commons/components/Sidebar.jsx";
import MobileNavbar from "../../commons/components/MobileNavbar.jsx";
import EmptyState from "../../commons/components/EmptyState.jsx";
import Spinner from "../../commons/components/Spinner.jsx";
import Button from "../../commons/components/Button.jsx";
import { AttachmentsIcon, GalleryViewIcon, ImagesIcon, ListViewIcon } from "../../commons/components/Icon.jsx";
import { LayoutProvider } from "../../commons/contexts/LayoutContext.jsx";
import { NotesProvider } from "../../commons/contexts/NotesContext.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import { showToast } from "../../commons/components/Toast.jsx";
import { t } from "../../commons/i18n/index.js";
import AttachmentList from "../notes/AttachmentList.jsx";
import MediaGallery, { isVideoAttachment } from "./MediaGallery.jsx";
import MediaList from "./MediaList.jsx";
import "./FilesPage.css";

const IMAGE_PAGE_SIZE = 30;

function getInitialTab() {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "images") return "media";
  return ["media", "attachments"].includes(tab) ? tab : "media";
}

function getItems(response, key) {
  return Array.isArray(response?.[key]) ? response[key] : [];
}

function AutoLoadMore({ onLoadMore, isLoading }) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || isLoading) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onLoadMore();
    }, { rootMargin: "160px 0px" });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, isLoading]);

  return (
    <div className="files-auto-load" ref={sentinelRef} aria-live="polite">
      {isLoading && <Spinner />}
    </div>
  );
}

function FileSection({ hasMore, onLoadMore, isLoadingMore, children }) {
  return (
    <section className="files-section">
      {children}
      {hasMore && (
        <AutoLoadMore onLoadMore={onLoadMore} isLoading={isLoadingMore} />
      )}
    </section>
  );
}

export default function FilesPage() {
  return (
    <NotesProvider>
      <LayoutProvider>
        <FilesPageContent />
      </LayoutProvider>
    </NotesProvider>
  );
}

function FilesPageContent() {
  const [, setLanguageVersion] = useState(0);
  const [tab, setTab] = useState(getInitialTab);
  const [mediaView, setMediaView] = useState("list");
  const [mediaThumbnailSize, setMediaThumbnailSize] = useState(180);
  const [query, setQuery] = useState("");
  const [images, setImages] = useState([]);
  const [imagesTotal, setImagesTotal] = useState(0);
  const [imagesPage, setImagesPage] = useState(1);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsTotal, setAttachmentsTotal] = useState(0);
  const [attachmentsPage, setAttachmentsPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMoreImages, setIsLoadingMoreImages] = useState(false);
  const [isLoadingMoreAttachments, setIsLoadingMoreAttachments] = useState(false);
  const isLoadingMoreImagesRef = useRef(false);
  const isLoadingMoreAttachmentsRef = useRef(false);
  const scrollContentRef = useRef(null);
  const [isCleaning, setIsCleaning] = useState(false);

  async function loadImages(page = 1) {
    const response = await ApiClient.getImages(null, null, page, false, IMAGE_PAGE_SIZE);
    const nextItems = getItems(response, "images");
    setImages((current) => page > 1 ? [...current, ...nextItems] : nextItems);
    setImagesTotal(Number(response?.total) || 0);
  }

  async function loadAttachments(page = 1) {
    const response = await ApiClient.getAttachments(page);
    const nextItems = getItems(response, "attachments");
    setAttachments((current) => page > 1 ? [...current, ...nextItems] : nextItems);
    setAttachmentsTotal(Number(response?.total) || 0);
  }

  async function refreshFiles(scope = tab) {
    setIsLoading(true);
    try {
      if (scope === "images") {
        setImagesPage(1);
        await loadImages(1);
      } else if (scope === "attachments") {
        setAttachmentsPage(1);
        await loadAttachments(1);
      } else {
        setImagesPage(1);
        setAttachmentsPage(1);
        // Images are the visual first impression of the page. Show them as
        // soon as they are ready and keep attachment loading in the background.
        await loadImages(1);
        setIsLoading(false);
        await loadAttachments(1);
      }
    } catch (error) {
      console.error("Failed to load files:", error);
      showToast(t("files.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshFiles(getInitialTab());
  }, []);

  useEffect(() => {
    const rerenderForLanguage = () => setLanguageVersion((version) => version + 1);
    window.addEventListener("i18n:change", rerenderForLanguage);
    return () => window.removeEventListener("i18n:change", rerenderForLanguage);
  }, []);

  useEffect(() => {
    const refresh = () => refreshFiles(tab);
    window.addEventListener("images:refresh", refresh);
    window.addEventListener("attachments:refresh", refresh);
    return () => {
      window.removeEventListener("images:refresh", refresh);
      window.removeEventListener("attachments:refresh", refresh);
    };
  }, [tab]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleImages = useMemo(
    () => images.filter((image) => !normalizedQuery || image.filename.toLocaleLowerCase().includes(normalizedQuery)),
    [images, normalizedQuery]
  );
  const visibleAttachments = useMemo(
    () => attachments.filter((attachment) => {
      const name = attachment.originalName || attachment.filename || "";
      return !normalizedQuery || name.toLocaleLowerCase().includes(normalizedQuery);
    }),
    [attachments, normalizedQuery]
  );
  const videoAttachments = useMemo(() => visibleAttachments.filter(isVideoAttachment), [visibleAttachments]);
  const fileAttachments = useMemo(() => visibleAttachments.filter((attachment) => !isVideoAttachment(attachment)), [visibleAttachments]);
  const mediaCount = visibleImages.length + videoAttachments.length;

  async function handleCleanup(kind) {
    if (isCleaning) return;
    setIsCleaning(true);
    try {
      if (kind === "images") {
        const result = await ApiClient.cleanupImages();
        showToast(t("images.cleanup.toast", {
          missing: result?.RemovedMissing || 0,
          orphans: result?.RemovedOrphans || 0,
          registered: result?.Registered || 0,
          linksRebuilt: result?.LinksRebuilt || 0,
        }));
      } else {
        const result = await ApiClient.cleanupAttachments();
        showToast(t("attachments.cleanup.toast", {
          orphans: result?.removedOrphans || 0,
          linksRebuilt: result?.linksRebuilt || 0,
        }));
      }
      await refreshFiles(kind === "images" ? "images" : "attachments");
    } catch (error) {
      console.error("File cleanup failed:", error);
      showToast(t(kind === "images" ? "images.cleanup.fail" : "attachments.cleanup.fail"));
    } finally {
      setIsCleaning(false);
    }
  }

  async function loadMoreImages() {
    if (isLoadingMoreImagesRef.current || images.length >= imagesTotal) return;
    const nextPage = imagesPage + 1;
    isLoadingMoreImagesRef.current = true;
    setIsLoadingMoreImages(true);
    try {
      await loadImages(nextPage);
      setImagesPage(nextPage);
    } catch (error) {
      console.error("Failed to load more images:", error);
    } finally {
      isLoadingMoreImagesRef.current = false;
      setIsLoadingMoreImages(false);
    }
  }

  async function loadMoreAttachments() {
    if (isLoadingMoreAttachmentsRef.current || attachments.length >= attachmentsTotal) return;
    const nextPage = attachmentsPage + 1;
    isLoadingMoreAttachmentsRef.current = true;
    setIsLoadingMoreAttachments(true);
    try {
      await loadAttachments(nextPage);
      setAttachmentsPage(nextPage);
    } catch (error) {
      console.error("Failed to load more attachments:", error);
    } finally {
      isLoadingMoreAttachmentsRef.current = false;
      setIsLoadingMoreAttachments(false);
    }
  }

  async function loadMoreMedia() {
    await Promise.all([
      images.length < imagesTotal ? loadMoreImages() : Promise.resolve(),
      attachments.length < attachmentsTotal ? loadMoreAttachments() : Promise.resolve(),
    ]);
  }

  function handleTabChange(nextTab) {
    if (nextTab === tab) return;
    if (scrollContentRef.current) scrollContentRef.current.scrollTop = 0;
    setTab(nextTab);
    refreshFiles(nextTab);
  }

  function handleMediaViewChange(nextView) {
    setMediaView(nextView);
  }

  function renderMedia() {
    if (mediaCount === 0) {
      return <EmptyState icon={<ImagesIcon />} title={t("files.empty.media.title")} description={t("files.empty.media.desc")} />;
    }
    if (mediaView === "gallery") {
      return <MediaGallery images={visibleImages} videos={videoAttachments} thumbnailSize={mediaThumbnailSize} />;
    }
    return <MediaList images={visibleImages} videos={videoAttachments} />;
  }

  function renderAttachments() {
    if (fileAttachments.length === 0) {
      return <EmptyState icon={<AttachmentsIcon />} title={t("files.empty.attachments.title")} description={t("files.empty.attachments.desc")} />;
    }
    return <AttachmentList attachments={fileAttachments} />;
  }

  let content;
  if (isLoading) {
    content = <div className="files-loading"><Spinner /></div>;
  } else if (tab === "media") {
    content = <FileSection title={t("files.section.media")} items={mediaCount} hasMore={images.length < imagesTotal || attachments.length < attachmentsTotal} onLoadMore={loadMoreMedia} isLoadingMore={isLoadingMoreImages || isLoadingMoreAttachments}>{renderMedia()}</FileSection>;
  } else if (tab === "attachments") {
    content = <FileSection title={t("files.section.attachments")} items={attachments} total={attachmentsTotal} onLoadMore={loadMoreAttachments} isLoadingMore={isLoadingMoreAttachments}>{renderAttachments()}</FileSection>;
  } else if (mediaCount === 0 && fileAttachments.length === 0) {
    content = <EmptyState icon={<AttachmentsIcon />} title={t("files.empty.all.title")} description={t("files.empty.all.desc")} />;
  }

  return (
    <div className="page-container">
      <Sidebar />
      <main className="files-page-content">
        <div className="files-sticky-top">
          <header className="files-header">
          <div>
            <h1>{t("files.title")}</h1>
            <p>{t("files.desc")}</p>
          </div>
          <div className="files-maintenance">
            {tab === "media" && <Button isDisabled={isCleaning} onClick={() => handleCleanup("images")}>{t("images.cleanup.button")}</Button>}
            {tab === "attachments" && <Button isDisabled={isCleaning} onClick={() => handleCleanup("attachments")}>{t("attachments.cleanup.button")}</Button>}
          </div>
          </header>
          <div className="files-controls">
          <div className="files-tabs" role="tablist" aria-label={t("files.tabs.label")}>
            {["media", "attachments"].map((value) => (
              <button type="button" role="tab" key={value} className={tab === value ? "is-active" : ""} onClick={() => handleTabChange(value)}>
                {t(`files.tabs.${value}`)} {value === "media" ? imagesTotal + videoAttachments.length : fileAttachments.length}
              </button>
            ))}
          </div>
          <input className="files-search" type="search" value={query} onInput={(event) => setQuery(event.target.value)} placeholder={t("files.searchPlaceholder")} aria-label={t("files.searchPlaceholder")} />
          {tab === "media" && (
            <div className="files-media-controls">
              {mediaView === "gallery" && (
                <label className="media-thumbnail-size" title={t("files.media.thumbnailSize")}>
                  <span>{t("files.media.thumbnailSize")}</span>
                  <input type="range" min="120" max="320" step="20" value={mediaThumbnailSize} onInput={(event) => setMediaThumbnailSize(Number(event.target.value))} />
                </label>
              )}
              <div className="files-view-switch" role="group" aria-label={t("files.media.view")}>
                <button type="button" className={mediaView === "list" ? "is-active" : ""} onClick={() => handleMediaViewChange("list")} title={t("files.media.list")} aria-label={t("files.media.list")}><ListViewIcon /></button>
                <button type="button" className={mediaView === "gallery" ? "is-active" : ""} onClick={() => handleMediaViewChange("gallery")} title={t("files.media.gallery")} aria-label={t("files.media.gallery")}><GalleryViewIcon /></button>
              </div>
            </div>
          )}
          </div>
          <div className="files-fixed-table-header">
            {tab === "media" && mediaView === "list" ? (
              <div className="media-table-header">
                <div className="col-media-thumb">{t("images.list.thumb")}</div><div className="col-media-name">{t("images.list.filename")}</div><div className="col-media-type">{t("files.media.type")}</div><div className="col-media-dimensions">{t("images.list.dimensions")}</div><div className="col-media-size">{t("images.list.size")}</div><div className="col-media-notes">{t("images.list.linkedNotes")}</div><div className="col-media-tags">{t("images.list.tags")}</div><div className="col-media-storage">{t("images.list.storage")}</div><div className="col-media-date">{t("images.list.date")}</div><div className="col-media-actions">{t("images.list.actions")}</div>
              </div>
            ) : tab === "attachments" ? (
              <div className="attachment-table-header">
                <div className="col-name">{t("attachments.list.name")}</div><div className="col-type">{t("attachments.list.type")}</div><div className="col-size">{t("attachments.list.size")}</div><div className="col-notes">{t("attachments.list.linkedNotes")}</div><div className="col-tags">{t("attachments.list.tags")}</div><div className="col-storage">{t("attachments.list.storage")}</div><div className="col-date">{t("attachments.list.date")}</div><div className="col-actions">{t("attachments.list.actions")}</div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="files-scroll-content" ref={scrollContentRef}>
          {content}
        </div>
      </main>
      <MobileNavbar />
      <div className="modal-root"></div>
      <div className="note-modal-root"></div>
      <div className="toast-root"></div>
    </div>
  );
}
