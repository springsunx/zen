import { h, createContext, useContext, useState, useCallback, useEffect, useRef } from '../../assets/preact.esm.js';
import ApiClient from '../../commons/http/ApiClient.js';
import useSearchParams from "../../commons/components/useSearchParams.jsx";
import { t } from "../i18n/index.js";

const NotesContext = createContext();

export function NotesProvider({ children }) {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesPageNumber, setNotesPageNumber] = useState(1);
  const [isNotesLoading, setIsNotesLoading] = useState(true);
  const [images, setImages] = useState([]);
  const [imagesTotal, setImagesTotal] = useState(0);
  const [imagesPageNumber, setImagesPageNumber] = useState(1);
  const [isImagesLoading, setIsImagesLoading] = useState(true);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsTotal, setAttachmentsTotal] = useState(0);
  const [attachmentsPageNumber, setAttachmentsPageNumber] = useState(1);
  const [isAttachmentsLoading, setIsAttachmentsLoading] = useState(false);
  const notesRequestVersion = useRef(0);

  const searchParams = useSearchParams();

  const refreshNotes = useCallback((tagId, focusId, isArchived, isDeleted, pageNumber = 1, isUntagged = false, titleQuery = "") => {
    const requestVersion = ++notesRequestVersion.current;
    setIsNotesLoading(true);

    return ApiClient.getNotes(tagId, focusId, isArchived, isDeleted, pageNumber, isUntagged, titleQuery)
      .then(res => {
        // A delayed response for an earlier query must not replace the newer
        // filtered list while the user is still typing.
        if (requestVersion !== notesRequestVersion.current) return;
        if (pageNumber > 1) {
          setNotes(prevNotes => [...prevNotes, ...res.notes]);
        } else {
          setNotes(res.notes);
          // Sync selectedNote with refreshed data (e.g., updated tag names/colors)
          setSelectedNote(prev => {
            if (!prev) return prev;
            const updated = res.notes.find(n => n.noteId === prev.noteId);
            return updated ? { ...prev, ...updated } : prev;
          });
        }
        setNotesTotal(res.total);
      })
      .catch(error => {
        console.error('Error loading notes:', error);
      })
      .finally(() => {
        if (requestVersion === notesRequestVersion.current) {
          setIsNotesLoading(false);
        }
      });
  }, []);

  const refreshImages = useCallback((tagId, focusId, pageNumber = 1, isArchived = false) => {
    setIsImagesLoading(true);

    return ApiClient.getImages(tagId, focusId, pageNumber, isArchived)
      .then(res => {
        if (pageNumber > 1) {
          setImages(prevImages => [...prevImages, ...res.images]);
        } else {
          setImages(res.images);
        }
        setImagesTotal(res.total);
      })
      .catch(error => {
        console.error('Error loading images:', error);
      })
      .finally(() => {
        setIsImagesLoading(false);
      });
  }, []);

  const handleNoteChange = useCallback((titleQuery = "") => {
    const selectedTagId = searchParams.get("tagId");
    const selectedFocusId = searchParams.get("focusId");
    const isArchivesPage = searchParams.get("isArchived") === "true";
    const isTrashPage = searchParams.get("isDeleted") === "true";
    const isUntagged = searchParams.get("isUntagged") === "true";

    refreshNotes(selectedTagId, selectedFocusId, isArchivesPage, isTrashPage, 1, isUntagged, titleQuery);
    refreshImages(selectedTagId, selectedFocusId, 1, isArchivesPage);
  }, [searchParams, refreshNotes, refreshImages]);

  const handlePinToggle = useCallback((noteId, isPinned) => {
    const apiCall = isPinned ? ApiClient.unpinNote(noteId) : ApiClient.pinNote(noteId);

    return apiCall
      .then(() => {
        setNotes(prevNotes => {
          const target = prevNotes.find(note => note.noteId === noteId);
          if (!target) return prevNotes;

          const updatedNote = { ...target, isPinned: !isPinned };
          const remainingNotes = prevNotes.filter(note => note.noteId !== noteId);
          if (updatedNote.isPinned) {
            // Pinning assigns the newest pin time on the server, so it belongs
            // first. Do this locally to avoid a list reload and its flicker.
            return [updatedNote, ...remainingNotes];
          }

          const pinnedNotes = remainingNotes.filter(note => note.isPinned);
          const normalNotes = [...remainingNotes.filter(note => !note.isPinned), updatedNote];
          normalNotes.sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
          return [...pinnedNotes, ...normalNotes];
        });
        setSelectedNote(prevNote =>
          prevNote?.noteId === noteId ? { ...prevNote, isPinned: !isPinned } : prevNote
        );
      })
      .catch(error => {
        console.error('Error toggling pin:', error);
      });
  }, []);

  const handleLoadMoreNotes = useCallback(() => {
    setNotesPageNumber(prev => prev + 1);
  }, []);

  const handleLoadMoreImages = useCallback(() => {
    setImagesPageNumber(prev => prev + 1);
  }, []);

  const refreshAttachments = useCallback((pageNumber = 1, tagId = null, focusId = null) => {
    setIsAttachmentsLoading(true);
    return ApiClient.getAttachments(pageNumber, tagId, focusId)
      .then(res => {
        if (pageNumber > 1) {
          setAttachments(prev => [...prev, ...res.attachments]);
        } else {
          setAttachments(res.attachments || []);
        }
        setAttachmentsTotal(res.total);
      })
      .catch(error => {
        console.error('Error loading attachments:', error);
      })
      .finally(() => {
        setIsAttachmentsLoading(false);
      });
  }, []);

  const handleLoadMoreAttachments = useCallback(() => {
    setAttachmentsPageNumber(prev => prev + 1);
  }, []);

  const patchNote = useCallback((noteId, updates) => {
    setNotes(prevNotes =>
      prevNotes.map(note =>
        note.noteId === noteId ? { ...note, ...updates } : note
      )
    );
  }, []);

  const removeNote = useCallback((noteId) => {
    setNotes(prevNotes => prevNotes.filter(note => note.noteId !== noteId));
    setNotesTotal(prevTotal => Math.max(0, prevTotal - 1));
    setSelectedNote(prevNote => prevNote?.noteId === noteId ? null : prevNote);
  }, []);

  const resetPagination = useCallback(() => {
    setNotesPageNumber(1);
    setImagesPageNumber(1);
    setAttachmentsPageNumber(1);
    setSelectedNote(null);
  }, []);

  return (
    <NotesContext.Provider value={{
      // Notes state
      notes,
      selectedNote,
      setSelectedNote,
      notesTotal,
      notesPageNumber,
      setNotesPageNumber,
      isNotesLoading,

      // Images state  
      images,
      imagesTotal,
      imagesPageNumber,
      setImagesPageNumber,
      isImagesLoading,

      // Attachments state
      attachments,
      attachmentsTotal,
      attachmentsPageNumber,
      isAttachmentsLoading,

      // Functions
      refreshNotes,
      refreshImages,
      refreshAttachments,
      handleNoteChange,
      handlePinToggle,
      handleLoadMoreNotes,
      handleLoadMoreImages,
      handleLoadMoreAttachments,
      patchNote,
      removeNote,
      resetPagination
    }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const context = useContext(NotesContext);
  if (context === undefined) {
    throw new Error('useNotes must be used within NotesProvider');
  }
  return context;
}
