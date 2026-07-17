@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.pjsktools.feature.favorites

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pjsktools.core.designsystem.BackendImage
import com.pjsktools.core.model.AuthRepository
import com.pjsktools.core.model.AuthState
import com.pjsktools.core.model.Favorite
import com.pjsktools.core.model.FavoriteBulkMode
import com.pjsktools.core.model.FavoriteFolder
import com.pjsktools.core.model.FavoriteRepository
import com.pjsktools.core.model.FavoriteType
import com.pjsktools.core.model.Region
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class FavoritesUiState(
    val auth: AuthState = AuthState.Loading,
    val favorites: List<Favorite> = emptyList(),
    val folders: List<FavoriteFolder> = emptyList(),
    val query: String = "",
    val folderId: String? = null,
    val unfiled: Boolean = false,
    val type: FavoriteType? = null,
    val region: Region? = null,
    val selected: Set<String> = emptySet(),
    val busy: Boolean = false,
    val message: String? = null
) {
    val visible: List<Favorite> get() = favorites.filter { favorite ->
        (!unfiled || favorite.folderIds.isEmpty()) &&
            (folderId == null || folderId in favorite.folderIds) &&
            (type == null || favorite.type == type) &&
            (region == null || favorite.region == region) &&
            (query.isBlank() || listOfNotNull(
                favorite.label,
                favorite.targetId,
                favorite.target?.displayName,
                favorite.target?.secondaryText
            ).joinToString(" ").contains(query, true))
    }
}

private data class FavoriteFilters(
    val query: String = "",
    val folderId: String? = null,
    val unfiled: Boolean = false,
    val type: FavoriteType? = null,
    val region: Region? = null
)

private data class FavoriteData(
    val auth: AuthState,
    val favorites: List<Favorite>,
    val folders: List<FavoriteFolder>
)

@HiltViewModel
class FavoritesViewModel @Inject constructor(
    authRepository: AuthRepository,
    private val repository: FavoriteRepository
) : ViewModel() {
    private val query = MutableStateFlow("")
    private val folderId = MutableStateFlow<String?>(null)
    private val unfiled = MutableStateFlow(false)
    private val type = MutableStateFlow<FavoriteType?>(null)
    private val region = MutableStateFlow<Region?>(null)
    private val selected = MutableStateFlow<Set<String>>(emptySet())
    private val operation = MutableStateFlow(false to null as String?)

    private val data = combine(
        authRepository.state,
        repository.favorites,
        repository.folders
    ) { auth, favorites, folders ->
        FavoriteData(auth, favorites, folders)
    }

    private val filters = combine(query, folderId, unfiled, type, region) {
            query, folderId, unfiled, type, region ->
        FavoriteFilters(query, folderId, unfiled, type, region)
    }

    val state = combine(
        data,
        filters,
        selected,
        operation
    ) { data, filters, selectedIds, running ->
        FavoritesUiState(
            auth = data.auth,
            favorites = data.favorites,
            folders = data.folders,
            query = filters.query,
            folderId = filters.folderId,
            unfiled = filters.unfiled,
            type = filters.type,
            region = filters.region,
            selected = selectedIds,
            busy = running.first,
            message = running.second
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), FavoritesUiState())

    init {
        viewModelScope.launch { authRepository.state.collect { if (it is AuthState.SignedIn) refresh() } }
    }

    fun search(value: String) { query.value = value }
    fun showAll() { folderId.value = null; unfiled.value = false }
    fun showUnfiled() { folderId.value = null; unfiled.value = true }
    fun showFolder(id: String) { folderId.value = id; unfiled.value = false }
    fun type(value: FavoriteType?) { type.value = value }
    fun region(value: Region?) { region.value = value }
    fun toggleSelected(id: String) {
        selected.value = selected.value.toMutableSet().apply { if (!add(id)) remove(id) }
    }
    fun clearSelection() { selected.value = emptySet() }
    fun refresh() = launchOperation { repository.refresh() }
    fun createFolder(name: String) = launchOperation { repository.createFolder(name) }
    fun updateFolder(folder: FavoriteFolder, name: String) = launchOperation { repository.updateFolder(folder, name, folder.description) }
    fun deleteFolder(folder: FavoriteFolder) = launchOperation { repository.deleteFolder(folder) }
    fun deleteFavorite(favorite: Favorite) = launchOperation { repository.remove(favorite) }
    fun organizeSelection(folder: FavoriteFolder, mode: FavoriteBulkMode) = launchOperation {
        repository.bulk(selected.value, setOf(folder.id), mode).onSuccess { selected.value = emptySet() }
    }

    private fun launchOperation(action: suspend () -> Result<*>) = viewModelScope.launch {
        operation.value = true to null
        val result = action()
        operation.value = false to result.exceptionOrNull()?.message
    }
}

@Composable
fun FavoritesScreen(
    onBack: () -> Unit,
    onLogin: () -> Unit,
    onOpen: (Favorite) -> Unit,
    viewModel: FavoritesViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.favorites_title)) },
                navigationIcon = { IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, stringResource(R.string.favorites_back)) } },
                actions = {
                    IconButton(viewModel::refresh, enabled = state.auth is AuthState.SignedIn && !state.busy) {
                        Icon(Icons.Outlined.Refresh, stringResource(R.string.favorites_refresh))
                    }
                }
            )
        }
    ) { padding ->
        if (state.auth !is AuthState.SignedIn) {
            Column(
                Modifier.fillMaxSize().padding(padding).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(stringResource(R.string.favorites_login_required), style = MaterialTheme.typography.titleMedium)
                Button(onLogin) { Text(stringResource(R.string.favorites_login)) }
            }
            return@Scaffold
        }
        FavoritesContent(state, viewModel, onOpen, Modifier.padding(padding))
    }
}

@Composable
private fun FavoritesContent(
    state: FavoritesUiState,
    viewModel: FavoritesViewModel,
    onOpen: (Favorite) -> Unit,
    modifier: Modifier
) {
    var folderName by remember { mutableStateOf("") }
    var bulkMode by remember { mutableStateOf(FavoriteBulkMode.ADD) }
    val editingFolder = state.folderId?.let { id -> state.folders.firstOrNull { it.id == id } }
    Column(modifier.fillMaxSize()) {
        OutlinedTextField(
            state.query, viewModel::search,
            Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            label = { Text(stringResource(R.string.favorites_search)) },
            singleLine = true
        )
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilterChip(state.folderId == null && !state.unfiled, viewModel::showAll, { Text(stringResource(R.string.favorites_all)) })
            FilterChip(state.unfiled, viewModel::showUnfiled, { Text(stringResource(R.string.favorites_unfiled)) })
            state.folders.forEach { folder ->
                AssistChip({
                    viewModel.showFolder(folder.id)
                    folderName = folder.name
                }, { Text("${folder.name} (${folder.itemCount})") })
                IconButton({ viewModel.deleteFolder(folder) }) {
                    Icon(Icons.Outlined.Delete, stringResource(R.string.favorites_delete))
                }
            }
        }
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilterChip(state.type == null, { viewModel.type(null) }, { Text(stringResource(R.string.favorites_all)) })
            FavoriteType.entries.filter { it != FavoriteType.PLAYER }.forEach {
                FilterChip(state.type == it, { viewModel.type(it) }, { Text(stringResource(it.labelResource())) })
            }
        }
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilterChip(state.region == null, { viewModel.region(null) }, { Text(stringResource(R.string.favorites_all)) })
            Region.entries.forEach { region ->
                FilterChip(state.region == region, { viewModel.region(region) }, { Text(region.id.uppercase()) })
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                folderName, { folderName = it.take(60) }, Modifier.weight(1f),
                label = { Text(stringResource(R.string.favorites_new_folder)) }, singleLine = true
            )
            OutlinedButton(
                {
                    if (editingFolder == null) viewModel.createFolder(folderName)
                    else viewModel.updateFolder(editingFolder, folderName)
                    folderName = ""
                },
                enabled = folderName.isNotBlank() && !state.busy
            ) { Text(stringResource(if (editingFolder == null) R.string.favorites_create else R.string.favorites_rename)) }
        }
        state.message?.let { Text(it, Modifier.padding(12.dp), color = MaterialTheme.colorScheme.error) }
        if (state.selected.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(stringResource(R.string.favorites_selected, state.selected.size), Modifier.padding(top = 10.dp))
                FilterChip(bulkMode == FavoriteBulkMode.ADD, { bulkMode = FavoriteBulkMode.ADD }, { Text(stringResource(R.string.favorites_bulk_add)) })
                FilterChip(bulkMode == FavoriteBulkMode.REMOVE, { bulkMode = FavoriteBulkMode.REMOVE }, { Text(stringResource(R.string.favorites_bulk_remove)) })
                FilterChip(bulkMode == FavoriteBulkMode.REPLACE, { bulkMode = FavoriteBulkMode.REPLACE }, { Text(stringResource(R.string.favorites_bulk_replace)) })
                state.folders.forEach { folder ->
                    AssistChip({ viewModel.organizeSelection(folder, bulkMode) }, { Text(folder.name) })
                }
                TextButton(viewModel::clearSelection) { Text(stringResource(R.string.favorites_clear_selection)) }
            }
        }
        if (state.visible.isEmpty()) {
            Text(stringResource(R.string.favorites_empty), Modifier.padding(24.dp))
        } else {
            LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(vertical = 8.dp)) {
                items(state.visible, key = Favorite::id) { favorite ->
                    ListItem(
                        headlineContent = { Text(favorite.target?.displayName ?: favorite.label ?: favorite.targetId) },
                        supportingContent = {
                            Column {
                                Text(
                                    stringResource(
                                        R.string.favorites_item_meta,
                                        stringResource(favorite.type.labelResource()),
                                        favorite.region.id.uppercase(),
                                        favorite.targetId
                                    )
                                )
                                if (favorite.target?.available == false) Text(
                                    stringResource(R.string.favorites_unavailable),
                                    color = MaterialTheme.colorScheme.error
                                )
                            }
                        },
                        leadingContent = {
                            Checkbox(favorite.id in state.selected, { viewModel.toggleSelected(favorite.id) })
                        },
                        trailingContent = {
                            Row {
                                BackendImage(
                                    favorite.target?.imageCandidates.orEmpty(),
                                    null,
                                    "favorite:${favorite.region.id}:${favorite.type.apiName}:${favorite.targetId}",
                                    Modifier.size(48.dp),
                                    ContentScale.Crop
                                )
                                IconButton({ viewModel.deleteFavorite(favorite) }) {
                                    Icon(Icons.Outlined.Delete, stringResource(R.string.favorites_delete))
                                }
                            }
                        },
                        modifier = Modifier.clickable(enabled = favorite.target?.available != false) { onOpen(favorite) }
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

private fun FavoriteType.labelResource() = when (this) {
    FavoriteType.PLAYER -> R.string.favorite_type_player
    FavoriteType.EVENT -> R.string.favorite_type_event
    FavoriteType.SONG -> R.string.favorite_type_song
    FavoriteType.CARD -> R.string.favorite_type_card
    FavoriteType.GACHA -> R.string.favorite_type_gacha
    FavoriteType.HONOR -> R.string.favorite_type_honor
    FavoriteType.MATERIAL -> R.string.favorite_type_material
    FavoriteType.COSTUME -> R.string.favorite_type_costume
    FavoriteType.STAMP -> R.string.favorite_type_stamp
    FavoriteType.COMIC -> R.string.favorite_type_comic
}
