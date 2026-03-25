import { h, Fragment } from "../../assets/preact.esm.js";
import { useEffect, useState } from "../../assets/preact.esm.js";
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter } from "../../commons/components/Modal.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import Button from "../../commons/components/Button.jsx";
import Link from "../../commons/components/Link.jsx";
import { t } from "../../commons/i18n/index.js";


export default function ImageDeleteConfirmModal({ filename, noteIds = [], onConfirm, onCancel }) {

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [noteIds.join(',')]);

  const title = t('images.delete.confirm.title');

  return (
    <ModalBackdrop onClose={onCancel} isCentered={true} closeOnBackdrop={true}>
      <ModalContainer>
        <ModalHeader title={title} onClose={onCancel} />
        <ModalContent>
          <div style={{ maxWidth: '520px' }}>
            <p style={{ marginBottom: '8px' }}>{t('images.delete.confirm.file', { filename })}</p>
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
          </div>
        </ModalContent>
        <ModalFooter isRightAligned={true}>
          <Button onClick={onCancel}>{t('images.delete.confirm.cancel')}</Button>
          <Button variant="danger" onClick={onConfirm} style={{ marginLeft: '8px' }}>{t('images.delete.confirm.ok')}</Button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
}
