
from PIL import Image
im = Image.open("apps/web/public/assets/sprites/enemies-atlas.png").convert("RGBA")
# Measure the opaque bounding box inside one 64px cell for the slime (row 0, col 0)
cell = im.crop((0, 0, 64, 64))
print("slime cell bbox:", cell.getbbox())
cell2 = im.crop((0, 64, 64, 128))
print("crab  cell bbox:", cell2.getbbox())
