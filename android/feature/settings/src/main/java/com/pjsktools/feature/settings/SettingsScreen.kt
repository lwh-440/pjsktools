@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.pjsktools.feature.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pjsktools.core.designsystem.SectionTitle
import com.pjsktools.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date
import javax.inject.Inject

data class SettingsUiState(val region:Region=Region.JP,val theme:ThemeMode=ThemeMode.SYSTEM,val cache:List<CacheInfo> = emptyList())
@HiltViewModel class SettingsViewModel @Inject constructor(private val preferences:RegionPreferencesRepository,private val cacheRepository:CacheManagementRepository,val environment:ApiEnvironment):ViewModel(){val state=combine(preferences.selectedRegion.filterNotNull(),preferences.themeMode){r,t->r to t}.flatMapLatest{(r,t)->cacheRepository.observeCacheInfo(r).map{SettingsUiState(r,t,it)}}.stateIn(viewModelScope,SharingStarted.WhileSubscribed(5_000),SettingsUiState());fun region(value:Region)=viewModelScope.launch{preferences.selectRegion(value)};fun theme(value:ThemeMode)=viewModelScope.launch{preferences.setTheme(value)};fun clear()=viewModelScope.launch{cacheRepository.clearPublicCache(state.value.region)}}
@Composable fun SettingsScreen(viewModel:SettingsViewModel=hiltViewModel()){val state by viewModel.state.collectAsState();var regionMenu by remember{mutableStateOf(false)};var themeMenu by remember{mutableStateOf(false)};Scaffold(topBar={TopAppBar(title={Text(stringResource(R.string.settings_title))})}){padding->LazyColumn(Modifier.fillMaxSize().padding(padding),contentPadding=PaddingValues(16.dp)){item{SectionTitle(stringResource(R.string.settings_region));Box{ListItem(headlineContent={Text(state.region.displayName)},supportingContent={Text(state.region.id)},modifier=Modifier.clickable{regionMenu=true});DropdownMenu(regionMenu,{regionMenu=false}){Region.entries.forEach{r->DropdownMenuItem({Text(r.displayName)},{viewModel.region(r);regionMenu=false})}}};HorizontalDivider();SectionTitle(stringResource(R.string.settings_theme));Box{ListItem(headlineContent={Text(when(state.theme){ThemeMode.SYSTEM->stringResource(R.string.settings_system);ThemeMode.LIGHT->stringResource(R.string.settings_light);ThemeMode.DARK->stringResource(R.string.settings_dark)})},modifier=Modifier.clickable{themeMenu=true});DropdownMenu(themeMenu,{themeMenu=false}){listOf(ThemeMode.SYSTEM to R.string.settings_system,ThemeMode.LIGHT to R.string.settings_light,ThemeMode.DARK to R.string.settings_dark).forEach{(mode,label)->DropdownMenuItem({Text(stringResource(label))},{viewModel.theme(mode);themeMenu=false})}}};HorizontalDivider();SectionTitle(stringResource(R.string.settings_cache))};items(state.cache,key={it.key}){entry->ListItem(headlineContent={Text(entry.key)},supportingContent={Text(DateFormat.getDateTimeInstance().format(Date(entry.updatedAtMillis)))},trailingContent={Text(entry.itemCount.toString())})};item{OutlinedButton(viewModel::clear,Modifier.fillMaxWidth()){Text(stringResource(R.string.settings_clear_cache))};HorizontalDivider(Modifier.padding(top=16.dp));SectionTitle(stringResource(R.string.settings_environment));ListItem(headlineContent={Text(viewModel.environment.buildType)},supportingContent={Text(viewModel.environment.apiBaseUrl)})}}}}
