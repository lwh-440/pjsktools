# Catalogue filter image sources

The unit logos and attribute icons in this directory are copied from the checked-out reference repository:

- Project: Sekai Viewer (`Sekai-World/sekai-viewer`)
- Repository: https://github.com/Sekai-World/sekai-viewer
- Local reference origin: `refer/sekai-viewer`
- Local reference commit: `94e84d45507c6f780c3ecdbd60d5ab3ddb55cf94`
- Pinned upstream source base: `https://raw.githubusercontent.com/Sekai-World/sekai-viewer/94e84d45507c6f780c3ecdbd60d5ab3ddb55cf94/`
- Repository software license: GNU General Public License v3.0 (`refer/sekai-viewer/LICENSE`)
- Official Project SEKAI unit-page cross-check: https://pjsekai.sega.jp/character/unite03/index.html

The repository license is recorded for source traceability and does not imply that the underlying Project SEKAI logos or game artwork are relicensed under GPL. Project SEKAI names, logos, and artwork remain the property of their respective rights holders (including SEGA and Colorful Palette). These small local copies are used only as identification marks in the catalogue filter UI.

## Unit logos

Copied from `refer/sekai-viewer/public/images/jp/logol_outline/`:

| Local file | Source file | Filter keys |
| --- | --- | --- |
| `units/light_sound.png` | `logo_light_sound.png` | `light_sound`, `ln`, `light_music_club` |
| `units/idol.png` | `logo_idol.png` | `idol`, `mmj` |
| `units/street.png` | `logo_street.png` | `street`, `vbs` |
| `units/theme_park.png` | `logo_theme_park.png` | `theme_park`, `ws` |
| `units/school_refusal.png` | `logo_school_refusal.png` | `school_refusal`, `25ji` |
| `units/piapro.png` | `logo_piapro.png` | `piapro`, `vs`, `virtual_singer`, `vocaloid` |

## Attribute icons

Copied from `refer/sekai-viewer/src/assets/`:

| Local file | Source file | Filter key |
| --- | --- | --- |
| `attributes/cool.png` | `icon_attribute_cool.png` | `cool` |
| `attributes/cute.png` | `icon_attribute_cute.png` | `cute` |
| `attributes/happy.png` | `icon_attribute_happy.png` | `happy` |
| `attributes/mysterious.png` | `icon_attribute_mysterious.png` | `mysterious` |
| `attributes/pure.png` | `icon_attribute_pure.png` | `pure` |

All 11 copied files were verified as PNG images (not HTML) and checked for valid dimensions before inclusion. The UI keeps the text label and hides a failed decorative image, so filtering remains usable if an asset cannot load.
