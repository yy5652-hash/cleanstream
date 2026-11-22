# Design

## Colour

The interface takes its colours from **Under the Wave off Kanagawa** (*Kanagawa oki nami ura*), Katsushika Hokusai,
ca. 1830–32, woodblock print, The Metropolitan Museum of Art, accession JP1847 (object 45434), public domain.
Reference image: [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg).
Six main colours were extracted from the print with k-means and mapped by hand to interface roles; every text pair
below meets WCAG AA (4.5:1) and was checked with axe on every page in both themes.

| Token | Light | Dark | From the print |
| --- | --- | --- | --- |
| `--c-paper` page | `#f3eedf` | `#0c1520` | washi paper / night sea |
| `--c-card` | `#fbf8ef` | `#132130` | |
| `--c-well` | `#e8e0ca` | `#1a2a3c` | |
| `--c-line` | `#d9cfb5` | `#29394c` | |
| `--c-ink` text | `#14273b` | `#f3eedf` | deepest Prussian blue / paper |
| `--c-ink-2` | `#33506b` | `#d3cab1` | |
| `--c-ink-3` | `#4c6378` | `#ada38a` | |
| `--c-primary` buttons | `#21466b` | `#f3eedf` | Prussian blue |
| `--c-accent` focus, links | `#2f6292` | `#79a9d6` | wave foam |

The bin colours are not part of the palette: each answer uses its city's official bin colour from the rule pack.
The kiosk always uses the dark set, on the night-sea ground `#0a1420`.

## Type

One family, Inter (SIL OFL 1.1), Latin subset only. The giant headline (`text-display`) and the bin name on an answer
carry the page; everything else stays quiet.
