// Display names for the item types the model knows (ids match ml/taxonomy.py).
export const ITEMS: Record<string, { name: string; examples: string; aka?: string[] }> = {
  plastic_bottle: { name: 'Plastic bottle or jug', examples: 'water and soda bottles, milk and detergent jugs', aka: ['water bottle', 'soda bottle', 'pop bottle', 'shampoo bottle', 'detergent bottle', 'laundry detergent', 'milk jug', 'juice bottle', 'plastic jug', 'ketchup bottle', 'sports drink bottle', 'PET bottle'] },
  plastic_container: { name: 'Rigid plastic container', examples: 'tubs, clamshells, takeout containers', aka: ['takeout container', 'take-out box', 'clamshell', 'yogurt cup', 'yogurt tub', 'butter tub', 'deli container', 'salad box', 'berry box', 'plastic tray', 'food container', 'tupperware'] },
  plastic_cup: { name: 'Plastic cup', examples: 'clear cold-drink cups, party cups', aka: ['iced coffee cup', 'cold cup', 'solo cup', 'smoothie cup', 'bubble tea cup', 'boba cup'] },
  plastic_lid_cap: { name: 'Plastic lid or cap', examples: 'bottle caps, cup and tub lids', aka: ['bottle cap', 'plastic lid', 'coffee lid', 'cup lid', 'cap'] },
  plastic_bag_film: { name: 'Plastic bag or film', examples: 'shopping bags, wrap, mailers', aka: ['plastic bag', 'grocery bag', 'shopping bag', 'bubble wrap', 'plastic wrap', 'cling film', 'saran wrap', 'ziploc bag', 'ziplock bag', 'bread bag', 'poly mailer', 'mailer', 'garbage bag', 'trash bag'] },
  snack_wrapper: { name: 'Snack wrapper', examples: 'chip bags, candy wrappers, pouches', aka: ['chip bag', 'crisp packet', 'candy wrapper', 'granola bar wrapper', 'chocolate wrapper', 'snack bag', 'pouch', 'juice pouch', 'coffee bag'] },
  foam: { name: 'Foam (polystyrene)', examples: 'foam cups, clamshells, packing foam', aka: ['styrofoam', 'polystyrene', 'foam cup', 'foam container', 'packing peanuts', 'foam tray', 'EPS'] },
  plastic_utensil_straw: { name: 'Plastic utensil or straw', examples: 'forks, spoons, straws', aka: ['plastic fork', 'plastic spoon', 'plastic knife', 'cutlery', 'straw', 'utensils', 'stirrer'] },
  paper: { name: 'Paper', examples: 'office paper, mail, newspaper, magazines', aka: ['newspaper', 'magazine', 'office paper', 'printer paper', 'mail', 'envelope', 'junk mail', 'flyer', 'notebook paper'] },
  paper_bag: { name: 'Paper bag', examples: 'grocery and takeout bags', aka: ['paper bag', 'grocery paper bag', 'lunch bag', 'takeout bag'] },
  cardboard: { name: 'Cardboard', examples: 'shipping boxes, cereal boxes, tubes', aka: ['cardboard box', 'amazon box', 'shipping box', 'cereal box', 'shoe box', 'paper towel roll', 'toilet paper roll', 'paper egg carton', 'corrugated'] },
  pizza_box: { name: 'Pizza box', examples: 'clean or greasy pizza boxes', aka: ['pizza box', 'greasy pizza box'] },
  soiled_paper: { name: 'Food-soiled paper', examples: 'used napkins, paper towels, tissues', aka: ['napkin', 'paper towel', 'tissue', 'kleenex', 'paper plate', 'greasy paper', 'used napkin'] },
  paper_cup: { name: 'Paper cup', examples: 'hot coffee cups', aka: ['coffee cup', 'paper coffee cup', 'starbucks cup', 'hot cup', 'to-go cup'] },
  carton: { name: 'Carton', examples: 'milk, juice and broth cartons', aka: ['milk carton', 'juice carton', 'juice box', 'oat milk carton', 'almond milk carton', 'soup carton', 'broth carton', 'tetra pak'] },
  metal_can: { name: 'Metal can', examples: 'soda cans, food cans', aka: ['soda can', 'beer can', 'aluminum can', 'tin can', 'soup can', 'food can', 'cat food can', 'can'] },
  aluminum_foil: { name: 'Aluminum foil', examples: 'foil, foil trays and pans', aka: ['aluminum foil', 'tin foil', 'foil tray', 'pie tin', 'foil pan', 'takeout foil'] },
  aerosol_can: { name: 'Aerosol can', examples: 'spray cans', aka: ['aerosol', 'spray can', 'hairspray', 'deodorant spray', 'whipped cream can', 'spray paint'] },
  metal_lid_scrap: { name: 'Small metal item', examples: 'jar lids, bottle caps, scrap metal', aka: ['jar lid', 'metal lid', 'metal bottle cap', 'beer cap', 'pull tab', 'scrap metal', 'wire hanger', 'pot', 'pan'] },
  glass_bottle_jar: { name: 'Glass bottle or jar', examples: 'beverage bottles, food jars', aka: ['glass', 'glass bottle', 'wine bottle', 'beer bottle', 'glass jar', 'jam jar', 'pasta sauce jar', 'pickle jar'] },
  drinking_glass_ceramic: { name: 'Drinking glass, ceramic or broken glass', examples: 'mugs, glasses, shards', aka: ['drinking glass', 'mug', 'ceramic', 'broken glass', 'ceramic plate', 'mirror', 'window glass'] },
  food_scraps: { name: 'Food scraps', examples: 'peels, cores, leftovers', aka: ['food scraps', 'banana peel', 'apple core', 'coffee grounds', 'egg shells', 'leftovers', 'fruit', 'vegetables', 'bones', 'tea bag'] },
  yard_waste: { name: 'Yard waste', examples: 'leaves, plants, branches', aka: ['leaves', 'grass', 'branches', 'plants', 'flowers', 'christmas tree'] },
  battery: { name: 'Battery', examples: 'AA/AAA, lithium-ion, button cells', aka: ['batteries', 'AA battery', 'AAA battery', 'lithium battery', 'phone battery', 'rechargeable battery', 'button battery', '9V battery', 'vape', 'e-cigarette'] },
  electronics: { name: 'Electronics', examples: 'phones, cables, earbuds', aka: ['phone', 'laptop', 'charger', 'cable', 'earbuds', 'headphones', 'e-waste', 'tablet', 'keyboard', 'computer mouse'] },
  textile: { name: 'Clothing and textiles', examples: 'clothes, linens, fabric', aka: ['clothes', 'clothing', 't-shirt', 'jeans', 'sweater', 'towel', 'bed sheets', 'fabric', 'socks'] },
  shoes: { name: 'Shoes', examples: 'sneakers, boots', aka: ['sneakers', 'boots', 'sandals'] },
  cigarette_butt: { name: 'Cigarette butt', examples: 'cigarette filters', aka: ['cigarette', 'cigarette butt'] },
  blister_pack: { name: 'Blister pack', examples: 'pill packs, plastic-backed packaging', aka: ['pill pack', 'pill packaging', 'medicine packaging'] },
  rope_string: { name: 'Rope or string', examples: 'twine, cords', aka: ['rope', 'string', 'twine', 'cord', 'garden hose', 'christmas lights'] },
  squeezable_tube: { name: 'Squeeze tube', examples: 'toothpaste, cosmetics', aka: ['toothpaste tube', 'toothpaste', 'lotion tube', 'tube'] },
  mask_gloves: { name: 'Mask or gloves', examples: 'disposable masks and gloves', aka: ['face mask', 'mask', 'gloves', 'latex gloves', 'disposable gloves'] },
}

export const itemName = (id: string) => ITEMS[id]?.name ?? id

// How well one name or synonym matches the query. The last word is the head noun ("cup lid" is a lid), so a match
// there beats a match elsewhere, which beats a word that only starts with the query.
function termScore(term: string, q: string): number {
  if (term === q) return 100
  const at = (i: number) => i < 0 || i >= term.length || /[\s,/()-]/.test(term[i])
  if (term.endsWith(q) && at(term.length - q.length - 1)) return 90
  for (let i = term.indexOf(q); i >= 0; i = term.indexOf(q, i + 1)) if (at(i - 1) && at(i + q.length)) return 75
  if (term.startsWith(q)) return 65
  if (term.split(/[\s,/()-]+/).some((w) => w.startsWith(q))) return 55
  return term.includes(q) ? 40 : 0
}

const singular = (q: string) => q.replace(/ies$/, 'y').replace(/(x|ch|sh|ss)es$/, '$1').replace(/([^s])s$/, '$1')

// Item types matching what someone typed, best first. Display names get a small bonus, the examples line a penalty.
export function searchItems(query: string, limit = 6): string[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (q.length < 2) return []
  const qs = singular(q) === q ? [q] : [q, singular(q)]
  const scored: [string, number][] = []
  for (const [id, it] of Object.entries(ITEMS)) {
    const terms: [string, number][] = [[it.name, 5], ...(it.aka ?? []).map((a): [string, number] => [a, 0]), [it.examples, -15]]
    let best = 0
    for (const [term, bonus] of terms) for (const [k, v] of qs.entries()) {
      const sc = termScore(term.toLowerCase(), v)
      if (sc) best = Math.max(best, sc + bonus - 5 * k)
    }
    if (best > 0) scored.push([id, best])
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id)
}
