package com.pjsktools.app.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private const val HARUKI_OFFICIAL_URL = "https://haruki.seiunx.com/"

@Composable
fun HarukiConnectionPanel(
    state: AccountUiState,
    controller: AccountFeatureController,
    launch: (suspend () -> Unit) -> Unit
) {
    val haruki = state.haruki
    val uriHandler = LocalUriHandler.current
    Panel("Haruki 玩家数据") {
        Text("通过 pjsktools 连接并同步你自己的 Haruki 快照。应用不会直接连接 Haruki。", style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = { uriHandler.openUri(HARUKI_OFFICIAL_URL) }) { Text("打开 Haruki 官网") }

        Text("公开资料预览", fontWeight = FontWeight.Bold)
        RegionPicker(haruki.previewRegion) { controller.editHarukiPreview(region = it) }
        OutlinedTextField(
            value = haruki.previewUid,
            onValueChange = { controller.editHarukiPreview(playerUid = it.trim().take(32)) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("玩家 UID") },
            singleLine = true
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(enabled = !state.busy && haruki.previewUid.isNotBlank(), onClick = { launch { controller.previewHaruki() } }) { Text("预览") }
            OutlinedButton(enabled = !state.busy, onClick = { launch { controller.loadHarukiConnection() } }) { Text("刷新连接") }
            TextButton(enabled = !state.busy && haruki.previewUid.isNotBlank(), onClick = { launch { controller.clearHarukiPreviewCache() } }) { Text("清除本地缓存") }
        }
        haruki.preview?.let { preview ->
            Text("${preview.nickname ?: preview.playerUid} · ${preview.region.uppercase()} · 等级 ${preview.rank ?: "-"}")
            Text("仅缓存于此设备、当前 pjsktools 账号${preview.updatedAt?.let { "；更新于 $it" }.orEmpty()}", style = MaterialTheme.typography.bodySmall)
        }

        val connection = haruki.connection
        if (connection == null) {
            Button(enabled = !state.busy, onClick = { launch { uriHandler.openUri(controller.startHarukiOAuth().authorizationUrl) } }) { Text("连接 Haruki") }
            Text("授权将在系统浏览器中完成；pjsktools 完成安全交接后将返回应用。", style = MaterialTheme.typography.bodySmall)
        } else {
            Text("连接状态：${connection.status}", fontWeight = FontWeight.Bold)
            connection.connectedAt?.let { Text("连接时间：$it", style = MaterialTheme.typography.bodySmall) }
            connection.lastSyncedAt?.let { Text("最近同步：$it", style = MaterialTheme.typography.bodySmall) }
            if (connection.availableBindings.isEmpty() && connection.bindings.isEmpty()) Text("暂时没有可导入的 Haruki 绑定。")
            connection.availableBindings.forEach { binding -> HarukiAvailableBindingRow(state, controller, binding) }
            connection.bindings.forEach { binding -> HarukiBindingRow(state, controller, launch, binding) }
            if (haruki.selectedSourceBindingIds.isNotEmpty()) {
                Button(enabled = !state.busy, onClick = { launch { controller.importHarukiBindings() } }) {
                    Text("导入已选项（${haruki.selectedSourceBindingIds.size}）")
                }
            }
            haruki.pendingReview?.let { review ->
                Text("同步复核：${review.summary}", style = MaterialTheme.typography.bodySmall)
                review.groups.forEach { group ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(group.label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        Text(if (group.action == "keep") "保留" else "更新", style = MaterialTheme.typography.bodySmall)
                        Switch(checked = group.action != "keep", enabled = !state.busy, onCheckedChange = { controller.setHarukiReviewGroup(group.id, if (it) "update" else "keep") })
                    }
                }
                review.cardAction?.let { action ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("卡牌", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        Text(if (action == "keep") "保留" else "更新", style = MaterialTheme.typography.bodySmall)
                        Switch(checked = action != "keep", enabled = !state.busy, onCheckedChange = { controller.setHarukiReviewCards(if (it) "update" else "keep") })
                    }
                }
                Button(enabled = !state.busy, onClick = { launch { controller.confirmHarukiSync() } }) { Text("确认同步") }
            }
            TextButton(enabled = !state.busy, onClick = { launch { controller.disconnectHaruki() } }) {
                Text("断开 Haruki", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun RegionPicker(selected: String, select: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        listOf("jp", "en", "tw", "kr", "cn").forEach { region ->
            if (region == selected) Button(onClick = {}) { Text(region.uppercase()) }
            else OutlinedButton(onClick = { select(region) }) { Text(region.uppercase()) }
        }
    }
}

@Composable
private fun HarukiAvailableBindingRow(
    state: AccountUiState,
    controller: AccountFeatureController,
    binding: HarukiAvailableSourceBinding
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Checkbox(
            checked = binding.id in state.haruki.selectedSourceBindingIds,
            onCheckedChange = { controller.toggleHarukiImport(binding.id) },
            enabled = !state.busy
        )
        Column {
            Text(binding.displayName ?: binding.playerUid, fontWeight = FontWeight.Bold)
            Text("${binding.region.uppercase()} · ${binding.playerUid} · 可导入", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun HarukiBindingRow(
    state: AccountUiState,
    controller: AccountFeatureController,
    launch: (suspend () -> Unit) -> Unit,
    binding: HarukiSourceBinding
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Column {
            Text(binding.displayName ?: binding.playerUid, fontWeight = FontWeight.Bold)
            Text("${binding.region.uppercase()} · ${binding.playerUid}${if (binding.isDefault) " · 默认" else ""}${binding.status?.let { " · $it" }.orEmpty()}")
            binding.snapshotAt?.let { Text("快照时间：$it", style = MaterialTheme.typography.bodySmall) }
            binding.lastSyncedAt?.let { Text("最近同步：$it", style = MaterialTheme.typography.bodySmall) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("每日同步")
            Switch(checked = binding.dailySync, onCheckedChange = { launch { controller.setHarukiDailySync(binding.id, it) } }, enabled = !state.busy)
            OutlinedButton(enabled = !state.busy, onClick = { launch { controller.reviewHarukiSync(binding.id) } }) { Text("复核同步") }
            OutlinedButton(enabled = !state.busy, onClick = { launch { controller.syncHaruki(binding.id) } }) { Text("立即同步") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!binding.isDefault) TextButton(enabled = !state.busy, onClick = { launch { controller.setHarukiDefault(binding.id) } }) { Text("设为默认") }
            TextButton(enabled = !state.busy, onClick = { launch { controller.deleteHarukiBinding(binding.id) } }) { Text("删除", color = MaterialTheme.colorScheme.error) }
        }
    }
}
