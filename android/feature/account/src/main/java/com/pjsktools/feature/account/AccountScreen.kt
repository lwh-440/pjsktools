@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.pjsktools.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pjsktools.core.model.AuthRepository
import com.pjsktools.core.model.AuthState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AccountViewModel @Inject constructor(
    private val repository: AuthRepository
) : ViewModel() {
    val auth: StateFlow<AuthState> = repository.state.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        AuthState.Loading
    )
    val busy = MutableStateFlow(false)
    val message = MutableStateFlow<String?>(null)

    fun login(email: String, password: String) = submit { repository.login(email.trim(), password) }
    fun register(email: String, password: String, code: String) =
        submit { repository.register(email.trim(), password, code.trim()) }

    fun sendCode(email: String) = submit {
        repository.sendRegistrationCode(email.trim()).onSuccess { devCode ->
            message.value = devCode?.let { "DEV:$it" } ?: "SENT"
        }
    }

    fun logout() = viewModelScope.launch {
        busy.value = true
        repository.logout()
        busy.value = false
    }

    private fun submit(action: suspend () -> Result<*>) = viewModelScope.launch {
        busy.value = true
        message.value = null
        action().onFailure { message.value = it.message ?: "操作失败" }
        busy.value = false
    }
}

@Composable
fun AccountScreen(
    onBack: () -> Unit,
    onSignedIn: () -> Unit = onBack,
    viewModel: AccountViewModel = hiltViewModel()
) {
    val auth by viewModel.auth.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val message by viewModel.message.collectAsState()
    LaunchedEffect(auth) {
        if (auth is AuthState.SignedIn) onSignedIn()
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.account_title)) },
                navigationIcon = {
                    IconButton(onBack) {
                        Icon(Icons.Outlined.ArrowBack, stringResource(R.string.account_back))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            val signedIn = auth as? AuthState.SignedIn
            if (signedIn != null) {
                Text(
                    stringResource(
                        R.string.account_signed_in,
                        signedIn.session.user.email ?: signedIn.session.user.nickname ?: signedIn.session.user.id
                    ),
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(Modifier.height(20.dp))
                OutlinedButton(viewModel::logout, enabled = !busy) {
                    Text(stringResource(R.string.account_logout))
                }
                return@Column
            }
            AccountForm(busy, message, viewModel)
        }
    }
}

@Composable
private fun AccountForm(busy: Boolean, message: String?, viewModel: AccountViewModel) {
    var register by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxWidth().widthIn(max = 520.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        TabRow(if (register) 1 else 0) {
            Tab(!register, { register = false }, text = { Text(stringResource(R.string.account_login)) })
            Tab(register, { register = true }, text = { Text(stringResource(R.string.account_register)) })
        }
        OutlinedTextField(
            email, { email = it }, Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.account_email)) }, singleLine = true
        )
        OutlinedTextField(
            password, { password = it }, Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.account_password)) },
            visualTransformation = PasswordVisualTransformation(), singleLine = true
        )
        if (register) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    code, { code = it.take(6) }, Modifier.weight(1f),
                    label = { Text(stringResource(R.string.account_code)) }, singleLine = true
                )
                OutlinedButton(
                    { viewModel.sendCode(email) },
                    enabled = !busy && email.contains("@")
                ) { Text(stringResource(R.string.account_send_code)) }
            }
        }
        message?.let {
            Text(
                if (it.startsWith("DEV:")) stringResource(R.string.account_dev_code, it.removePrefix("DEV:"))
                else if (it == "SENT") stringResource(R.string.account_code_sent) else it,
                color = if (it == "SENT" || it.startsWith("DEV:")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
            )
        }
        Button(
            {
                if (register) viewModel.register(email, password, code)
                else viewModel.login(email, password)
            },
            Modifier.fillMaxWidth(),
            enabled = !busy &&
                email.contains("@") &&
                password.length >= (if (register) 10 else 8) &&
                (!register || code.length == 6)
        ) {
            if (busy) CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp)
            else Text(stringResource(if (register) R.string.account_submit_register else R.string.account_submit_login))
        }
    }
}
