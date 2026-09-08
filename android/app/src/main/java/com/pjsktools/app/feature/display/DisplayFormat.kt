package com.pjsktools.app.feature.display

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val unavailable = "暂缺"

/** Formats nullable server values without conflating an actual zero with unavailable data. */
fun displayCount(value: Long?): String = value?.let {
    NumberFormat.getIntegerInstance(Locale.getDefault()).format(it)
} ?: unavailable

/** Formats a nullable decimal while retaining integer values without a noisy fractional suffix. */
fun displayDecimal(value: Double?): String = value?.let {
    if (it % 1.0 == 0.0) displayCount(it.toLong())
    else String.format(Locale.getDefault(), "%,.2f", it)
} ?: unavailable

/** Displays the API's epoch-millisecond timestamps in the same player-facing local form. */
fun displayDateTime(value: Long?): String = value?.let {
    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.getDefault())
        .withZone(ZoneId.systemDefault())
        .format(Instant.ofEpochMilli(it))
} ?: unavailable

/** Applies tabular figures where aligned result columns are presented. */
@Composable
fun numericTextStyle(base: TextStyle = MaterialTheme.typography.bodyMedium): TextStyle =
    base.copy(fontFeatureSettings = "tnum")
