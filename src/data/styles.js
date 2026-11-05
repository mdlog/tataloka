// 6 styles per user choice
export const STYLES = [
  { id:'Japandi', label:{id:'Japandi', en:'Japandi'}, desc:{id:'Kayu hangat + beige, linen, wabi-sabi', en:'Warm wood + beige, linen'}, palette:['#d7c3a5','#a67c52','#f5f1e8','#3a2d1f'], materials:['wood','linen','stone','ceramic'], promptSnippet:'warm wood, beige linen, low profile, wabi-sabi, natural light', swatch:['#d7c3a5','#3a2d1f','#f5f1e8'] },
  { id:'Minimalist', label:{id:'Minimalis', en:'Minimalist'}, desc:{id:'Putih/grey, garis bersih, matte', en:'White/grey, clean lines'}, palette:['#ffffff','#e5e5e5','#111111','#9a9ab0'], materials:['matte','metal','glass'], promptSnippet:'minimalist, white grey, clean lines, negative space, matte', swatch:['#ffffff','#111111','#e5e5e5'] },
  { id:'Scandinavian', label:{id:'Skandinavia', en:'Scandinavian'}, desc:{id:'Oak terang, hygge, kaki ramping', en:'Light oak, hygge textiles'}, palette:['#f0e6d3','#a8c3b9','#ffffff','#4a6741'], materials:['oak','wool','linen'], promptSnippet:'scandinavian, light oak, hygge textiles, tapered legs, bright', swatch:['#f0e6d3','#a8c3b9','#4a6741'] },
  { id:'Industrial', label:{id:'Industrial', en:'Industrial'}, desc:{id:'Metal ekspos, beton, kulit', en:'Exposed metal, concrete'}, palette:['#2a2a2a','#8a7a6a','#d4c5b0','#ff4d2a'], materials:['metal','concrete','leather'], promptSnippet:'industrial, exposed metal, concrete, leather, Edison bulb', swatch:['#2a2a2a','#8a7a6a','#d4c5b0'] },
  { id:'Modern', label:{id:'Modern', en:'Modern'}, desc:{id:'Gloss, kaca, chrome, geometris', en:'Gloss, glass, chrome'}, palette:['#ffffff','#0a0a0f','#c0c0c0','#ff4a1a'], materials:['glass','chrome','gloss','marble'], promptSnippet:'modern, high gloss, glass chrome, geometric, luxury', swatch:['#ffffff','#0a0a0f','#ff4a1a'] },
  { id:'Bohemian', label:{id:'Bohemian', en:'Bohemian'}, desc:{id:'Rotan, terracotta, tekstil pola', en:'Rattan, terracotta, pattern'}, palette:['#c17a3d','#7a4a2b','#f5d0a9','#2d4a3e'], materials:['rattan','terracotta','textile','wood'], promptSnippet:'bohemian, rattan, terracotta, layered textiles, eclectic', swatch:['#c17a3d','#f5d0a9','#2d4a3e'] },
]

export function getStyle(id){ return STYLES.find(s=>s.id===id) || STYLES[0] }
export const STYLE_IDS = STYLES.map(s=>s.id)
