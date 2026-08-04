package com.pjsktools.app.feature.account

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.pjsktools.app.feature.compliance.ComplianceLinks
import com.pjsktools.app.feature.compliance.PRIVACY_URL
import com.pjsktools.app.feature.compliance.SECURITY_URL
import com.pjsktools.app.feature.compliance.TERMS_URL
import com.pjsktools.app.BuildConfig
import okhttp3.OkHttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun rememberAccountFeatureController(
    baseUrl: String,
    context: Context = LocalContext.current
): AccountFeatureController = remember(baseUrl, context.applicationContext) {
    AccountFeatureController(
        repository = AccountRepository(baseUrl, SharedPreferencesAccountSessionStore(context, baseUrl)),
        harukiGateway = GeneratedHarukiGateway(baseUrl, OkHttpClient()),
        harukiPreviewCache = HarukiPreviewCache(context)
    )
}

/** Drop-in account surface. Its callbacks let the host share the active user/UID with other tools. */
@Composable
fun AccountFeatureScreen(
    baseUrl: String,
    modifier: Modifier = Modifier,
    controller: AccountFeatureController = rememberAccountFeatureController(baseUrl),
    onAuthStateChanged: (AccountSession?) -> Unit = {},
    onBindingSelected: (PlayerBinding?) -> Unit = {}
) {
    val state by controller.state.collectAsState()
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val launch: (suspend () -> Unit) -> Unit = { block -> scope.launch { block() } }
    LaunchedEffect(controller) { controller.initialize() }
    LaunchedEffect(state.profile?.user?.id) {
        if (BuildConfig.HARUKI_FEATURE_ENABLED) controller.loadCachedHarukiPreview()
    }
    LaunchedEffect(state.initialized, state.session?.accessToken) {
        if (state.initialized) onAuthStateChanged(state.session)
    }
    LaunchedEffect(state.selectedBinding?.id) { onBindingSelected(state.selectedBinding) }

    if (!state.initialized) {
        Column(modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center) { Text("正在恢复账号状态…") }
        return
    }
    if (!state.isAuthenticated) {
        AccountEntry(state, controller, modifier, launch, uriHandler::openUri)
        return
    }
    AccountWorkspace(state, controller, modifier, launch, uriHandler::openUri)
    if (state.legalAcceptanceRequired) {
        LegalAcceptanceDialog(state.busy, controller, launch, uriHandler::openUri)
    }
}

@Composable
private fun AccountEntry(
    state: AccountUiState,
    controller: AccountFeatureController,
    modifier: Modifier,
    launch: (suspend () -> Unit) -> Unit,
    openUri: (String) -> Unit
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var privacyAccepted by remember { mutableStateOf(false) }
    var termsAccepted by remember { mutableStateOf(false) }
    var ageConfirmed by remember { mutableStateOf(false) }
    var resendSeconds by remember { mutableStateOf(0L) }
    LaunchedEffect(state.registrationCode) {
        resendSeconds = state.registrationCode?.resendAfterSeconds ?: 0
        while (resendSeconds > 0) {
            delay(1000)
            resendSeconds -= 1
        }
    }
    LazyColumn(modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("PJSK Tools 账号", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
        item { Text("登录后与网页端共享 UID、公开资料和玩家资产。绑定 UID 不代表所有权证明。") }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (state.entryMode == AccountEntryMode.LOGIN) Button(onClick = {}) { Text("登录") }
                else OutlinedButton(onClick = { controller.setEntryMode(AccountEntryMode.LOGIN) }) { Text("登录") }
                if (state.entryMode == AccountEntryMode.REGISTER) Button(onClick = {}) { Text("注册") }
                else OutlinedButton(onClick = { controller.setEntryMode(AccountEntryMode.REGISTER) }) { Text("注册") }
            }
        }
        item { OutlinedTextField(email, { email = it }, modifier = Modifier.fillMaxWidth(), label = { Text("邮箱") }, singleLine = true) }
        item { OutlinedTextField(password, { password = it }, modifier = Modifier.fillMaxWidth(), label = { Text("密码") }, visualTransformation = PasswordVisualTransformation(), singleLine = true) }
        if (state.entryMode == AccountEntryMode.REGISTER) {
            item { OutlinedTextField(confirmPassword, { confirmPassword = it }, modifier = Modifier.fillMaxWidth(), label = { Text("再次输入密码") }, visualTransformation = PasswordVisualTransformation(), singleLine = true) }
            item { Text("密码至少 10 位，并包含大写字母、小写字母、数字和符号；14 位以上至少包含其中三类，且不能包含邮箱名前缀。", style = MaterialTheme.typography.bodySmall) }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6) }, modifier = Modifier.weight(1f), label = { Text("6 位验证码") }, singleLine = true)
                    OutlinedButton(enabled = !state.busy && email.isNotBlank() && resendSeconds == 0L, onClick = { launch { controller.requestRegistrationCode(email) } }) { Text(if (resendSeconds > 0) "${resendSeconds}s 后重发" else "获取验证码") }
                }
            }
            state.registrationCode?.let { result -> item { Text("验证码已发送，${(result.expiresInSeconds ?: 300) / 60} 分钟内有效。") } }
            state.registrationCode?.developmentCode?.let { devCode -> item { Text("开发环境验证码：$devCode") } }
            item {
                LegalCheckbox(
                    checked = privacyAccepted,
                    onCheckedChange = { privacyAccepted = it },
                    label = "我已阅读并同意隐私政策",
                    openDocument = { openUri(PRIVACY_URL) }
                )
            }
            item {
                LegalCheckbox(
                    checked = termsAccepted,
                    onCheckedChange = { termsAccepted = it },
                    label = "我已阅读并同意用户协议",
                    openDocument = { openUri(TERMS_URL) }
                )
            }
            item {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Checkbox(checked = ageConfirmed, onCheckedChange = { ageConfirmed = it })
                    Text("我确认已满 14 周岁")
                }
            }
        }
        item {
            Button(
                enabled = !state.busy && (state.entryMode == AccountEntryMode.LOGIN ||
                    password == confirmPassword && code.length == 6 && privacyAccepted && termsAccepted && ageConfirmed),
                onClick = { launch {
                    if (state.entryMode == AccountEntryMode.LOGIN) controller.login(email, password)
                    else controller.register(email, password, confirmPassword, code, privacyAccepted, termsAccepted, ageConfirmed)
                } },
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (state.busy) "请稍候…" else if (state.entryMode == AccountEntryMode.LOGIN) "登录" else "创建账号") }
        }
        item {
            OutlinedButton(
                enabled = !state.busy,
                onClick = { launch { openUri(controller.startMobileQq().authorizeUrl) } },
                modifier = Modifier.fillMaxWidth()
            ) { Text("使用 QQ 登录") }
        }
        state.message?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
        state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        item { ComplianceLinks(Modifier.fillMaxWidth()) }
    }
}

@Composable
private fun AccountWorkspace(
    state: AccountUiState,
    controller: AccountFeatureController,
    modifier: Modifier,
    launch: (suspend () -> Unit) -> Unit,
    openUri: (String) -> Unit
) {
    val context = LocalContext.current
    var pendingDeleteId by remember { mutableStateOf<String?>(null) }
    var confirmUnlinkQq by remember { mutableStateOf(false) }
    var confirmDeleteAccount by remember { mutableStateOf(false) }
    var pendingExportJson by remember { mutableStateOf<String?>(null) }
    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val payload = pendingExportJson
        if (uri != null && payload != null) {
            runCatching { context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(payload) } }
        }
        pendingExportJson = null
    }
    LaunchedEffect(state.qqDeletionReady) {
        if (state.qqDeletionReady) confirmDeleteAccount = true
    }
    LazyColumn(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(state.profile?.user?.nickname ?: state.profile?.user?.email ?: "已登录", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("UID ${state.profile?.bindings?.size ?: 0} · 收藏 ${state.profile?.favorites?.size ?: 0} · 成绩 ${state.profile?.scores?.size ?: 0} · 卡组 ${state.profile?.deckConfigs?.size ?: 0}")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(enabled = !state.busy, onClick = { launch { controller.reloadProfile() } }) { Text("同步") }
                        OutlinedButton(enabled = !state.busy, onClick = { launch { controller.refreshSession() } }) { Text("刷新登录") }
                        TextButton(enabled = !state.busy, onClick = { launch { controller.logout() } }) { Text("退出") }
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("隐私与账号权利", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("可导出服务器保存的个人数据、清除本机缓存，或永久注销账号。")
                    OutlinedButton(enabled = !state.busy, onClick = {
                        launch {
                            pendingExportJson = controller.exportPersonalData()
                            exportLauncher.launch("sekai-tools-personal-data.json")
                        }
                    }) { Text("导出个人数据 JSON") }
                    OutlinedButton(enabled = !state.busy, onClick = {
                        launch {
                            controller.clearPrivateCache()
                            withContext(Dispatchers.IO) {
                                context.cacheDir.listFiles()?.forEach { it.deleteRecursively() }
                            }
                        }
                    }) { Text("清除本地缓存") }
                    TextButton(enabled = !state.busy, onClick = { confirmDeleteAccount = true }) {
                        Text("注销账号", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
        item {
            val qq = state.profile?.oauthAccounts?.firstOrNull { it.provider == "qq" }
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("QQ 账号", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(qq?.nickname?.let { "已关联：$it" } ?: if (qq != null) "已关联" else "尚未关联")
                    if (qq == null) {
                        OutlinedButton(enabled = !state.busy, onClick = {
                            launch { openUri(controller.startMobileQq().authorizeUrl) }
                        }) { Text("关联当前账号") }
                    } else {
                        TextButton(enabled = !state.busy, onClick = { confirmUnlinkQq = true }) {
                            Text("解除关联", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
        item { Text("玩家账号", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        if (state.profile?.bindings.isNullOrEmpty()) item { Text("暂无玩家 UID 绑定。") }
        items(state.profile?.bindings.orEmpty(), key = { it.id }) { binding ->
            BindingCard(binding, state.profile?.summaryFor(binding.id), binding.id == state.selectedBinding?.id,
                state.busy, { launch { controller.selectBinding(binding.id) } },
                { launch { controller.setDefault(binding.id) } },
                { pendingDeleteId = binding.id })
        }
        item { AccountDataPanels(state, controller, launch) }
        state.message?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
        state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        item { ComplianceLinks(Modifier.fillMaxWidth()) }
    }
    pendingDeleteId?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingDeleteId = null },
            title = { Text("删除 UID 绑定？") },
            text = { Text("该操作会同时删除此 UID 关联的持有卡、玩家资产和卡组配置，且无法撤销。") },
            confirmButton = { TextButton(onClick = { pendingDeleteId = null; launch { controller.deleteBinding(id) } }) { Text("确认删除", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { pendingDeleteId = null }) { Text("取消") } }
        )
    }
    if (confirmUnlinkQq) {
        AlertDialog(
            onDismissRequest = { confirmUnlinkQq = false },
            title = { Text("解除 QQ 关联？") },
            text = { Text("解除后将无法继续使用该 QQ 登录；若它是唯一登录方式，服务器会拒绝操作。") },
            confirmButton = { TextButton(onClick = { confirmUnlinkQq = false; launch { controller.unlinkQq() } }) { Text("确认解除") } },
            dismissButton = { TextButton(onClick = { confirmUnlinkQq = false }) { Text("取消") } }
        )
    }
    if (confirmDeleteAccount) {
        AccountDeletionDialog(
            hasEmail = !state.profile?.user?.email.isNullOrBlank(),
            state = state,
            busy = state.busy,
            onDismiss = { confirmDeleteAccount = false },
            requestCode = { launch { controller.requestAccountDeletionCode() } },
            confirmEmailDeletion = { code, confirmation ->
                launch {
                    controller.deleteEmailAccount(code, confirmation)
                    if (!controller.state.value.isAuthenticated) confirmDeleteAccount = false
                }
            },
            startQqDeletion = { launch { openUri(controller.startQqAccountDeletion()) } },
            confirmQqDeletion = { confirmation ->
                launch {
                    controller.confirmQqAccountDeletion(confirmation)
                    if (!controller.state.value.isAuthenticated) confirmDeleteAccount = false
                }
            }
        )
    }
}

@Composable
private fun LegalCheckbox(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    label: String,
    openDocument: () -> Unit
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(label, modifier = Modifier.weight(1f))
        TextButton(onClick = openDocument) { Text("查看") }
    }
}

@Composable
private fun LegalAcceptanceDialog(
    busy: Boolean,
    controller: AccountFeatureController,
    launch: (suspend () -> Unit) -> Unit,
    openUri: (String) -> Unit
) {
    var privacyAccepted by remember { mutableStateOf(false) }
    var termsAccepted by remember { mutableStateOf(false) }
    var ageConfirmed by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = {},
        title = { Text("请确认最新协议") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("继续使用账号服务前，请逐项阅读并主动确认。选项不会预先勾选。")
                LegalCheckbox(privacyAccepted, { privacyAccepted = it }, "同意隐私政策") { openUri(PRIVACY_URL) }
                LegalCheckbox(termsAccepted, { termsAccepted = it }, "同意用户协议") { openUri(TERMS_URL) }
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Checkbox(ageConfirmed, { ageConfirmed = it })
                    Text("我确认已满 14 周岁")
                }
                TextButton(onClick = { openUri(SECURITY_URL) }) { Text("安全与举报渠道") }
            }
        },
        confirmButton = {
            Button(
                enabled = !busy && privacyAccepted && termsAccepted && ageConfirmed,
                onClick = { launch { controller.acceptCurrentLegal(privacyAccepted, termsAccepted, ageConfirmed) } }
            ) { Text("确认并继续") }
        },
        dismissButton = {
            TextButton(enabled = !busy, onClick = { launch { controller.logout() } }) { Text("退出登录") }
        }
    )
}

@Composable
private fun AccountDeletionDialog(
    hasEmail: Boolean,
    state: AccountUiState,
    busy: Boolean,
    onDismiss: () -> Unit,
    requestCode: () -> Unit,
    confirmEmailDeletion: (String, String) -> Unit,
    startQqDeletion: () -> Unit,
    confirmQqDeletion: (String) -> Unit
) {
    var code by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("永久注销账号？") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("注销将删除账号、会话、绑定、收藏、成绩、卡组和玩家快照，且无法撤销。")
                if (hasEmail) {
                    OutlinedButton(enabled = !busy, onClick = requestCode) { Text("发送邮箱注销验证码") }
                    state.deletionCode?.let { Text("验证码已发送，${(it.expiresInSeconds ?: 300) / 60} 分钟内有效。") }
                    OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6) }, label = { Text("6 位验证码") }, singleLine = true)
                    OutlinedTextField(confirmation, { confirmation = it }, label = { Text("输入 DELETE 确认") }, singleLine = true)
                } else {
                    if (state.qqDeletionReady) {
                        Text("QQ 身份已重新验证。请输入 DELETE 并再次确认，才会永久注销账号。")
                        OutlinedTextField(confirmation, { confirmation = it }, label = { Text("输入 DELETE 确认") }, singleLine = true)
                    } else {
                        Text("纯 QQ 账号必须重新完成 QQ 授权，验证结果仅用于本次注销且 2 分钟内有效。")
                        OutlinedButton(enabled = !busy, onClick = startQqDeletion) { Text("使用 QQ 重新验证") }
                    }
                }
            }
        },
        confirmButton = {
            if (hasEmail) {
                TextButton(
                    enabled = !busy && code.length == 6 && confirmation == "DELETE",
                    onClick = { confirmEmailDeletion(code, confirmation) }
                ) { Text("永久注销", color = MaterialTheme.colorScheme.error) }
            } else {
                TextButton(
                    enabled = !busy && state.qqDeletionReady && confirmation == "DELETE",
                    onClick = { confirmQqDeletion(confirmation) }
                ) { Text("永久注销", color = MaterialTheme.colorScheme.error) }
            }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text("取消") } }
    )
}

@Composable
private fun BindingCard(binding: PlayerBinding, summary: BindingSummary?, selected: Boolean, busy: Boolean,
    select: () -> Unit, makeDefault: () -> Unit, delete: () -> Unit) {
    Card(onClick = select, modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(binding.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text("${binding.region.uppercase()} · ${binding.playerUid}${if (binding.isDefault) " · 默认" else ""}")
        binding.publicProfile?.let { Text("Rank ${it.rank ?: "-"}${it.comment?.let { comment -> " · $comment" } ?: ""}") }
        Text("库存 ${summary?.inventoryCount ?: 0} · 已上传 ${summary?.uploadedPlayerDataKinds?.size ?: 0} 类资产")
        Text("玩家资料刷新：${binding.refreshedAt ?: "尚未刷新"}", style = MaterialTheme.typography.bodySmall)
        if (selected) { HorizontalDivider(); Text("当前使用", color = MaterialTheme.colorScheme.primary) }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(enabled = !busy && !binding.isDefault, onClick = makeDefault) { Text("设为默认") }
            TextButton(enabled = !busy, onClick = delete) { Text("删除", color = MaterialTheme.colorScheme.error) }
        }
    } }
}
