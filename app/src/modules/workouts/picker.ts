import { create } from 'zustand';

/** Hands the exercise picker's selection back to whichever screen opened it. */
interface PickerState {
  onPick: ((ids: string[]) => void) | null;
  open: (onPick: (ids: string[]) => void) => void;
  clear: () => void;
}

export const useExercisePicker = create<PickerState>((set) => ({
  onPick: null,
  open: (onPick) => set({ onPick }),
  clear: () => set({ onPick: null }),
}));
