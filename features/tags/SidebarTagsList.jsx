import ApiClient from "../../commons/http/ApiClient.js";
import { h, useEffect, useState } from "../../assets/preact.esm.js"
import Link from "../../commons/components/Link.jsx"
import { PencilIcon, ArrowUpIcon, ArrowDownIcon } from "../../commons/components/Icon.jsx";
import TagDetailModal from "./TagDetailModal.jsx";
import { openModal } from "../../commons/components/Modal.jsx";
import { useAppContext } from "../../commons/contexts/AppContext.jsx";

export default function SidebarTagsList() {
  const { tags, refreshTags } = useAppContext();
  const [orderedTags, setOrderedTags] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);

  useEffect(() => {
    try {
      const persisted = JSON.parse(localStorage.getItem("sidebar_tag_order") || "[]");
      const pos = new Map(persisted.map((id, idx) => [id, idx]));
      const sorted = [...tags].sort((a, b) => {
        const ai = pos.has(a.tagId) ? pos.get(a.tagId) : Number.POSITIVE_INFINITY;
        const bi = pos.has(b.tagId) ? pos.get(b.tagId) : Number.POSITIVE_INFINITY;
        if (ai === bi) return 0;
        return ai - bi;
      });
      setOrderedTags(sorted);
    } catch (e) {
      setOrderedTags(tags);
    }
  }, [tags]);

  if (orderedTags.length === 0) {
    return null;
  }

  const items = orderedTags.map((tag, idx) => (
    <Link
      key={tag.tagId}
      to={`/notes/?tagId=${tag.tagId}`}
      shouldPreserveSearchParams
      className="sidebar-tag-link"
      activeClassName="is-active"
      draggable
      onDragStart={e => handleDragStart(e, idx)}
      onDragOver={e => handleDragOver(e, idx)}
      onDrop={e => handleDrop(e, idx)}
    >
      {tag.name}{typeof tag.noteCount === "number" ? ` (${tag.noteCount})` : ""}
      <span className="tag-actions" style="display:flex; gap:6px; align-items:center; margin-left:auto">
        <ArrowUpIcon onClick={e => handleMove(e, idx, -1)} />
        <ArrowDownIcon onClick={e => handleMove(e, idx, 1)} />
        <span className="tag-edit" onClick={e => handleEditClick(e, tag)} onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}><PencilIcon /></span>
      </span>
    </Link>
  ));

  function handleEditClick(e, tag) {
    e.stopPropagation();
    e.preventDefault();
    openModal(<TagDetailModal tag={tag} refreshTags={refreshTags} />);
  }



  function handleDragStart(e, index) {
    if (e.target && e.target.closest && e.target.closest('.tag-actions')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    try { if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; } catch(_) {}
    setDragIndex(index);
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch(_) {}
  }

  function handleDrop(e, toIndex) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === toIndex) return;
    const list = [...orderedTags];
    const [moved] = list.splice(dragIndex, 1);
    list.splice(toIndex, 0, moved);
    setDragIndex(null);
    setOrderedTags(list);
    try {
      const idOrder = list.map(t => t.tagId);
      localStorage.setItem('sidebar_tag_order', JSON.stringify(idOrder));
      ApiClient.reorderTags(idOrder).catch(() => {});
    } catch(_) {}
  }

  function handleMove(e, index, delta) {
    e.stopPropagation();
    e.preventDefault();
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= orderedTags.length) return;
    const newOrder = orderedTags.map(t => t);
    const tmp = newOrder[index];
    newOrder[index] = newOrder[newIndex];
    newOrder[newIndex] = tmp;
    setOrderedTags(newOrder);
    try {
      const idOrder = newOrder.map(t => t.tagId);
      localStorage.setItem("sidebar_tag_order", JSON.stringify(idOrder));
      ApiClient.reorderTags(idOrder).catch(() => {});
    } catch (e) {}
  }

  return (
    <div>
      <div className="sidebar-section-title">Tags</div>
      {items}
    </div>
  );
}