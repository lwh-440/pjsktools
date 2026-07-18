package com.pjsktools.app.core

/** Canonical API origins passed to each network-backed shell branch. */
data class ShellApiOrigins private constructor(
    val core: String,
    val catalog: String,
    val events: String,
    val account: String,
    val content: String,
    val home: String,
    val profile: String,
    val deckCompare: String,
    val share: String
) {
    companion object {
        fun from(canonicalOrigin: String) = ShellApiOrigins(
            core = canonicalOrigin,
            catalog = canonicalOrigin,
            events = canonicalOrigin,
            account = canonicalOrigin,
            content = canonicalOrigin,
            home = canonicalOrigin,
            profile = canonicalOrigin,
            deckCompare = canonicalOrigin,
            share = canonicalOrigin
        )
    }
}
