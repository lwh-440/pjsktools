package com.pjsktools.app.feature.account
import com.pjsktools.app.feature.display.P3Button
import com.pjsktools.app.feature.display.P3OutlinedButton
import com.pjsktools.app.feature.display.P3OutlinedTextField
import com.pjsktools.app.feature.display.P3TextButton

import com.pjsktools.app.BuildConfig

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pjsktools.app.feature.display.displayCount
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/** Profile, tool-context and cross-platform account records associated with the selected UID. */
@Composable
fun AccountDataPanels(
    state: AccountUiState,
    controller: AccountFeatureController,
    launch: (suspend () -> Unit) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (BuildConfig.HARUKI_FEATURE_ENABLED) {
            HarukiConnectionPanel(state, controller, launch)
        }
        state.profileAnalysis?.let { analysis ->
            Panel("玩家档案") {
                Text(analysis.nickname ?: state.selectedBinding?.title ?: "-")
                Text("Rank ${analysis.rank ?: "-"}")
                analysis.comment?.let { Text(it) }
            }
        }
        state.toolContext?.let { context ->
            Panel("资产完整度") {
                Text("持有卡 ${displayCount(context.inventoryCount.toLong())} · 玩家数据 ${displayCount(context.playerDataKinds.size.toLong())} 类")
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

@Composable
internal fun InlineActionFeedback(
    state: AccountUiState,
    target: AccountFeedbackTarget,
    busyLabel: String,
    showUnassigned: Boolean = false
) {
    if (state.feedbackTarget != target && !(showUnassigned && state.feedbackTarget == null)) return
    when {
        state.busy -> Text(busyLabel, style = MaterialTheme.typography.bodySmall)
        state.error != null -> Text(state.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        state.message != null -> Text(state.message, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable private fun DeckRecommendPanel(state: AccountUiState, controller: AccountFeatureController, launch: (suspend () -> Unit) -> Unit) {
    var eventId by rememberSaveable { mutableStateOf("") }
    var showRaw by rememberSaveable { mutableStateOf(false) }
    Panel("绑定资产组卡") {
        P3OutlinedTextField(eventId, { eventId = it }, Modifier.fillMaxWidth(), label = { Text("活动 ID（可选）") })
        P3Button(enabled = !state.busy && state.selectedBinding != null, onClick = { launch { controller.recommendDeck(eventId) } }) { Text("使用当前 UID 推荐") }
        state.deckRecommendation?.let { recommendation ->
            deckRecommendationDisplay(recommendation.rawJson).forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
            P3TextButton(onClick = { showRaw = !showRaw }) { Text(if (showRaw) "收起完整原始结果" else "查看完整原始结果") }
            if (showRaw) SelectionContainer { Text(recommendation.rawJson, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable private fun FavoritesPanel(state: AccountUiState, controller: AccountFeatureController, launch: (suspend () -> Unit) -> Unit) {
    var type by rememberSaveable { mutableStateOf("song") }; var region by rememberSaveable { mutableStateOf(state.selectedBinding?.region ?: "jp") }
    var target by rememberSaveable { mutableStateOf("") }; var label by rememberSaveable { mutableStateOf("") }
    Panel("收藏") {
        P3OutlinedTextField(type, { type = it }, Modifier.fillMaxWidth(), label = { Text("类型") })
        P3OutlinedTextField(region, { region = it }, Modifier.fillMaxWidth(), label = { Text("区服") })
        P3OutlinedTextField(target, { target = it }, Modifier.fillMaxWidth(), label = { Text("目标 ID") })
        P3OutlinedTextField(label, { label = it }, Modifier.fillMaxWidth(), label = { Text("名称") })
        P3Button(enabled = !state.busy && target.isNotBlank() && label.isNotBlank(), onClick = {
            launch {
                controller.addFavorite(FavoriteInput(type, region, target, label))
                if (controller.state.value.feedbackTarget == AccountFeedbackTarget.FAVORITES && controller.state.value.error == null) {
                    target = ""; label = ""
                }
            }
        }) { Text("保存收藏") }
        InlineActionFeedback(state, AccountFeedbackTarget.FAVORITES, "正在保存收藏…")
        state.profile?.favorites.orEmpty().forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${item.label} · ${item.region}/${item.type}", Modifier.weight(1f))
                P3TextButton(enabled = !state.busy, onClick = { launch { controller.deleteFavorite(item.id) } }) { Text("删除") }
            }
        }
    }
}

@Composable private fun ScoresPanel(state: AccountUiState, controller: AccountFeatureController, launch: (suspend () -> Unit) -> Unit) {
    var song by rememberSaveable { mutableStateOf("") }; var region by rememberSaveable { mutableStateOf(state.selectedBinding?.region ?: "jp") }
    var difficulty by rememberSaveable { mutableStateOf("expert") }; var status by rememberSaveable { mutableStateOf("clear") }; var value by rememberSaveable { mutableStateOf("") }
    Panel("歌曲成绩") {
        P3OutlinedTextField(region, { region = it }, Modifier.fillMaxWidth(), label = { Text("区服") })
        P3OutlinedTextField(song, { song = it }, Modifier.fillMaxWidth(), label = { Text("歌曲 ID") })
        P3OutlinedTextField(difficulty, { difficulty = it }, Modifier.fillMaxWidth(), label = { Text("难度") })
        P3OutlinedTextField(status, { status = it }, Modifier.fillMaxWidth(), label = { Text("状态") })
        P3OutlinedTextField(value, { value = it.filter(Char::isDigit) }, Modifier.fillMaxWidth(), label = { Text("分数") })
        P3Button(enabled = !state.busy && song.isNotBlank(), onClick = {
            launch {
                controller.saveScore(ScoreInput(region = region, songId = song, difficulty = difficulty, clearStatus = status, score = value.toIntOrNull() ?: 0))
                if (controller.state.value.feedbackTarget == AccountFeedbackTarget.SCORES && controller.state.value.error == null) song = ""
            }
        }) { Text("保存成绩") }
        InlineActionFeedback(state, AccountFeedbackTarget.SCORES, "正在保存成绩…")
        state.profile?.scores.orEmpty().forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${item.songId} ${item.difficulty.uppercase()} · ${item.clearStatus} · ${displayCount(item.score.toLong())}", Modifier.weight(1f))
                P3TextButton(enabled = !state.busy, onClick = { launch { controller.deleteScore(item.id) } }) { Text("删除") }
            }
        }
    }
}

@Composable private fun DeckConfigsPanel(state: AccountUiState, controller: AccountFeatureController, launch: (suspend () -> Unit) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }; var cards by rememberSaveable { mutableStateOf("") }
    Panel("卡组配置") {
        P3OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("配置名") })
        P3OutlinedTextField(cards, { cards = it }, Modifier.fillMaxWidth(), label = { Text("1–5 个卡牌 ID，用逗号分隔") })
        P3Button(enabled = !state.busy && name.isNotBlank(), onClick = saveDeckConfig@{
            val binding = state.selectedBinding ?: return@saveDeckConfig
            val ids = cards.split(',').map(String::trim).filter(String::isNotBlank).take(5)
            if (ids.isNotEmpty()) launch {
                controller.saveDeckConfig(DeckConfigInput(bindingId = binding.id, region = binding.region, name = name, cardIds = ids))
                if (controller.state.value.feedbackTarget == AccountFeedbackTarget.DECKS && controller.state.value.error == null) {
                    name = ""; cards = ""
                }
            }
        }) { Text("保存配置") }
        InlineActionFeedback(state, AccountFeedbackTarget.DECKS, "正在保存配置…")
        state.profile?.deckConfigs.orEmpty().forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${item.name} · ${item.cardIds.size} 张", Modifier.weight(1f))
                P3TextButton(enabled = !state.busy, onClick = { launch { controller.deleteDeckConfig(item.id) } }) { Text("删除") }
            }
        }
    }
}

@Composable internal fun Panel(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

/** Keeps the existing response model intact while showing its usable recommendation before raw JSON. */
internal fun deckRecommendationDisplay(rawJson: String): List<String> = runCatching {
    val root = Json.parseToJsonElement(rawJson).jsonObject
    val deck = (root["recommendedDecks"] as? JsonArray)?.firstOrNull() as? JsonObject
    val cards = deck?.get("cards") as? JsonArray ?: root["recommendedCards"] as? JsonArray
    val cardLabels = buildList {
        cards?.forEachIndexed { index, element ->
            val card = element as? JsonObject ?: return@forEachIndexed
            val nested = card["card"] as? JsonObject
            val id = (nested?.get("id") as? JsonPrimitive)?.contentOrNull
                ?: (card["id"] as? JsonPrimitive)?.contentOrNull
            val name = (nested?.get("name") as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank)
                ?: (card["name"] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank)
            add(listOfNotNull(name, id?.let { "ID $it" }).joinToString(" · ").ifBlank { "卡牌 ${index + 1}" })
        }
    }
    buildList {
        if (cardLabels.isNotEmpty()) add("推荐卡牌：${cardLabels.joinToString("、")}")
        (deck?.get("totalEventBonus") as? JsonPrimitive)?.contentOrNull?.let { add("活动加成：$it") }
        (root["note"] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank)?.let { add(it) }
        (root["missingFields"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }?.takeIf { it.isNotEmpty() }?.let { missing ->
            add("资料暂缺：${missing.joinToString("、")}")
        }
        if (isEmpty()) add("服务端未提供可直接展示的推荐摘要；可查看完整原始结果。")
    }
}.getOrElse { listOf("推荐结果格式暂无法读取；可查看完整原始结果。") }
