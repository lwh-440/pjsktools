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
import androidx.compose.material3.Checkbox
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
import com.pjsktools.core.model.RegistrationConsent
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.delay
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
    val resendSeconds = MutableStateFlow(0)

    fun login(email: String, password: String) = submit { repository.login(email.trim(), password) }
    fun register(
        email: String,
        password: String,
        confirmPassword: String,
        code: String,
        privacyAccepted: Boolean,
        termsAccepted: Boolean,
        ageConfirmed: Boolean
    ) {
        if (password != confirmPassword) {
            message.value = "PASSWORD_MISMATCH"
            return
        }
        val consent = RegistrationConsent(privacyAccepted, termsAccepted, ageConfirmed)
        if (!consent.isComplete) {
            message.value = "LEGAL_CONFIRMATION_REQUIRED"
            return
        }
        submit { repository.register(email.trim(), password, code.trim(), consent) }
    }

    fun sendCode(email: String) = submit {
        repository.sendRegistrationCode(email.trim()).onSuccess { delivery ->
            message.value = delivery.developmentCode?.let { "DEV:$it:${delivery.expiresInSeconds}" } ?: "SENT:${delivery.expiresInSeconds}"
            resendSeconds.value = delivery.resendAfterSeconds
            while (resendSeconds.value > 0) {
                delay(1000)
                resendSeconds.value -= 1
            }
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
    val resendSeconds by viewModel.resendSeconds.collectAsState()
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
            AccountForm(busy, message, resendSeconds, viewModel)
        }
    }
}

@Composable
private fun AccountForm(busy: Boolean, message: String?, resendSeconds: Int, viewModel: AccountViewModel) {
    var register by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var privacyAccepted by remember { mutableStateOf(false) }
    var termsAccepted by remember { mutableStateOf(false) }
    var ageConfirmed by remember { mutableStateOf(false) }
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
            OutlinedTextField(
                confirmPassword, { confirmPassword = it }, Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.account_confirm_password)) },
                visualTransformation = PasswordVisualTransformation(), singleLine = true
            )
            Text(stringResource(R.string.account_password_rules), style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    code, { code = it.take(6) }, Modifier.weight(1f),
                    label = { Text(stringResource(R.string.account_code)) }, singleLine = true
                )
                OutlinedButton(
                    { viewModel.sendCode(email) },
                    enabled = !busy && email.contains("@") && resendSeconds == 0
                ) { Text(if (resendSeconds > 0) stringResource(R.string.account_resend_countdown, resendSeconds) else stringResource(R.string.account_send_code)) }
            }
            LegalConfirmationRow(
                checked = privacyAccepted,
                onCheckedChange = { privacyAccepted = it },
                label = stringResource(R.string.account_accept_privacy)
            )
            LegalConfirmationRow(
                checked = termsAccepted,
                onCheckedChange = { termsAccepted = it },
                label = stringResource(R.string.account_accept_terms)
            )
            LegalConfirmationRow(
                checked = ageConfirmed,
                onCheckedChange = { ageConfirmed = it },
                label = stringResource(R.string.account_confirm_age)
            )
        }
        message?.let {
            Text(
                if (it.startsWith("DEV:")) stringResource(R.string.account_dev_code, it.removePrefix("DEV:").substringBefore(':'))
                else if (it.startsWith("SENT:")) stringResource(R.string.account_code_sent, it.substringAfter(':').toInt() / 60)
                else if (it == "PASSWORD_MISMATCH") stringResource(R.string.account_password_mismatch)
                else if (it == "LEGAL_CONFIRMATION_REQUIRED") stringResource(R.string.account_legal_confirmation_required)
                else it,
                color = if (it.startsWith("SENT:") || it.startsWith("DEV:")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
            )
        }
        Button(
            {
                if (register) viewModel.register(
                    email,
                    password,
                    confirmPassword,
                    code,
                    privacyAccepted,
                    termsAccepted,
                    ageConfirmed
                )
                else viewModel.login(email, password)
            },
            Modifier.fillMaxWidth(),
            enabled = !busy &&
                email.contains("@") &&
                password.length >= (if (register) 10 else 8) &&
                (!register || code.length == 6 && password == confirmPassword &&
                    privacyAccepted && termsAccepted && ageConfirmed)
        ) {
            if (busy) CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp)
            else Text(stringResource(if (register) R.string.account_submit_register else R.string.account_submit_login))
        }
    }
}

@Composable
private fun LegalConfirmationRow(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    label: String
) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(label, style = MaterialTheme.typography.bodySmall)
    }
}
