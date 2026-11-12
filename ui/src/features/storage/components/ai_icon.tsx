// Chat-bubble-with-sparkle mark for the "Ask AI" trigger. Drawn with
// currentColor so the button decides its colour, and sized like the
// lucide icons used everywhere else so it sits on the same visual grid.
export function AiAssistantIcon({ size = 22, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Speech bubble */}
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      {/* Four-point sparkle */}
      <path
        d="M12 7.6c.33 2.18 2.04 3.89 4.2 4.2-2.16.33-3.87 2.04-4.2 4.2-.33-2.16-2.04-3.87-4.2-4.2 2.16-.31 3.87-2.02 4.2-4.2z"
        fill="currentColor"
        strokeWidth={1}
      />
    </svg>
  );
}
