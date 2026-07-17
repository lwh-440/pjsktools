# PJSK Tools Android

Native Android client scaffold for the API in `../apps/api`.

## Open locally

1. Open this `android/` directory in Android Studio.
2. Use Android Studio's bundled JDK 21.
3. Let Gradle sync and select the `debug` build variant.
4. Start the backend from the repository root with `npm run dev`.
5. Run an emulator; debug builds use `http://10.0.2.2:4000/`.

`staging` and `release` currently use reserved `.invalid` hosts. Replace them only when real HTTPS endpoints are available. Release builds do not permit cleartext traffic.

## Initial package boundaries

- `core/config`: environment and build configuration.
- `core/model`, `core/network`, `core/database`, `core/datastore`: add these as the first API slice is implemented.
- `ui`: app shell and design system.
- `feature/*`: add features according to the phases in `../agent.md`.

The app must call this project's backend only. Do not call upstream PJSK data sources directly from Android.
