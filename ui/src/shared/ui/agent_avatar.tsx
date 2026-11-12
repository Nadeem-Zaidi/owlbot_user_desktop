// Every new agent is created with this emoji (see EMPTY in agent_editor.tsx),
// so it's what most agents carry. It renders as a cartoon robot that looks
// different on every OS, so we swap it for a crisp vector mark instead.
export const DEFAULT_AGENT_ICON = "🤖";

// A soft squircle tinted with the theme colour holding a minimal robot: an
// outlined head with an antenna, side bolts and two pill eyes. Colours (and
// the dark-mode variant) are in agents.css (.agent-mark__*), from the theme's
// --bot-3. Sized in `em` so it drops into any spot that showed the emoji and
// inherits its font-size.
export function AgentMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`agent-mark ${className}`} viewBox="0 0 32 32" aria-hidden="true">
      <path className="agent-mark__tile" d="M16 0C27.5 0 32 4.5 32 16S27.5 32 16 32 0 27.5 0 16 4.5 0 16 0Z" />
      <path className="agent-mark__line" d="M16 8.2V10" strokeWidth="1.6" strokeLinecap="round" />
      <rect className="agent-mark__line" x="8.5" y="10.5" width="15" height="13" rx="4" strokeWidth="1.7" />
      <circle className="agent-mark__eyes" cx="16" cy="6.8" r="1.4" />
      <rect className="agent-mark__eyes" x="6" y="15" width="1.6" height="4" rx="0.8" />
      <rect className="agent-mark__eyes" x="24.4" y="15" width="1.6" height="4" rx="0.8" />
      <rect className="agent-mark__eyes" x="12.3" y="14.6" width="2.2" height="4" rx="1.1" />
      <rect className="agent-mark__eyes" x="17.5" y="14.6" width="2.2" height="4" rx="1.1" />
    </svg>
  );
}

// Shows the agent's chosen emoji, or the vector mark for the default robot.
export function AgentAvatar({ icon, className }: { icon?: string | null; className?: string }) {
  if (!icon || icon === DEFAULT_AGENT_ICON) return <AgentMark className={className} />;
  return <>{icon}</>;
}
