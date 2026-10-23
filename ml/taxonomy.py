"""Item types Cleanstream recognises, the text prompts for each, and how public dataset labels map onto them.

Item types are chosen by what changes the bin: a plastic bottle and a plastic bag are both "plastic" to a
material classifier, but they go to different places in most cities.
"""

CLASSES = {
    "plastic_bottle": ["a plastic bottle", "a plastic water bottle", "a plastic soda bottle", "a plastic milk jug",
                       "a plastic detergent bottle"],
    "plastic_container": ["a plastic food container", "a plastic clamshell container", "a plastic takeout container",
                          "a plastic yogurt tub", "a rigid plastic tub"],
    "plastic_cup": ["a disposable plastic cup", "a clear plastic cup", "a plastic iced coffee cup"],
    "plastic_lid_cap": ["a plastic bottle cap", "a plastic lid", "a plastic cup lid"],
    "plastic_bag_film": ["a plastic bag", "a plastic shopping bag", "plastic wrap film", "a garbage bag",
                         "a crumpled plastic bag"],
    "snack_wrapper": ["a chip bag", "a candy wrapper", "a snack wrapper", "a crumpled foil-lined snack bag"],
    "foam": ["a styrofoam cup", "a styrofoam food container", "a piece of polystyrene foam", "packing foam"],
    "plastic_utensil_straw": ["a plastic fork", "a plastic spoon", "a plastic straw", "plastic cutlery"],
    "paper": ["a sheet of paper", "a newspaper", "a magazine", "junk mail", "printed office paper"],
    "paper_bag": ["a brown paper bag", "a paper shopping bag"],
    "cardboard": ["a cardboard box", "flattened cardboard", "a corrugated cardboard box", "a cereal box"],
    "pizza_box": ["a pizza box", "a greasy pizza box"],
    "soiled_paper": ["a used paper napkin", "a used paper towel", "a used tissue", "food-soiled paper"],
    "paper_cup": ["a paper coffee cup", "a disposable paper cup", "a paper hot cup"],
    "carton": ["a milk carton", "a juice carton", "a drink carton", "a tetra pak carton"],
    "metal_can": ["an aluminum soda can", "a drink can", "a tin can", "a food can", "a crushed aluminum can"],
    "aluminum_foil": ["aluminum foil", "a crumpled ball of aluminum foil", "an aluminum foil tray"],
    "aerosol_can": ["an aerosol spray can", "a spray paint can", "a deodorant spray can"],
    "metal_lid_scrap": ["a metal bottle cap", "a metal jar lid", "a can pull tab", "a piece of scrap metal"],
    "glass_bottle_jar": ["a glass bottle", "a glass jar", "a beer bottle", "a wine bottle"],
    "drinking_glass_ceramic": ["broken glass", "a drinking glass", "a ceramic mug", "shards of broken glass"],
    "food_scraps": ["food scraps", "a banana peel", "an apple core", "leftover food", "rotten vegetables"],
    "yard_waste": ["leaves and grass clippings", "garden waste", "tree branches and leaves", "dead plants"],
    "battery": ["a battery", "AA batteries", "a lithium-ion battery", "a used battery"],
    "electronics": ["a mobile phone", "a broken electronic device", "a charging cable", "computer parts",
                    "a pair of earbuds"],
    "textile": ["clothes", "a t-shirt", "a pair of jeans", "a pile of clothing", "old fabric"],
    "shoes": ["a shoe", "a pair of shoes", "a sneaker", "a boot"],
    "cigarette_butt": ["a cigarette butt", "cigarette butts"],
    "blister_pack": ["a blister pack", "a pill blister pack", "a plastic blister packaging"],
    "rope_string": ["a piece of rope", "string", "twine"],
    "squeezable_tube": ["a toothpaste tube", "a squeezable tube", "a cosmetics tube"],
    "mask_gloves": ["a disposable face mask", "disposable gloves", "a latex glove"],
}

TEMPLATES = ["a photo of {}.", "a close-up photo of {}.", "a photo of {} being thrown away."]

NAMES = list(CLASSES)

# Main material of each item type, used to score images whose dataset label is only a material.
MATERIAL = {
    "plastic_bottle": "plastic", "plastic_container": "plastic", "plastic_cup": "plastic", "plastic_lid_cap": "plastic",
    "plastic_bag_film": "plastic", "snack_wrapper": "plastic", "foam": "plastic", "plastic_utensil_straw": "plastic",
    "blister_pack": "plastic", "squeezable_tube": "plastic", "mask_gloves": "plastic",
    "paper": "paper", "paper_bag": "paper", "cardboard": "paper", "pizza_box": "paper", "soiled_paper": "paper",
    "paper_cup": "paper", "carton": "paper",
    "metal_can": "metal", "aluminum_foil": "metal", "aerosol_can": "metal", "metal_lid_scrap": "metal",
    "glass_bottle_jar": "glass", "drinking_glass_ceramic": "glass",
    "food_scraps": "organic", "yard_waste": "organic",
    "battery": "hazardous", "electronics": "hazardous",
    "textile": "textile", "shoes": "textile",
    "cigarette_butt": "other", "rope_string": "other",
}

# TACO (Trash Annotations in Context) category -> item type. Categories left out are ambiguous for bin rules.
TACO = {
    "Aluminium foil": "aluminum_foil", "Battery": "battery",
    "Aluminium blister pack": "blister_pack", "Carded blister pack": "blister_pack",
    "Other plastic bottle": "plastic_bottle", "Clear plastic bottle": "plastic_bottle",
    "Glass bottle": "glass_bottle_jar", "Glass jar": "glass_bottle_jar",
    "Plastic bottle cap": "plastic_lid_cap", "Plastic lid": "plastic_lid_cap",
    "Metal bottle cap": "metal_lid_scrap", "Metal lid": "metal_lid_scrap", "Pop tab": "metal_lid_scrap",
    "Scrap metal": "metal_lid_scrap",
    "Broken glass": "drinking_glass_ceramic", "Glass cup": "drinking_glass_ceramic",
    "Food Can": "metal_can", "Drink can": "metal_can", "Aerosol": "aerosol_can",
    "Toilet tube": "cardboard", "Other carton": "cardboard", "Egg carton": "cardboard",
    "Corrugated carton": "cardboard", "Drink carton": "carton", "Pizza box": "pizza_box",
    "Paper cup": "paper_cup", "Disposable plastic cup": "plastic_cup", "Other plastic cup": "plastic_cup",
    "Foam cup": "foam", "Foam food container": "foam", "Styrofoam piece": "foam",
    "Food waste": "food_scraps",
    "Magazine paper": "paper", "Normal paper": "paper", "Wrapping paper": "paper",
    "Tissues": "soiled_paper", "Paper bag": "paper_bag",
    "Plastic film": "plastic_bag_film", "Garbage bag": "plastic_bag_film",
    "Single-use carrier bag": "plastic_bag_film", "Polypropylene bag": "plastic_bag_film",
    "Other plastic wrapper": "snack_wrapper", "Crisp packet": "snack_wrapper",
    "Spread tub": "plastic_container", "Tupperware": "plastic_container",
    "Disposable food container": "plastic_container", "Other plastic container": "plastic_container",
    "Plastic glooves": "mask_gloves", "Plastic utensils": "plastic_utensil_straw",
    "Plastic straw": "plastic_utensil_straw", "Rope & strings": "rope_string", "Shoe": "shoes",
    "Squeezable tube": "squeezable_tube", "Cigarette": "cigarette_butt",
}

# Folder-labelled datasets. None = label too broad to pick an item type (e.g. "plastic" covers bottles and bags).
TRASHNET = {"cardboard": "cardboard", "glass": "glass_bottle_jar", "metal": None, "paper": "paper",
            "plastic": None, "trash": None}
REALWASTE = {"Cardboard": "cardboard", "Food Organics": "food_scraps", "Glass": "glass_bottle_jar", "Metal": None,
             "Paper": "paper", "Plastic": None, "Textile Trash": "textile", "Vegetation": "yard_waste",
             "Miscellaneous Trash": None}
GARBAGE_V2 = {"battery": "battery", "biological": "food_scraps", "cardboard": "cardboard", "clothes": "textile",
              "glass": "glass_bottle_jar", "metal": None, "paper": "paper", "plastic": None, "shoes": "shoes",
              "trash": None}
