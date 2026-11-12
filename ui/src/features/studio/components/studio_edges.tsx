import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { FileText } from "lucide-react";

export type DataEdgeData = {
  branch?: string;          // "Yes", "Billing", "Otherwise"…
  passed?: string;          // the text that went along this connection in the shown run
  taken?: boolean;          // the run went this way
  skipped?: boolean;        // the run reached the source but went another way
  onOpen?: () => void;      // show the full passed text
};

// A main connection on the Studio canvas. After a run it shows the text
// that was handed to the next step (click it to read it all) and
// highlights the path the run took.
export const DataEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) => {
  const d = (data ?? {}) as DataEdgeData;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const preview = d.passed ? d.passed.replace(/\s+/g, " ").trim() : "";
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style}
        className={d.taken ? "as_edge_path is_taken" : d.skipped ? "as_edge_path is_skipped" : "as_edge_path"} />
      {(d.branch || (d.taken && preview)) && (
        <EdgeLabelRenderer>
          <div className="as_edge_label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {d.branch && <span className={`as_edge_branch ${d.taken ? "is_taken" : ""}`}>{d.branch}</span>}
            {d.taken && preview && (
              <button type="button" className="as_edge_data" onClick={(e) => { e.stopPropagation(); d.onOpen?.(); }} title="See what was passed to the next step">
                <FileText size={11} /> {preview.length > 38 ? `${preview.slice(0, 38)}…` : preview}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
