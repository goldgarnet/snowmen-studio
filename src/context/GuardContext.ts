import { createContext, useContext } from 'react';

// Lets the map editor (MapStudio) register a "is there unsaved work?" check plus
// a save() action. Navigation that would leave the editor (tab switch, back to
// list) goes through `attempt`, which prompts to save when the work is dirty.
export interface StudioApi {
  isDirty: () => boolean;
  save: () => Promise<void>;
}

export interface GuardValue {
  register: (api: StudioApi | null) => void;
  attempt: (proceed: () => void) => void;
}

// Default just proceeds (no guard) — safe when used outside a provider.
export const GuardContext = createContext<GuardValue>({
  register: () => {},
  attempt: (proceed) => proceed(),
});

export const useGuard = () => useContext(GuardContext);
