# Third-Party Notices

This file records the third-party software and reference projects relevant to
this repository. It does not grant rights to any Project Sekai game data,
assets, trademarks, audio, stories, models, or other copyrighted content.

## Copyleft reference projects

### Sekai Viewer

- Project: `Sekai-World/sekai-viewer`
- Repository: https://github.com/Sekai-World/sekai-viewer
- Local reference revision: `94e84d45507c6f780c3ecdbd60d5ab3ddb55cf94`
- License: GNU General Public License, version 3.0
- Use in this project: reference and source of derived or adapted behavior in
  content playback, asset URL handling, catalog behavior, and tools.

This project is distributed under AGPL-3.0-or-later so that GPL-3.0-covered
derived work is distributed under compatible terms. Preserve applicable
upstream copyright and license notices in derived source files.

### Moesekai

- Project: `moe-sekai/Moesekai`
- Repository: https://github.com/moe-sekai/Moesekai
- Local reference revision: `6165a76ca0f832c98ad550087dd440bf4192e258`
- License: GNU Affero General Public License, version 3.0
- Use in this project: reference and source of derived or adapted behavior in
  calculators, master-data models, recommendation flows, charts, tooling, and
  the Haruki OAuth endpoint/PKCE contract. pjsktools uses its own server-side
  token custody and cross-device persistence architecture.

Any modified or derived AGPL-covered work must remain available to users of a
public network deployment under AGPL-3.0-or-later.

## MIT-licensed projects

### Team-Haruki projects

- `Team-Haruki/Haruki-Sekai-API`
- `Team-Haruki/Haruki-Toolbox-Backend`
- `Team-Haruki/haruki-sekai-*-master`
- `Team-Haruki/Haruki-Sekai-Asset-Updater`

These projects are used as implementation and data-flow references. Retain
the applicable MIT copyright and license notices when copying their code.
Their MIT licenses cover their contributed code and repository content only;
they do not grant rights to third-party Project Sekai content contained in or
obtained through those projects.

### pixi-live2d-display-mulmotion

- Package: `@sekai-world/pixi-live2d-display-mulmotion` version `0.5.1`
- Repository: https://github.com/Sekai-World/pixi-live2d-display
- License: MIT
- Copyright: Copyright (c) 2020 Guan

The package license permits use of the runtime library. It does not license
the Live2D models or any other game assets loaded by the library.

## Notice maintenance

Before a public release, update this document with the exact upstream commit,
file paths, and license notices for every copied or modified third-party file.
Do not remove upstream notices from source files or distribution artifacts.
