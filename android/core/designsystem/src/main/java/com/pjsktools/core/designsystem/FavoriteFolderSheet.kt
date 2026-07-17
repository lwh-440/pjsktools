@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.pjsktools.core.designsystem

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.pjsktools.core.model.Favorite
import com.pjsktools.core.model.FavoriteFolder

@Composable
fun FavoriteFolderSheet(
    favorite: Favorite,
    folders: List<FavoriteFolder>,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSave: (Set<String>) -> Unit,
    onRemove: () -> Unit
) {
    var selected by remember(favorite.id, favorite.folderIds) { mutableStateOf(favorite.folderIds) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)
        ) {
            Text(stringResource(R.string.favorite_folders_title), Modifier.padding(horizontal = 24.dp, vertical = 12.dp))
            ListItem(
                headlineContent = { Text(stringResource(R.string.favorite_unfiled)) },
                supportingContent = { Text(stringResource(R.string.favorite_unfiled_hint)) },
                trailingContent = {
                    Checkbox(selected.isEmpty(), { checked -> if (checked) selected = emptySet() })
                }
            )
            folders.forEach { folder ->
                ListItem(
                    headlineContent = { Text(folder.name) },
                    supportingContent = { folder.description?.let { Text(it) } },
                    trailingContent = {
                        Checkbox(folder.id in selected, { checked ->
                            selected = if (checked) selected + folder.id else selected - folder.id
                        })
                    }
                )
            }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TextButton(onRemove, enabled = !busy, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.favorite_remove))
                }
                Button({ onSave(selected) }, enabled = !busy, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.favorite_save))
                }
            }
        }
    }
}
