import ApiClient from "../../commons/http/ApiClient.js";
import { h, useEffect, useState } from "../../assets/preact.esm.js"
import Link from "../../commons/components/Link.jsx"
import { PencilIcon, ArrowUpIcon, ArrowDownIcon, ChevronRightIcon } from "../../commons/components/Icon.jsx";
import TagDetailModal, { TAG_COLORS } from "./TagDetailModal.jsx";
import { openModal } from "../../commons/components/Modal.jsx";
import { useAppContext } from "../../commons/contexts/AppContext.jsx";
import { t } from "../../commons/i18n/index.js";

function sectionTitle() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (params.get("isArchived") === "true") return t('nav.archives');
  if (params.get("isDeleted") === "true") return t('nav.trash');
  if (path.includes('/templates/')) return t('nav.templates');
  return t('nav.notes');
}

function isCanvas() {
  return window.location.pathname.includes('/canvases/');
}

function buildTagUrl(tagId) {
  const currentParams = new URLSearchParams(window.location.search);
  const focusId = currentParams.get('focusId');
  const p = new URLSearchParams();
  if (focusId) p.set('focusId', focusId);
  p.set('tagId', tagId);
  const q = p.toString();
  return '/notes/' + (q ? '?' + q : '');
}

function buildUntaggedUrl() {
  const currentParams = new URLSearchParams(window.location.search);
  const focusId = currentParams.get('focusId');
  const p = new URLSearchParams();
  if (focusId) p.set('focusId', focusId);
  p.set('isUntagged', 'true');
  const q = p.toString();
  return '/notes/' + (q ? '?' + q : '');
}

function TagTreeNode({ tag, depth, onEditClick, onMove, dragState, onDragStart, onDragOver, onDrop, expandedTagIds, onToggle }) {
  const isExpanded = expandedTagIds.has(tag.tagId);
  const hasChildren = tag.children && tag.children.length > 0;

  function handleToggle(e) {
    e.stopPropagation();
    e.preventDefault();
    onToggle(tag.tagId);
  }

  function handleEdit(e) {
    e.stopPropagation();
    e.preventDefault();
    onEditClick(e, tag);
  }

  function handleUp(e) {
    e.stopPropagation();
    e.preventDefault();
    onMove(tag, -1);
  }

  function handleDown(e) {
    e.stopPropagation();
    e.preventDefault();
    onMove(tag, 1);
  }

  function handleDragStart(e) {
    if (e.target && e.target.closest && e.target.closest('.tag-actions')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    try { if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
    onDragStart(tag);
  }

  function handleDragOver(e) {
    e.preventDefault();
    try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch (_) {}
  }

  function handleDrop(e) {
    e.preventDefault();
    onDrop(tag);
  }

  const displayName = tag.name.includes('/') ? tag.name.split('/').pop() : tag.name;
  const indent = depth * 16;
  const isDragOver = dragState && dragState.overTagId === tag.tagId;
  const tagColor = tag.color ? (TAG_COLORS.find(c => c.value === tag.color)?.hex || null) : null;
  const tagBgStyle = tagColor
    ? `background-color: ${tagColor}22; color: ${tagColor}; padding: 1px 8px; border-radius: 10px;`
    : `background-color: var(--neutral-100); padding: 1px 8px; border-radius: 10px;`;

  return h('div', { className: 'tag-tree-node' },
    h('div', {
      className: `tag-tree-row ${isDragOver ? 'is-drag-over' : ''}`,
      style: `padding-left: ${indent}px`,
      draggable: true,
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDrop: handleDrop
    },
      hasChildren
        ? h('span', {
            className: `tag-tree-toggle ${isExpanded ? 'is-expanded' : ''}`,
            onClick: handleToggle
          }, h(ChevronRightIcon))
        : h('span', { className: 'tag-tree-toggle-placeholder' }),
      h(Link, {
        to: buildTagUrl(tag.tagId),
        className: 'sidebar-tag-link',
        activeClassName: 'is-active'
      },
        h('span', { className: 'tag-tree-name', style: tagBgStyle || '' },
          displayName
        ),
        typeof tag.noteCount === 'number'
          ? h('span', { className: 'tag-tree-count' },
              hasChildren
                ? ` (${tag.children.length}|${tag.noteCount})`
                : ` (${tag.noteCount})`
            )
          : null,
        h('span', { className: 'tag-actions', style: 'display:flex; gap:6px; align-items:center; margin-left:auto; flex-shrink:0' },
          h(ArrowUpIcon, { onClick: handleUp }),
          h(ArrowDownIcon, { onClick: handleDown }),
          h('span', { className: 'tag-edit', onClick: handleEdit, onMouseDown: e => { e.stopPropagation(); e.preventDefault(); } }, h(PencilIcon))
        )
      )
    ),
    hasChildren && isExpanded
      ? h('div', { className: 'tag-tree-children' },
          tag.children.map(child =>
            h(TagTreeNode, {
              key: child.tagId,
              tag: child,
              depth: depth + 1,
              onEditClick,
              onMove,
              dragState,
              onDragStart,
              onDragOver,
              onDrop,
              expandedTagIds,
              onToggle
            })
          )
        )
      : null
  );
}

export default function SidebarTagsList() {
  const { tags, refreshTags } = useAppContext();
  const [orderedTags, setOrderedTags] = useState([]);
  const [untaggedCount, setUntaggedCount] = useState(0);
  const [title, setTitle] = useState(sectionTitle());
  const [dragTag, setDragTag] = useState(null);
  const [dragOverTagId, setDragOverTagId] = useState(null);
  const [expandedTagIds, setExpandedTagIds] = useState(new Set());

  useEffect(() => {
    setTitle(sectionTitle());
    function handleNav() { setTitle(sectionTitle()); }
    window.addEventListener("navigate", handleNav);
    window.addEventListener("popstate", handleNav);
    return () => {
      window.removeEventListener("navigate", handleNav);
      window.removeEventListener("popstate", handleNav);
    };
  }, []);

  useEffect(() => {
    setUntaggedCount(window.__untaggedCount || 0);
    function handleUpdate() { setUntaggedCount(window.__untaggedCount || 0); }
    window.addEventListener('tags:updated', handleUpdate);
    return () => window.removeEventListener('tags:updated', handleUpdate);
  }, []);

  // Apply persisted ordering to the tree
  useEffect(() => {
    if (!tags || tags.length === 0) {
      setOrderedTags([]);
      return;
    }
    try {
      const persisted = JSON.parse(localStorage.getItem("sidebar_tag_order") || "[]");
      const pos = new Map(persisted.map((id, idx) => [id, idx]));

      function sortChildren(nodes) {
        const sorted = [...nodes].sort((a, b) => {
          const ai = pos.has(a.tagId) ? pos.get(a.tagId) : Number.POSITIVE_INFINITY;
          const bi = pos.has(b.tagId) ? pos.get(b.tagId) : Number.POSITIVE_INFINITY;
          if (ai === bi) return 0;
          return ai - bi;
        });
        return sorted.map(node => ({
          ...node,
          children: node.children ? sortChildren(node.children) : []
        }));
      }

      setOrderedTags(sortChildren(tags));
    } catch (e) {
      setOrderedTags(tags);
    }
  }, [tags]);

  function persistOrder(nodes) {
    // Flatten tree to get all tag IDs in display order
    const ids = [];
    function collect(list) {
      for (const n of list) {
        ids.push(n.tagId);
        if (n.children) collect(n.children);
      }
    }
    collect(nodes);
    try {
      localStorage.setItem('sidebar_tag_order', JSON.stringify(ids));
      ApiClient.reorderTags(ids).catch(() => {});
    } catch (_) {}
  }

  function findSiblings(nodes, targetId) {
    for (const node of nodes) {
      if (node.tagId === targetId) return nodes;
      if (node.children) {
        const found = findSiblings(node.children, targetId);
        if (found) return found;
      }
    }
    return null;
  }

  function handleMove(tag, delta) {
    const siblings = findSiblings(orderedTags, tag.tagId);
    if (!siblings) return;

    const idx = siblings.findIndex(s => s.tagId === tag.tagId);
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= siblings.length) return;

    // Directly swap in the siblings array and rebuild
    const newSiblings = [...siblings];
    const tmp = newSiblings[idx];
    newSiblings[idx] = newSiblings[newIdx];
    newSiblings[newIdx] = tmp;

    // Rebuild tree with new sibling order
    function rebuildTree(nodes) {
      return nodes.map(node => {
        if (node.children && node.children.length > 0) {
          // Check if this node's children contain the siblings
          const isParent = node.children.some(c => c.tagId === siblings[0].tagId);
          if (isParent) {
            return { ...node, children: newSiblings };
          }
          return { ...node, children: rebuildTree(node.children) };
        }
        return node;
      });
    }

    // Check if siblings are root-level
    const isRootLevel = orderedTags.some(n => n.tagId === tag.tagId);
    let newTree;
    if (isRootLevel) {
      const newRoots = [...orderedTags];
      const tmp2 = newRoots[idx];
      newRoots[idx] = newRoots[newIdx];
      newRoots[newIdx] = tmp2;
      newTree = newRoots;
    } else {
      newTree = rebuildTree(orderedTags);
    }

    setOrderedTags(newTree);
    persistOrder(newTree);
  }

  function handleDragStart(tag) {
    setDragTag(tag);
  }

  function handleDragOver(tag) {
    if (dragTag && dragTag.tagId !== tag.tagId) {
      setDragOverTagId(tag.tagId);
    }
  }

  function handleDrop(targetTag) {
    if (!dragTag || dragTag.tagId === targetTag.tagId) {
      setDragTag(null);
      setDragOverTagId(null);
      return;
    }

    // Move dragTag to targetTag's position within the same sibling group

    const dragSiblings = findSiblings(orderedTags, dragTag.tagId);
    const targetSiblings = findSiblings(orderedTags, targetTag.tagId);

    if (!dragSiblings || !targetSiblings || dragSiblings !== targetSiblings) {
      setDragTag(null);
      setDragOverTagId(null);
      return;
    }

    const fromIdx = dragSiblings.findIndex(s => s.tagId === dragTag.tagId);
    const toIdx = targetSiblings.findIndex(s => s.tagId === targetTag.tagId);

    const newSiblings = [...dragSiblings];
    const [moved] = newSiblings.splice(fromIdx, 1);
    newSiblings.splice(toIdx, 0, moved);

    // Rebuild tree
    function rebuildWith(nodes, oldSiblings, newSiblings) {
      if (nodes === oldSiblings) return newSiblings;
      return nodes.map(node => {
        if (node.children && node.children.length > 0) {
          const isParent = node.children.some(c => c.tagId === oldSiblings[0].tagId);
          if (isParent) {
            return { ...node, children: newSiblings };
          }
          return { ...node, children: rebuildWith(node.children, oldSiblings, newSiblings) };
        }
        return node;
      });
    }

    const isRootLevel = orderedTags.some(n => n.tagId === dragTag.tagId);
    let newTree;
    if (isRootLevel) {
      newTree = newSiblings;
    } else {
      newTree = rebuildWith(orderedTags, dragSiblings, newSiblings);
    }

    setDragTag(null);
    setDragOverTagId(null);
    setOrderedTags(newTree);
    persistOrder(newTree);
  }

  function handleToggle(tagId) {
    setExpandedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }

  function handleEditClick(e, editTag) {
    e.stopPropagation();
    e.preventDefault();
    // Find ancestor chain by walking up parentId
    const allNodes = orderedTags.length > 0 ? orderedTags : (tags || []);
    const flat = [];
    function collect(nodes) {
      for (const n of nodes) {
        flat.push(n);
        if (n.children) collect(n.children);
      }
    }
    collect(allNodes);
    const ancestors = [];
    let currentId = editTag.parentId;
    while (currentId) {
      const parent = flat.find(t => t.tagId === currentId);
      if (!parent) break;
      ancestors.unshift({ tagId: parent.tagId, name: parent.name });
      currentId = parent.parentId;
    }
    openModal(<TagDetailModal tag={{ ...editTag, parentTags: ancestors }} refreshTags={refreshTags} />);
  }

  if (isCanvas()) return null;

  const safeTags = Array.isArray(tags) ? tags : [];
  const safeOrderedTags = Array.isArray(orderedTags) ? orderedTags : [];

  if (safeOrderedTags.length === 0 && safeTags.length === 0) {
    return (
      <div>
          <div className="sidebar-section-title">{title}</div>
          <Link
            to={buildUntaggedUrl()}
            className="sidebar-tag-link"
            activeClassName="is-active"
          >
            {t('tags.untagged')}{untaggedCount > 0 ? ` (${untaggedCount})` : ""}
      </Link>
    </div>
    );
  }

  const displayTags = safeOrderedTags.length > 0 ? safeOrderedTags : safeTags;

  const treeItems = displayTags.map(tag =>
    h(TagTreeNode, {
      key: tag.tagId,
      tag,
      depth: 0,
      onEditClick: handleEditClick,
      onMove: handleMove,
      dragState: { overTagId: dragOverTagId },
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
      expandedTagIds,
      onToggle: handleToggle
    })
  );

  return (
    <div>
      <div className="sidebar-section-title">{title}</div>
      <Link
        to={buildUntaggedUrl()}
        className="sidebar-tag-link"
        activeClassName="is-active"
      >
        {t('tags.untagged')}{untaggedCount > 0 ? ` (${untaggedCount})` : ""}
      </Link>
      {treeItems}
    </div>
  );
}