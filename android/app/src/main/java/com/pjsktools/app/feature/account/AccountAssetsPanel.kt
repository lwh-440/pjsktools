package com.pjsktools.app.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun AccountAssetsPanel(state: AccountUiState, controller: AccountFeatureController, launch: (suspend () -> Unit) -> Unit) {
    val clipboard = LocalClipboardManager.current
    var editor by remember(state.assets.kind, state.assets.editorJson) { mutableStateOf(state.assets.editorJson) }
    var cards by remember(state.assets.cardsJson) { mutableStateOf(state.assets.cardsJson) }
    var cardId by remember { mutableStateOf("") }
    var importPayload by remember(state.assets.importPayload) { mutableStateOf(state.assets.importPayload) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("玩家资产工作台", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text("数据直接与网页端共用；保存前可调用同一后端校验器。", style = MaterialTheme.typography.bodySmall)
            Text("持有卡", fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(enabled = !state.busy, onClick = { launch { controller.loadCards() } }) { Text("读取") }
                Button(enabled = !state.busy, onClick = { launch { controller.saveCards(cards) } }) { Text("保存") }
            }
            OutlinedTextField(cards, { cards = it }, Modifier.fillMaxWidth(), label = { Text("持有卡 JSON 数组") }, minLines = 3, maxLines = 8)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(cardId, { cardId = it }, Modifier.weight(1f), label = { Text("删除单卡 ID") })
                OutlinedButton(enabled = !state.busy && cardId.isNotBlank(), onClick = { launch { controller.deleteCard(cardId); cardId = "" } }) { Text("删除") }
            }
            Text("结构化玩家数据（11 类）", fontWeight = FontWeight.Bold)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(PlayerDataKinds) { kind ->
                    if (kind == state.assets.kind) Button(onClick = {}) { Text(kind) }
                    else OutlinedButton(enabled = !state.busy, onClick = { launch { controller.loadPlayerData(kind) } }) { Text(kind) }
                }
            }
            OutlinedTextField(editor, { editor = it }, Modifier.fillMaxWidth(), label = { Text("${state.assets.kind} JSON") }, minLines = 4, maxLines = 10)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(enabled = !state.busy, onClick = { launch { controller.validatePlayerData(editor) } }) { Text("校验") }
                Button(enabled = !state.busy, onClick = { launch { controller.savePlayerData(editor) } }) { Text("保存") }
            }
            state.assets.validationJson?.let { Text(it.take(1200), style = MaterialTheme.typography.bodySmall) }
            Text("整包导入 / 导出", fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(enabled = !state.busy, onClick = { launch { controller.exportPlayerData() } }) { Text("导出") }
                OutlinedButton(enabled = !state.busy, onClick = { launch { controller.reviewImport(importPayload) } }) { Text("预览导入") }
                Button(enabled = !state.busy && state.assets.importReviewJson != null, onClick = { launch { controller.confirmImport() } }) { Text("确认导入") }
            }
            OutlinedTextField(importPayload, { importPayload = it }, Modifier.fillMaxWidth(), label = { Text("导入 JSON") }, minLines = 4, maxLines = 10)
            state.assets.importReviewJson?.let { Text("导入复核：${it.take(1600)}", style = MaterialTheme.typography.bodySmall) }
            state.assets.completenessJson?.let { Text("完整度：${it.take(1600)}", style = MaterialTheme.typography.bodySmall) }
            state.assets.exportJson?.let { export ->
                OutlinedButton(onClick = { clipboard.setText(AnnotatedString(export)) }) { Text("复制完整导出 JSON") }
                Text("导出结果：${export.take(1600)}", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
