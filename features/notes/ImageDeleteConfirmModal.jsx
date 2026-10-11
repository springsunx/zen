import { h } from "../../assets/preact.esm.js";
import { useEffect, useState } from "../../assets/preact.esm.js";
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter } from "../../commons/components/Modal.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import Button from "../../commons/components/Button.jsx";
import Link from "../../commons/components/Link.jsx";
import { t } from "../../commons/i18n/index.js";


export default function ImageDeleteConfirmModal({ filename, noteIds = [], onConfirm, onCancel }) {
  const hasReferences = noteIds.length > 0;
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(hasReferences);

  useEffect(() => {
    if (!hasReferences) {
      setNotes([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    async function load() {
      try {
        const loaded = [];
        for (const id of noteIds) {
          try {
            const n = await ApiClient.getNoteById(id);
            if (!cancelled && n) loaded.push(n);
          } catch (_) {}
        }
        if (!cancelled) setNotes(loaded);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [hasReferences, noteIds.join(',')]);

  const title = t(hasReferences ? 'images.delete.confirm.title' : 'images.delete.confirm.titleGeneral');

  return (
    <ModalBackdrop onClose={onCancel} isCentered={true} closeOnBackdrop={true}>
      <ModalContainer>
        <ModalHeader title={title} onClose={onCancel} />
        <ModalContent>
          <div style={{ maxWidth: '520px' }}>
            <p style={{ marginBottom: '8px' }}>{t('images.delete.confirm.file', { filename })}</p>
            {hasReferences ? (
              <>
                {loading ? (
                  <p>{t('images.delete.loading')}</p>
                ) : (
                  <ul style={{ paddingLeft: '16px', margin: 0 }}>
                    {notes.length === 0 ? (
                      <li>{t('images.delete.notes.loadFail')}</li>
                    ) : (
                      notes.map(n => (
                        <li key={n.noteId} style={{ marginBottom: '6px' }}>
                          <Link to={`/notes/${n.noteId}`} shouldPreserveSearchParams>
                            {n.title || t('images.delete.untitled', { id: n.noteId })}
                          </Link>
                        </li>
                      ))
                    )}
                  </ul>
                )}
                <p style={{ marginTop: '8px', color: 'var(--neutral-500)' }}>{t('images.delete.confirm.desc')}</p>
              </>
            ) : <p className="modal-description">{t('images.delete.confirm.descGeneral')}</p>}
          </div>
        </ModalContent>
        <ModalFooter isRightAligned={true}>
          <Button onClick={onCancel}>{t('images.delete.confirm.cancel')}</Button>
          <Button variant="danger" onClick={onConfirm} style={{ marginLeft: '8px' }}>{t(hasReferences ? 'images.delete.confirm.ok' : 'files.delete.confirm')}</Button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
}
