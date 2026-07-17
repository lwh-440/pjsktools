@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.pjsktools.feature.player

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pjsktools.core.designsystem.ResultContent
import com.pjsktools.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import javax.inject.Inject

@HiltViewModel class PlayerViewModel @Inject constructor(private val repository: PlayerRepository, preferences: RegionPreferencesRepository, private val savedState: SavedStateHandle) : ViewModel() {
    private val region=preferences.selectedRegion.filterNotNull().stateIn(viewModelScope,SharingStarted.Eagerly,Region.JP); val input=MutableStateFlow(savedState["player_uid"]?:"");private val query=MutableStateFlow<Pair<String,Boolean>?>(null)
    val state=query.filterNotNull().combine(region){value,r->Triple(r,value.first,value.second)}.flatMapLatest{(r,uid,refresh)->repository.observe(r,uid,refresh)}.stateIn(viewModelScope,SharingStarted.WhileSubscribed(5_000),DataResult(phase=ContentPhase.EMPTY,message="输入 UID 后查询"))
    fun input(value:String){input.value=value.filter(Char::isDigit).take(20);savedState["player_uid"]=input.value};fun submit(refresh:Boolean=false){if(input.value.length in 10..20)query.value=input.value to refresh}
}
@Composable fun PlayerScreen(viewModel:PlayerViewModel=hiltViewModel()){val uid by viewModel.input.collectAsState();val state by viewModel.state.collectAsState();val valid=uid.length in 10..20;Scaffold(topBar={TopAppBar(title={Text(stringResource(R.string.player_title))})}){padding->Column(Modifier.fillMaxSize().padding(padding).padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){OutlinedTextField(uid,viewModel::input,Modifier.fillMaxWidth(),label={Text(stringResource(R.string.player_uid))},singleLine=true,isError=uid.isNotEmpty()&&!valid,supportingText={Text(if(uid.isNotEmpty()&&!valid)stringResource(R.string.player_uid_error) else stringResource(R.string.player_hint))},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number));Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){Button({viewModel.submit()},enabled=valid){Text(stringResource(R.string.player_query))};OutlinedButton({viewModel.submit(true)},enabled=valid){Icon(Icons.Outlined.Refresh,null);Spacer(Modifier.width(6.dp));Text(stringResource(R.string.player_refresh))}};ResultContent(state,Modifier.weight(1f)){profile->ElevatedCard(Modifier.fillMaxWidth()){Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){Text(profile.nickname,style=MaterialTheme.typography.headlineSmall);Text("Rank ${profile.rank}");Text("UID ${profile.userId}");profile.comment?.let{Text(it)};if(profile.titles.isNotEmpty())Text(profile.titles.joinToString(" · "));profile.updatedAt?.let{Text("更新时间 $it",color=MaterialTheme.colorScheme.onSurfaceVariant)}}}}}}}
