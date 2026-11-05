// 6 rooms — typical dimensions in meters and the furniture types a design may use.
export const ROOMS = [
  { id: 'living', label: { id: 'Ruang Tamu', en: 'Living room' }, dims: { w: 4, l: 5, h: 2.8 }, icon: 'sofa', archetypes: ['sofa', 'coffee_table', 'tv_console', 'rug', 'lamp'], designTypes: ['sofa', 'coffee_table', 'tv_console', 'rug', 'lamp', 'chair', 'shelf'], desc: { id: 'Sofa, meja kopi, rak TV', en: 'Sofa, coffee table, TV' } },
  { id: 'bedroom', label: { id: 'Kamar Tidur', en: 'Bedroom' }, dims: { w: 3, l: 4, h: 2.7 }, icon: 'bed', archetypes: ['bed', 'wardrobe', 'desk', 'lamp', 'rug'], designTypes: ['bed', 'wardrobe', 'desk', 'chair', 'lamp', 'rug', 'shelf'], desc: { id: 'Ranjang, lemari, meja', en: 'Bed, wardrobe, desk' } },
  { id: 'kitchen', label: { id: 'Dapur', en: 'Kitchen' }, dims: { w: 3, l: 3, h: 2.6 }, icon: 'kitchen', archetypes: ['dining_table', 'chair', 'shelf', 'stool'], designTypes: ['dining_table', 'chair', 'shelf', 'stool', 'lamp'], desc: { id: 'Meja, kursi, rak', en: 'Table, chairs, shelf' } },
  { id: 'workspace', label: { id: 'Ruang Kerja', en: 'Home office' }, dims: { w: 2.5, l: 3, h: 2.7 }, icon: 'desk', archetypes: ['desk', 'chair', 'shelf', 'lamp', 'rug'], designTypes: ['desk', 'chair', 'shelf', 'lamp', 'rug', 'wardrobe'], desc: { id: 'Meja kerja, kursi', en: 'Desk, chair, storage' } },
  { id: 'dining', label: { id: 'Ruang Makan', en: 'Dining room' }, dims: { w: 3, l: 3.5, h: 2.7 }, icon: 'dining', archetypes: ['dining_table', 'chair', 'shelf', 'lamp'], designTypes: ['dining_table', 'chair', 'shelf', 'lamp', 'rug'], desc: { id: 'Meja makan 4 kursi', en: '4-seat dining' } },
  { id: 'bathroom', label: { id: 'Kamar Mandi', en: 'Bathroom' }, dims: { w: 2, l: 2.5, h: 2.6 }, icon: 'bath', archetypes: ['sink', 'bathtub', 'toilet', 'shelf'], designTypes: ['sink', 'bathtub', 'toilet', 'shelf', 'lamp'], desc: { id: 'Wastafel, bathtub', en: 'Sink, bathtub' } },
]

export function getRoom(id) { return ROOMS.find(r => r.id === id) || ROOMS[0] }
export const ROOM_IDS = ROOMS.map(r => r.id)
