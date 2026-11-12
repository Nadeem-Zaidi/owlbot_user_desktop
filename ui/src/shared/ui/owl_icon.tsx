// The Owl brand mark: a round little owl — egg-shaped body with soft ear
// tufts, big eyes with a sparkle, a small beak, wings and a feathered tummy.
// One colour (currentColor); eyes, beak, wings and tummy are cut out, so it
// works on any background. The same drawing is in index.html (splash),
// owl_loader.tsx and public/favicon.svg; keep them in sync.

const BODY = "M6.2 3.6 C7.6 4 8.8 4.9 9.6 5.8 C10.4 5.6 11.2 5.5 12 5.5 C12.8 5.5 13.6 5.6 14.4 5.8 C15.2 4.9 16.4 4 17.8 3.6 C18.4 5 18.5 6.6 18.1 8 C19.6 9.6 20.4 11.8 20.4 14.4 C20.4 19 16.8 22.4 12 22.4 C7.2 22.4 3.6 19 3.6 14.4 C3.6 11.8 4.4 9.6 5.9 8 C5.5 6.6 5.6 5 6.2 3.6 Z M5.85 11.2 a3.05 3.05 0 1 0 6.1 0 a3.05 3.05 0 1 0 -6.1 0 Z M12.05 11.2 a3.05 3.05 0 1 0 6.1 0 a3.05 3.05 0 1 0 -6.1 0 Z M12 13.5 C12.55 13.5 13 13.8 13 14.2 C13 14.7 12.45 15.3 12 15.6 C11.55 15.3 11 14.7 11 14.2 C11 13.8 11.45 13.5 12 13.5 Z M5.3 14.6 C5 17 5.7 19.2 7.4 20.6 C7.1 18.5 6.7 16.5 5.3 14.6 Z M18.7 14.6 C19 17 18.3 19.2 16.6 20.6 C16.9 18.5 17.3 16.5 18.7 14.6 Z M10 17.5 l0.75 0.85 l0.75 -0.85 Z M12.5 17.5 l0.75 0.85 l0.75 -0.85 Z M11.25 19.3 l0.75 0.85 l0.75 -0.85 Z";
const PUPILS = "M7.5 11.55 a1.75 1.75 0 1 0 3.5 0 a1.75 1.75 0 1 0 -3.5 0 Z M9.35 10.85 a0.55 0.55 0 1 0 1.1 0 a0.55 0.55 0 1 0 -1.1 0 Z M13 11.55 a1.75 1.75 0 1 0 3.5 0 a1.75 1.75 0 1 0 -3.5 0 Z M14.85 10.85 a0.55 0.55 0 1 0 1.1 0 a0.55 0.55 0 1 0 -1.1 0 Z";

const OwlPaths = ({ pupil }: { pupil: string }) => (
  <>
    <path className="owl-mark__body" fillRule="evenodd" d={BODY} />
    <path className={pupil} fillRule="evenodd" d={PUPILS} />
  </>
);

// "Thinking" state: the owl breathing inside a pulsing ring, eyes blinking.
export const ThinkingOwl = () => (
  <span className="thinking-owl" aria-label="Thinking" role="status">
    <span className="thinking-owl__pulse" aria-hidden="true" />
    <svg className="thinking-owl__svg" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <OwlPaths pupil="thinking-owl__pupil" />
    </svg>
  </span>
);

// Static brand mark (sidebar, chat top bar, sign-in).
export const OwlMark = ({ size = 26 }: { size?: number }) => (
  <svg className="owl-mark" width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Owl" role="img">
    <OwlPaths pupil="owl-mark__pupil" />
  </svg>
);
