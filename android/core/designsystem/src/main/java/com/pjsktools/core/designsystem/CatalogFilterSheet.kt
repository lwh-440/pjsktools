@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.pjsktools.core.designsystem

import android.graphics.Color as AndroidColor
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.pjsktools.core.model.CatalogFilterGroup
import com.pjsktools.core.model.CatalogFilterMeta
import com.pjsktools.core.model.CatalogFilterOption
import com.pjsktools.core.model.CatalogFilterState
import com.pjsktools.core.model.FilterMetadataStatus

@Composable
fun CatalogFilterSheet(
    meta: CatalogFilterMeta,
    state: CatalogFilterState,
    status: FilterMetadataStatus,
    message: String?,
    resultCount: Int?,
    title: String,
    clearLabel: String,
    doneLabel: String,
    unavailableLabel: String,
    onOption: (String, String) -> Unit,
    onToggle: (String, Boolean) -> Unit,
    onClear: () -> Unit,
    onRetry: () -> Unit,
    onDismiss: () -> Unit
) {
    val content: @Composable () -> Unit = {
        FilterContent(
            meta = meta,
            state = state,
            status = status,
            message = message,
            resultCount = resultCount,
            title = title,
            clearLabel = clearLabel,
            doneLabel = doneLabel,
            unavailableLabel = unavailableLabel,
            onOption = onOption,
            onToggle = onToggle,
            onClear = onClear,
            onRetry = onRetry,
            onDismiss = onDismiss
        )
    }

    if (LocalConfiguration.current.screenWidthDp >= 840) {
        Dialog(
            onDismissRequest = onDismiss,
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
                Surface(
                    modifier = Modifier.fillMaxHeight().widthIn(min = 420.dp, max = 560.dp),
                    tonalElevation = 6.dp,
                    shadowElevation = 12.dp
                ) { content() }
            }
        }
    } else {
        ModalBottomSheet(onDismissRequest = onDismiss) { content() }
    }
}

@Composable
private fun FilterContent(
    meta: CatalogFilterMeta,
    state: CatalogFilterState,
    status: FilterMetadataStatus,
    message: String?,
    resultCount: Int?,
    title: String,
    clearLabel: String,
    doneLabel: String,
    unavailableLabel: String,
    onOption: (String, String) -> Unit,
    onToggle: (String, Boolean) -> Unit,
    onClear: () -> Unit,
    onRetry: () -> Unit,
    onDismiss: () -> Unit
) {
    val hasMetadata = meta.groups.isNotEmpty() || meta.toggles.isNotEmpty()
    Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(
                stringResource(R.string.catalog_filter_summary, state.activeCount, resultCount ?: 0),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            FilterStatus(status, message, hasMetadata, unavailableLabel, onRetry)
        }
        HorizontalDivider()
        if (hasMetadata) {
            LazyColumn(
                Modifier.fillMaxWidth().weight(1f, fill = false).heightIn(max = 680.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp)
            ) {
                items(meta.groups, key = { it.key }) { group ->
                    FilterGroup(group, state, onOption)
                }
                items(meta.toggles, key = { it.key }) { toggle ->
                    val enabled = state.toggles[toggle.key] == true
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(toggle.label, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                        Switch(enabled, { onToggle(toggle.key, it) })
                    }
                }
            }
        } else if (status == FilterMetadataStatus.LOADING) {
            Box(Modifier.fillMaxWidth().padding(36.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            Spacer(Modifier.weight(1f, fill = false))
        }
        HorizontalDivider()
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClear, enabled = state.activeCount > 0) { Text(clearLabel) }
            Button(onDismiss) { Text(doneLabel) }
        }
    }
}

@Composable
private fun FilterStatus(
    status: FilterMetadataStatus,
    message: String?,
    hasMetadata: Boolean,
    unavailableLabel: String,
    onRetry: () -> Unit
) {
    val label = when (status) {
        FilterMetadataStatus.LOADING -> if (hasMetadata) null else stringResource(R.string.catalog_filter_loading)
        FilterMetadataStatus.CONTENT -> null
        FilterMetadataStatus.OFFLINE -> if (hasMetadata) {
            stringResource(R.string.catalog_filter_offline_cached)
        } else {
            unavailableLabel
        }
        FilterMetadataStatus.UNAVAILABLE -> message ?: stringResource(R.string.catalog_filter_unavailable)
        FilterMetadataStatus.ERROR -> message ?: stringResource(R.string.catalog_filter_error)
    }
    if (label != null) {
        Row(
            Modifier.fillMaxWidth().padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (status == FilterMetadataStatus.ERROR || status == FilterMetadataStatus.UNAVAILABLE || !hasMetadata) {
                TextButton(onRetry) { Text(stringResource(R.string.catalog_filter_retry)) }
            }
        }
    }
}

@Composable
private fun FilterGroup(
    group: CatalogFilterGroup,
    state: CatalogFilterState,
    onOption: (String, String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(group.label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            if (group.matchAll) {
                Text(
                    stringResource(R.string.catalog_filter_match_all),
                    Modifier.padding(start = 8.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
        group.options.chunked(2).forEach { rowOptions ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                rowOptions.forEach { option ->
                    FilterOptionCell(
                        option = option,
                        selected = option.value in state.selected[group.key].orEmpty(),
                        onClick = { onOption(group.key, option.value) },
                        modifier = Modifier.weight(1f)
                    )
                }
                if (rowOptions.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun FilterOptionCell(
    option: CatalogFilterOption,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val background = if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant
    val foreground = if (selected) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        modifier = modifier.clip(MaterialTheme.shapes.small).clickable(onClick = onClick),
        color = background,
        contentColor = foreground,
        shape = MaterialTheme.shapes.small
    ) {
        Row(
            Modifier.fillMaxWidth().padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            when {
                option.iconCandidates.isNotEmpty() -> BackendImage(
                    candidates = option.iconCandidates,
                    contentDescription = null,
                    cacheKey = "filter:${option.value}",
                    modifier = Modifier.size(32.dp).clip(MaterialTheme.shapes.extraSmall),
                    contentScale = ContentScale.Fit
                )
                option.color.toComposeColor() != null -> Box(
                    Modifier.size(24.dp).clip(MaterialTheme.shapes.extraSmall).background(option.color.toComposeColor()!!)
                )
                option.iconKey?.contains("rarity", ignoreCase = true) == true -> Text(
                    rarityMark(option.iconKey),
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelMedium
                )
            }
            Column(Modifier.weight(1f)) {
                Text(option.label, maxLines = 2, style = MaterialTheme.typography.bodyMedium)
                Text(option.count.toString(), style = MaterialTheme.typography.labelSmall, color = foreground.copy(alpha = 0.75f))
            }
            if (selected) androidx.compose.material3.Icon(Icons.Outlined.Check, contentDescription = null, modifier = Modifier.size(18.dp))
        }
    }
}

private fun String?.toComposeColor(): Color? = this?.let { value ->
    runCatching { Color(AndroidColor.parseColor(value)) }.getOrNull()
}

private fun rarityMark(iconKey: String?): String {
    val count = iconKey?.filter(Char::isDigit)?.toIntOrNull()?.coerceIn(1, 6) ?: 1
    return "\u2605".repeat(count)
}
