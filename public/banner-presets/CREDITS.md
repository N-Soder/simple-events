# Banner preset credits

Provenance for every file in this directory. Nothing here requires attribution,
so this exists for maintenance rather than compliance: it is what lets any one
preset be swapped without re-researching the set, and what lets a self-hoster
check where the images came from.

The originals these are built from are not committed. See
`docs/BANNER_PRESETS.md` for how to rebuild.

## Photographs

All six are from [Pexels](https://www.pexels.com/) under the
[Pexels licence](https://www.pexels.com/license/): free for commercial use, no
attribution required, modification allowed. Each was cropped and re-encoded by
`scripts/build-banner-presets.mjs` — to a 2:1 window at 1600 x 800 in WebP, from
originals between 3 and 6 K wide — so none is an unaltered copy. None is graded;
the colour is the photographer's.

None contains a recognisable face. That is deliberate and should stay true of any
replacement: the licence forbids imagery that implies endorsement of the product
by the people in it, and it grants nothing about the depicted person's own
rights.

| Preset | Source |
| --- | --- |
| `string-lights` | https://www.pexels.com/photo/brown-string-lights-in-tree-1124960/ |
| `embers` | https://www.pexels.com/photo/barbecues-in-charcoal-grill-533325/ |
| `laid-table` | https://www.pexels.com/photo/close-up-of-meal-and-alcohol-on-table-6954056/ |
| `coffee` | https://www.pexels.com/photo/close-up-of-a-cup-of-coffee-and-croissants-in-a-cafe-19279845/ |
| `picnic` | https://www.pexels.com/photo/picnic-in-a-park-16564695/ (Melike B, @mlkbnl) |
| `confetti` | https://www.pexels.com/photo/colorful-confetti-against-white-background-25956373/ |

`picnic`'s slug reads like a crowd shot and is not one: the page is the hamper,
blanket and bicycle. Checked against the built file rather than assumed, because
a wrong URL here is a preset nobody can refetch.

The remaining five photographer names are worth filling in from each photo page
when someone is next in here. Pexels does not require it, but a name is more use
than a URL if a photo ever has to be traced.

## Gradients

`gradient-warm` and `gradient-cool` are generated from the app's own palette by
`scripts/build-banner-presets.mjs`. No third-party content, nothing to license.
