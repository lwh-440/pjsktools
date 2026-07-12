# Open Source Compliance

## Project license

The source code in this repository is licensed under the GNU Affero General
Public License, version 3 or later (`AGPL-3.0-or-later`), except where a file
states a different license or an upstream notice requires separate treatment.
The full license text is in `LICENSE`.

This licensing choice is intentional: the project includes or may include
derived and adapted behavior from GPL-3.0 and AGPL-3.0 reference projects.

## Public deployment gate

Before making a public web/API deployment available, the release owner must:

1. Publish the exact source for the deployed revision in a publicly reachable
   GitHub repository under `AGPL-3.0-or-later`.
2. Keep `LICENSE` and `THIRD_PARTY_NOTICES.md` in that repository and retain
   all applicable upstream copyright/license headers.
3. Provide a stable source URL in the web application's About/Legal page and
   in the API's public legal metadata or equivalent response.
4. Make deployment configuration, build scripts, and modifications needed to
   run the public service available as Corresponding Source. Do not publish
   secrets, user data, credentials, private keys, or provider tokens.
5. Tag the exact deployed commit and keep the tag/repository reachable while
   the corresponding public service remains available.
6. Update `THIRD_PARTY_NOTICES.md` with the exact upstream revisions and
   copied/modified file paths before each release.

## Scope boundary

GPL, AGPL, and MIT licenses apply to the relevant software code. They do not
grant any permission to use Project Sekai intellectual property or content.
Separate official rules and permissions govern game names, trademarks,
master data, images, cards, music, stories, videos, Live2D models, virtual
lives, player data, and other game-related materials.

## Development rule

When adapting code from `refer/sekai-viewer` or `refer/Moesekai`, preserve
the original notice where applicable and record the upstream path and commit
in the changed file or in `THIRD_PARTY_NOTICES.md`. When the relationship is
only behavioral study and no protected expression is copied, describe it as
a reference rather than an upstream-derived file.
