import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Persisted app state. The photo itself (blob URL) is session-only and lives
// in App state; preferences and the current design survive reloads.
const useRoomStore = create(
  persist(
    (set) => ({
      selectedRoom: 'living',
      selectedStyle: 'Japandi',
      budget: 25_000_000, // IDR; null = no limit
      roomSize: null, // { w, l } in meters when the user measured the room; null = let the AI estimate
      locale: 'en',
      roomGraph: null,
      designId: null, // id of the saved design this roomGraph belongs to (logged-in users)

      setSelectedRoom: (selectedRoom) => set({ selectedRoom }),
      setSelectedStyle: (selectedStyle) => set({ selectedStyle }),
      setBudget: (budget) => set({ budget }),
      setRoomSize: (roomSize) => set({ roomSize }),
      setLocale: (locale) => set({ locale }),
      setRoomGraph: (roomGraph) => set({ roomGraph }),
      updateRoomGraph: (fn) => set(s => ({ roomGraph: fn(s.roomGraph) })),
      setDesignId: (designId) => set({ designId }),
    }),
    {
      name: 'tataloka_store_v1',
      partialize: (s) => ({ selectedRoom: s.selectedRoom, selectedStyle: s.selectedStyle, budget: s.budget, roomSize: s.roomSize, locale: s.locale, roomGraph: s.roomGraph, designId: s.designId }),
    }
  )
)

export default useRoomStore
