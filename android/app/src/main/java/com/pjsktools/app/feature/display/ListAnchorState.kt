package com.pjsktools.app.feature.display

/** The lightweight list position kept across recreation, without retaining list data. */
data class SavedListAnchor(val index: Int, val offset: Int)

internal fun recordVisibleListAnchor(
    current: SavedListAnchor,
    visibleIndex: Int,
    visibleOffset: Int,
    canRecord: Boolean
): SavedListAnchor = if (canRecord) {
    SavedListAnchor(visibleIndex.coerceAtLeast(0), visibleOffset.coerceAtLeast(0))
} else current

internal fun canRestoreSavedListAnchor(totalItems: Int, saved: SavedListAnchor): Boolean =
    totalItems > saved.index
