// Product areas that are switched off for now. Their pages still work by URL;
// only the links to them are hidden.

// The model marketplace: Models, Credits, Developer API, Model catalogue, and
// "Browse more models…" in the chat's model picker.
export const SHOW_MARKETPLACE = false;

// The desktop edition (owlbot_user_desktop): everything runs on this computer
// with no Owl server, so server-only areas are hidden — billing, team
// workspaces, WhatsApp/Telegram, reminders, API keys and signing out.
export const SERVER_FEATURES = false;

// Parts of the desktop edition still being built; shown once their engine
// side exists.
export const SHOW_KNOWLEDGE_BASE = false;
export const SHOW_SKILLS = true;
