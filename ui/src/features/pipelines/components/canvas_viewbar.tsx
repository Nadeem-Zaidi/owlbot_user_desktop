import { Eye, EyeOff, Maximize2, Minimize2, PanelRightClose, PanelRightOpen } from "lucide-react";

// Top-right of a canvas: hide/show the side panel, enter/leave focus mode,
// and (Agent Studio) hide/show the parts plugged into agents.
export const CanvasViewbar = ({ focus, onFocus, panel, onPanel, parts }: {
  focus: boolean; onFocus: () => void; panel: boolean; onPanel: () => void;
  parts?: { hidden: boolean; onToggle: () => void };
}) => (
  <div className="wf_viewbar" role="toolbar" aria-label="Canvas view">
    {parts && (
      <button type="button" className="wf_viewbtn" onClick={parts.onToggle} aria-pressed={parts.hidden}
        title={parts.hidden ? "Show models, tools, knowledge and skills" : "Hide models, tools, knowledge and skills"}
        aria-label={parts.hidden ? "Show agent parts" : "Hide agent parts"}>
        {parts.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    )}
    <button type="button" className="wf_viewbtn" onClick={onPanel} aria-pressed={!panel}
      title={panel ? "Hide the side panel" : "Show the side panel"} aria-label={panel ? "Hide the side panel" : "Show the side panel"}>
      {panel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
    </button>
    <button type="button" className="wf_viewbtn" onClick={onFocus} aria-pressed={focus}
      title={focus ? "Exit full screen (Esc)" : "Full screen"} aria-label={focus ? "Exit full screen" : "Full screen"}>
      {focus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  </div>
);
