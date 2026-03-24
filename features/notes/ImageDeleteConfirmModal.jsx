import { h, Fragment } from "../../assets/preact.esm.js";
import { useEffect, useState } from "../../assets/preact.esm.js";
import { ModalBackdrop, ModalContainer, ModalHeader, ModalContent, ModalFooter } from "../../commons/components/Modal.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import Button from "../../commons/components/Button.jsx";
import Link from "../../commons/components/Link.jsx";

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

  const title = '该图片仍被以下笔记引用';

  return (
    <ModalBackdrop onClose={onCancel} isCentered={true} closeOnBackdrop={true}>
      <ModalContainer>
        <ModalHeader title={title} onClose={onCancel} />
        <ModalContent>
          <div style={{ maxWidth: '520px' }}>
            <p style={{ marginBottom: '8px' }}>文件：{filename}</p>
            {loading ? (
              <p>加载引用列表中...</p>
            ) : (
              <ul style={{ paddingLeft: '16px', margin: 0 }}>
                {notes.length === 0 ? (
                  <li>无法加载笔记详情（仍可继续删除）。</li>
                ) : (
                  notes.map(n => (
                    <li key={n.noteId} style={{ marginBottom: '6px' }}>
                      <Link to={`/notes/${n.noteId}`} shouldPreserveSearchParams>
                        {n.title || `无标题笔记 #${n.noteId}`}
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            )}
            <p style={{ marginTop: '8px', color: 'var(--neutral-500)' }}>继续删除将导致这些笔记中的图片断链。</p>
          </div>
        </ModalContent>
        <ModalFooter isRightAligned={true}>
          <Button onClick={onCancel}>取消</Button>
          <Button variant="danger" onClick={onConfirm} style={{ marginLeft: '8px' }}>仍要删除</Button>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>
  );
}
