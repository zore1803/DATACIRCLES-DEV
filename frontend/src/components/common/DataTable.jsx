import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Pin, PinOff, EyeOff, ArrowUp, ArrowDown } from "lucide-react";
import { getPinnedBoundaryOverlayStyle } from "../../utils/pinnedColumnShadow";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";

// The layout is scaled with CSS `zoom` (a dynamic zoom on <html> that tracks the
// window size, plus 0.75 on #root). getBoundingClientRect() and mouse clientX/Y are
// both reported in fully-scaled VISUAL coordinates, so the grab offset (measured)
// needs no correction. The drag-ghost, however, is portaled onto document.body,
// which sits *inside* the <html> zoom — so any coordinate we *set* on it via
// style.left/top is multiplied by that zoom when painted. We therefore divide the
// values we set by the ghost's effective ancestor zoom so it tracks the cursor 1:1
// at any window size / browser zoom.
const getAncestorZoom = (el) => {
  let z = 1;
  let node = el;
  while (node && node.nodeType === 1) {
    const cz = parseFloat(getComputedStyle(node).zoom);
    if (cz && !Number.isNaN(cz)) z *= cz;
    node = node.parentElement;
  }
  return z || 1;
};

/**
 * Reusable data table with sticky header, pinned/sticky columns, column
 * drag-to-reorder (with a portal drag-ghost), column resize and row
 * drag/long-press selection. All page-specific rendering (cells, header
 * menus, selection state) is supplied by the parent through `columns` and
 * the callback props — this component only owns the generic table shell.
 *
 * `variant`:
 *  - "fixed": edge-to-edge scroll area anchored with position:fixed (used by
 *    full-page lists like Companies).
 *  - "card":  a normal scroll container that stays inside its parent card
 *    (used by the Invoices list on the dashboard).
 */
export default function DataTable({
  data,
  columns,
  columnSizing,
  onColumnSizingChange,
  pinnedColumns = [], // [{ key, side: 'left' | 'right' }]
  selectionColId = "selection",
  visibleColumns = [], // [{ key, label }] — used for the drag-ghost label
  onColumnReorder, // (draggedKey, targetKey) => void
  getGhostPreview, // (colId) => string[]
  rowClassName, // (rowOriginal) => string
  onRowMouseDown,
  onRowMouseUp,
  onRowMouseLeave,
  onRowTouchStart,
  onRowTouchEnd,
  variant = "fixed",
  fixedTop = 128,
  fixedBottom = 64,
  maxHeight = 480,
  loading = false,
  loadingContent,
  emptyContent,
  onPinColumn,
  onUnpinColumn,
  onHideColumn,
  onSort,
  // Active sort, so the column menu can mark which direction is applied.
  sortConfig = {},
}) {
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const [openColMenuKey, setOpenColMenuKey] = useState(null);
  const [colMenuPos, setColMenuPos] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);
  const columnMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target)) {
        setOpenColMenuKey(null);
        setColMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const table = useReactTable({
    data,
    columns,
    state: { columnSizing },
    onColumnSizingChange,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  // Deferred-start drag, same as the Companies list's own tables
  // (CompanyContactsTab/CompanyTasksTab/CompanyMeetingsTab): a press plus
  // DRAG_THRESHOLD px of movement starts the drag, at whatever speed the
  // user moves. This replaced an `e.detail === 1` gate that required a
  // double/triple click before a column would start moving — a plain
  // single click+drag here now behaves identically to those pages.
  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

    if (!onColumnReorder) return;

    const th = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 5;
    let dragStarted = false;
    let positionGhost = () => {};

    const beginDrag = () => {
      dragStarted = true;
      e.preventDefault();
      window.getSelection?.()?.removeAllRanges();

      const rect = th.getBoundingClientRect();
      const label = visibleColumns.find((vc) => vc.key === colId)?.label || colId;
      const previewRows = getGhostPreview ? getGhostPreview(colId) : [];
      // Grab offset is measured in visual space (rect + clientX both visual) — no
      // correction. `zGhost` scales the values we SET on the body-portal ghost so
      // they map back to visual space (the ghost is painted inside the <html> zoom).
      const zGhost = getAncestorZoom(document.body);
      const offsetX = startX - rect.left;
      const offsetY = startY - rect.top;

      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";
      // Only the label/previewRows/dimensions go through React state (set once).
      // x/y position is mutated directly on the DOM node below so mousemove never
      // triggers a re-render of the whole table.
      setDragGhost({
        label,
        previewRows,
        offsetX,
        offsetY,
        width: rect.width / zGhost,
        height: rect.height / zGhost,
      });

      positionGhost = (clientX, clientY) => {
        const el = ghostElRef.current;
        if (!el) return;
        const visualTop = clientY - offsetY;
        const visualLeft = clientX - offsetX;
        el.style.top = `${visualTop / zGhost}px`;
        el.style.left = `${visualLeft / zGhost}px`;
        el.style.maxHeight = `${Math.max(100, window.innerHeight - visualTop - 72) / zGhost}px`;
      };
      requestAnimationFrame(() => positionGhost(startX, startY));
    };

    const handleMouseMove = (moveEvent) => {
      if (!dragStarted) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        beginDrag();
      }
      positionGhost(moveEvent.clientX, moveEvent.clientY);

      const elAtPoint = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const thAtPoint = elAtPoint?.closest("th[data-col-id]");
      const overKey = thAtPoint?.getAttribute("data-col-id") || null;
      if (dragOverRef.current !== overKey) {
        dragOverRef.current = overKey;
        setDragOverColKey(overKey);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (!dragStarted) return;
      document.body.style.userSelect = "";
      const overKey = dragOverRef.current;
      if (overKey && overKey !== colId) {
        onColumnReorder(colId, overKey);
      }
      dragOverRef.current = null;
      setDraggedColKey(null);
      setDragOverColKey(null);
      setDragGhost(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
  const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
  const allHeaders = table.getHeaderGroups()[0]?.headers || [];

  const pinnedLeftOffsets = {};
  let cumulativeLeft = 0;
  allHeaders.forEach((h) => {
    const isLeftStickyCol = h.column.id === selectionColId || leftPinnedKeys.includes(h.column.id);
    if (isLeftStickyCol) {
      pinnedLeftOffsets[h.column.id] = cumulativeLeft;
      cumulativeLeft += h.getSize();
    }
  });

  const pinnedRightOffsets = {};
  let cumulativeRight = 0;
  [...allHeaders].reverse().forEach((h) => {
    if (rightPinnedKeys.includes(h.column.id)) {
      pinnedRightOffsets[h.column.id] = cumulativeRight;
      cumulativeRight += h.getSize();
    }
  });

  const lastLeftPinnedKey = leftPinnedKeys.length > 0 ? leftPinnedKeys[leftPinnedKeys.length - 1] : null;
  const firstRightPinnedKey = rightPinnedKeys.length > 0 ? rightPinnedKeys[0] : null;

  const scrollStyle =
    variant === "fixed"
      ? {
          position: "fixed",
          top: fixedTop,
          left: "var(--sidebar-width, 0px)",
          paddingLeft: "var(--content-inset, 16px)",
          right: 0,
          bottom: fixedBottom,
        }
      : { maxHeight, minHeight: 0 };

  return (
    <>
      <div
        className={variant === "fixed" ? "overflow-x-auto overflow-y-auto" : "overflow-auto w-full dc-card-scroll"}
        style={{ ...scrollStyle, overflowY: variant === "card" ? "auto" : undefined }}
      >
        <div className={`relative bg-white ${variant === "fixed" ? "border border-[#E1E4EA]" : ""} ${loading ? "pointer-events-none opacity-60" : ""}`}>
          <table
            className="w-full border-separate border-spacing-0 text-left"
            style={{ minWidth: `${table.getTotalSize()}px`, tableLayout: "fixed" }}
          >
            <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA] sticky top-0 z-30 select-none">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const colId = header.column.id;
                    const isLeftSticky = colId === selectionColId || leftPinnedKeys.includes(colId);
                    const isRightSticky = rightPinnedKeys.includes(colId);
                    const isSticky = isLeftSticky || isRightSticky;
                    // Thick boundary border only marks an actual pinned edge — it
                    // used to default to the selection column whenever nothing was
                    // pinned, which permanently darkened the checkbox column's
                    // border even with no pin in effect.
                    const isLeftBoundary = colId === lastLeftPinnedKey;
                    const isRightBoundary = colId === firstRightPinnedKey;
                    const isDraggable = colId !== selectionColId && !!onColumnReorder;
                    const isDragging = draggedColKey === colId;
                    const isDragOver = dragOverColKey === colId && draggedColKey && draggedColKey !== colId;

                    return (
                      <th
                        key={header.id}
                        data-col-id={colId}
                        onMouseDown={isDraggable ? (e) => startColumnDrag(e, colId) : undefined}
                        style={{
                          width: header.getSize(),
                          position: isSticky ? "sticky" : "relative",
                          left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                          right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                          zIndex: isSticky ? 20 : 1,
                          opacity: isDragging ? 0.35 : 1,
                        }}
                        className={`${colId === selectionColId ? "px-0" : "px-4"} py-3 text-sm font-bold text-[#525866] transition-colors bg-[#F5F7FA] border-r border-[#E1E4EA] last:border-r-0 ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                      >
                        <div className={`flex items-center ${colId === selectionColId ? "justify-center" : "justify-between"} w-full min-w-0 ${loading ? "[&_button]:invisible" : ""}`}>
                          <div className={`flex items-center gap-1.5 min-w-0 overflow-hidden ${colId !== selectionColId ? "flex-1 cursor-grab active:cursor-grabbing" : ""}`}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {colId !== selectionColId && sortConfig.key === colId && (sortConfig.direction === "asc"
                              ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                              : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                          </div>
                          {colId !== selectionColId && (onPinColumn || onHideColumn || onSort) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openColMenuKey === colId) {
                                  setOpenColMenuKey(null);
                                  setColMenuPos(null);
                                  return;
                                }
                                const zMenu = getAncestorZoom(document.body);
                                const MENU_W = 160;
                                const rect = e.currentTarget.getBoundingClientRect();
                                let calculatedLeft = rect.right / zMenu - MENU_W;
                                calculatedLeft = Math.min(calculatedLeft, window.innerWidth / zMenu - MENU_W - 8);
                                calculatedLeft = Math.max(calculatedLeft, 8);
                                setColMenuPos({ top: rect.bottom / zMenu + 4, left: calculatedLeft });
                                setOpenColMenuKey(colId);
                              }}
                              className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0 ml-1"
                              title="Column options"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {openColMenuKey === colId && colMenuPos && createPortal(
                          <>
                            <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setOpenColMenuKey(null); setColMenuPos(null); }} />
                            <div
                              ref={columnMenuRef}
                              style={{ position: "fixed", top: colMenuPos.top, left: colMenuPos.left }}
                              className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right text-left"
                            >
                              {onPinColumn && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenColMenuKey(null);
                                      setColMenuPos(null);
                                      isLeftSticky ? onUnpinColumn?.(colId) : onPinColumn(colId, "left");
                                    }}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${isLeftSticky ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                                  >
                                    {isLeftSticky ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                                    Pin to Left
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenColMenuKey(null);
                                      setColMenuPos(null);
                                      isRightSticky ? onUnpinColumn?.(colId) : onPinColumn(colId, "right");
                                    }}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${isRightSticky ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                                  >
                                    {isRightSticky ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                                    Pin to Right
                                  </button>
                                </>
                              )}
                              {onSort && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenColMenuKey(null);
                                      setColMenuPos(null);
                                      onSort(colId, "asc");
                                    }}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === colId && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                                  >
                                    <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                                    Sort Ascending
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenColMenuKey(null);
                                      setColMenuPos(null);
                                      onSort(colId, "desc");
                                    }}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === colId && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                                  >
                                    <ChevronDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                                    Sort Descending
                                  </button>
                                </>
                              )}
                              {onHideColumn && (
                                <>
                                  {(onPinColumn || onSort) && <div className="h-px bg-[#E5E5EC] my-0.5 w-full mx-auto" />}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenColMenuKey(null);
                                      setColMenuPos(null);
                                      onHideColumn(colId);
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                                  >
                                    <EyeOff className="w-3.5 h-3.5 text-[#1C1B1F]" />
                                    Hide Column
                                  </button>
                                </>
                              )}
                            </div>
                          </>,
                          document.body
                        )}

                        {colId !== selectionColId && header.column.getCanResize() && (
                          <div
                            data-resize-handle="true"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              header.getResizeHandler()(e);
                            }}
                            onTouchStart={header.getResizeHandler()}
                            className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none z-50 bg-transparent"
                          />
                        )}
                        {isLeftBoundary && <div style={getPinnedBoundaryOverlayStyle("left")} />}
                        {isRightBoundary && <div style={getPinnedBoundaryOverlayStyle("right")} />}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            <tbody className="bg-white">
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={table.getAllColumns().length} className="px-6 py-12 text-center">
                    {loadingContent || <p>Loading...</p>}
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={table.getAllColumns().length} className="px-6 py-12 text-center text-gray-500 font-inter">
                    {emptyContent || <p className="font-medium">No records found</p>}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`bg-white hover:bg-blue-50 transition-colors ${rowClassName ? rowClassName(row.original) : ""}`}
                    onMouseDown={onRowMouseDown ? () => onRowMouseDown(row.original) : undefined}
                    onMouseUp={onRowMouseUp}
                    onMouseLeave={onRowMouseLeave}
                    onTouchStart={onRowTouchStart ? () => onRowTouchStart(row.original) : undefined}
                    onTouchEnd={onRowTouchEnd}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const colId = cell.column.id;
                      const isLeftSticky = colId === selectionColId || leftPinnedKeys.includes(colId);
                      const isRightSticky = rightPinnedKeys.includes(colId);
                      const isSticky = isLeftSticky || isRightSticky;
                      // Thick boundary border only marks an actual pinned edge — it
                    // used to default to the selection column whenever nothing was
                    // pinned, which permanently darkened the checkbox column's
                    // border even with no pin in effect.
                    const isLeftBoundary = colId === lastLeftPinnedKey;
                      const isRightBoundary = colId === firstRightPinnedKey;
                      const isColDragging = draggedColKey === colId;

                      return (
                        <td
                          key={cell.id}
                          style={{
                            width: cell.column.getSize(),
                            position: isSticky ? "sticky" : "static",
                            left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                            right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                            zIndex: isSticky ? 10 : 1,
                            opacity: isColDragging ? 0.35 : 1,
                          }}
                          className={`${colId === selectionColId ? "px-0" : "px-4"} py-2 align-middle text-sm text-[#1C1B1F] bg-inherit border-r border-b border-[#E1E4EA] last:border-r-0`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          {isLeftBoundary && <div style={getPinnedBoundaryOverlayStyle("left")} />}
                          {isRightBoundary && <div style={getPinnedBoundaryOverlayStyle("right")} />}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {dragGhost && createPortal(
        <div
          ref={ghostElRef}
          style={{
            position: "fixed",
            top: -9999,
            left: -9999,
            width: dragGhost.width,
            zIndex: 10000,
            pointerEvents: "none",
          }}
          className="flex flex-col bg-white rounded-lg shadow-2xl overflow-hidden"
        >
          <div className="px-4 py-3 bg-[#F5F7FA] border-b border-[#E1E4EA]" style={{ height: dragGhost.height }}>
            <span className="text-sm font-bold text-[#525866] truncate block">{dragGhost.label}</span>
          </div>
          {dragGhost.previewRows.map((rowVal, i) => (
            <div key={i} className="px-4 py-2 border-b border-[#F1F1F5] last:border-b-0">
              <span className="text-sm text-gray-700 truncate block">{rowVal}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
