package com.pjsktools.feature.onboarding

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pjsktools.core.model.Region
import com.pjsktools.core.model.RegionPreferencesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel class OnboardingViewModel @Inject constructor(private val preferences: RegionPreferencesRepository) : ViewModel() {
    fun confirm(region: Region, done: () -> Unit) = viewModelScope.launch { preferences.selectRegion(region); done() }
}

@Composable fun OnboardingScreen(onDone: () -> Unit, viewModel: OnboardingViewModel = hiltViewModel()) {
    var selected by rememberSaveable { mutableStateOf<Region?>(null) }
    Column(Modifier.fillMaxSize().padding(28.dp), verticalArrangement = Arrangement.Center) {
        Text(stringResource(R.string.onboarding_title), style = MaterialTheme.typography.headlineMedium)
        Text(stringResource(R.string.onboarding_message), modifier = Modifier.padding(top = 12.dp, bottom = 20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(Modifier.selectableGroup()) { Region.entries.forEach { region ->
            Row(Modifier.fillMaxWidth().selectable(selected == region, onClick = { selected = region }, role = Role.RadioButton).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected == region, onClick = null); Text(region.displayName, Modifier.padding(start = 12.dp), style = MaterialTheme.typography.titleMedium)
            }
        } }
        Button(onClick = { selected?.let { viewModel.confirm(it, onDone) } }, enabled = selected != null, modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) { Text(stringResource(R.string.onboarding_confirm)) }
    }
}
