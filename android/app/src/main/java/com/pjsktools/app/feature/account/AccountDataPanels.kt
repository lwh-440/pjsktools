package com.pjsktools.app.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** Profile, tool-context and cross-platform account records associated with the selected UID. */
@Composable
fun AccountDataPanels(
    state: AccountUiState,
    controller: AccountFeatureController,
    launch: (suspend () -> Unit) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        HarukiConnectionPanel(state, controller, launch)
        state.profileAnalysis?.let { analysis ->
            Panel("玩家档案") {
                Text(analysis.nickname ?: state.selectedBinding?.title ?: "-")
                Text("Rank ${analysis.rank ?: "-"}")
                analysis.comment?.let { Text(it) }
            }
        }
        state.toolContext?.let { context ->
            Panel("资产完整度") {
                Text("持有卡 ${context.inventoryCount} · 玩家数据 ${context.playerDataKinds.size} 类")
                if (context.warnings.isEmpty()) Text("当前工具上下文无缺失警告", color = MaterialTheme.colorScheme.primary)
                else context.warnings.take(8).forEach { Text("• $it", color = MaterialTheme.colorScheme.error) }
            }
        }
        DeckRecommendPanel(state, controller, launch)
        FavoritesPanel(state, controller, launch)
        ScoresPanel(state, controller, launch)
        DeckConfigsPanel(state, controller, launch)
    }
}

@Composable private fun DeckRecommendPanel(state: AccountUiState, controller: AccountFeatureController, launch: (suspend () -> Unit) -> Unit) {
    var eventId by remember { mutableStateOf("") }
    Panel("绑定资产组卡") {
        OutlinedTextField(eventId, { eventId = it }, Modifier.fillMaxWidth(), label = { Text("活动 ID（可选）") })
        Button(enabled = !state.busy && state.selectedBinding != null, onClick = { launch { controller.recommendDeck(eventId) } }) { Text("使用当前 UID 推荐") }
        state.deckRecommendation?.let { Text(it.rawJson.take(800), style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable private fun FavoritesPanel(state: AccountUiState, controller: AccountFeatureController, launch: (suspend () -> Unit) -> Unit) {
    var type by remember { mutableStateOf("song") }; var region by remember { mutableStateOf(state.selectedBinding?.region ?: "jp") }
    var target by remember { mutableStateOf("") }; var label by remember { mutableStateOf("") }
    Panel("收藏") {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(type, { type = it }, Modifier.weight(1f), label = { Text("类型") })
            OutlinedTextField(region, { region = it }, Modifier.weight(1f), label = { Text("区服") })
        }
        OutlinedTextField(target, { target = it }, Modifier.fillMaxWidth(), label = { Text("目标 ID") })
        OutlinedTextField(label, { label = it }, Modifier.fillMaxWidth(), label = { Text("名称") })
        Button(enabled = !state.busy && target.isNotBlank() && label.isNotBlank(), onClick = {
            launch { controller.addFavorite(FavoriteInput(type, region, target, label)); target = ""; label = "" }
        }) { Text("保存收藏") }
        state.profile?.favorites.orEmpty().forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${item.label} · ${item.region}/${item.type}", Modifier.weight(1f))
                TextButton(enabled = !state.busy, onClick = { launch { controller.deleteFavorite(item.id) } }) { Text("删除") }
            }
        }
    }
}

@Composable private fun ScoresPanel(state: AccountUiState, controller: AccountFeatureController, launch: (suspend () -> Unit) -> Unit) {
    var song by remember { mutableStateOf("") }; var region by remember { mutableStateOf(state.selectedBinding?.region ?: "jp") }
    var difficulty by remember { mutableStateOf("expert") }; var status by remember { mutableStateOf("clear") }; var value by remember { mutableStateOf("") }
    Panel("歌曲成绩") {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(region, { region = it }, Modifier.weight(1f), label = { Text("区服") })
            OutlinedTextField(song, { song = it }, Modifier.weight(1f), label = { Text("歌曲 ID") })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(difficulty, { difficulty = it }, Modifier.weight(1f), label = { Text("难度") })
            OutlinedTextField(status, { status = it }, Modifier.weight(1f), label = { Text("状态") })
            OutlinedTextField(value, { value = it.filter(Char::isDigit) }, Modifier.weight(1f), label = { Text("分数") })
        }
        Button(enabled = !state.busy && song.isNotBlank(), onClick = { launch { controller.saveScore(ScoreInput(region = region, songId = song, difficulty = difficulty, clearStatus = status, score = value.toIntOrNull() ?: 0)); song = "" } }) { Text("保存成绩") }
        state.profile?.scores.orEmpty().forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${item.songId} ${item.difficulty.uppercase()} · ${item.clearStatus} · ${item.score}", Modifier.weight(1f))
                TextButton(enabled = !state.busy, onClick = { launch { controller.deleteScore(item.id) } }) { Text("删除") }
            }
        }
    }
}

@Composable private fun DeckConfigsPanel(state: AccountUiState, controller: AccountFeatureController, launch: (suspend () -> Unit) -> Unit) {
    var name by remember { mutableStateOf("") }; var cards by remember { mutableStateOf("") }
    Panel("卡组配置") {
        OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("配置名") })
        OutlinedTextField(cards, { cards = it }, Modifier.fillMaxWidth(), label = { Text("1–5 个卡牌 ID，用逗号分隔") })
        Button(enabled = !state.busy && name.isNotBlank(), onClick = {
            val binding = state.selectedBinding ?: return@Button
            val ids = cards.split(',').map(String::trim).filter(String::isNotBlank).take(5)
            if (ids.isNotEmpty()) launch { controller.saveDeckConfig(DeckConfigInput(bindingId = binding.id, region = binding.region, name = name, cardIds = ids)); name = ""; cards = "" }
        }) { Text("保存配置") }
        state.profile?.deckConfigs.orEmpty().forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${item.name} · ${item.cardIds.size} 张", Modifier.weight(1f))
                TextButton(enabled = !state.busy, onClick = { launch { controller.deleteDeckConfig(item.id) } }) { Text("删除") }
            }
        }
    }
}

@Composable internal fun Panel(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
        }
    }
}
